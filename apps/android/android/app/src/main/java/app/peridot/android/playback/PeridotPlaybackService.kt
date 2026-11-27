package app.peridot.android.playback

import android.app.PendingIntent
import android.app.SearchManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.LibraryParams
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionError
import androidx.media3.session.SessionResult
import app.peridot.android.MainActivity
import app.peridot.android.R
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.SettableFuture
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject

@UnstableApi
class PeridotPlaybackService : MediaLibraryService() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val libraryScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mainHandler = Handler(Looper.getMainLooper())
    private lateinit var sessions: SessionStore
    private lateinit var playbackStore: PlaybackStore
    private lateinit var offlineStore: OfflineStore
    private lateinit var api: PeridotApiClient
    private lateinit var player: ExoPlayer
    private lateinit var librarySession: MediaLibrarySession
    private var activeTracks: Map<String, TrackSnapshot> = emptyMap()
    private var activeQueue: PlaybackQueue? = null
    private var lastError: String? = null
    private var playbackStartRetries = 0
    private var playbackStartedTrackId: String? = null
    private val unavailableTrackIds = linkedSetOf<String>()
    private val trackParents = mutableMapOf<String, String>()
    private var trackParentScope: String? = null

    private val publishProgress = object : Runnable {
        override fun run() {
            publishSnapshot()
            mainHandler.postDelayed(this, 1_000)
        }
    }

    private val playerListener = object : Player.Listener {
        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            lastError = null
            playbackStartRetries = 0
            playbackStartedTrackId = null
            publishSnapshot()
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            if (isPlaying) {
                playbackStartRetries = 0
                playbackStartedTrackId = player.currentMediaItem?.mediaId?.substringAfter(':')
            }
            publishSnapshot()
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            publishSnapshot()
        }

        override fun onPlayerError(error: PlaybackException) {
            val failedTrackId = player.currentMediaItem?.mediaId?.substringAfter(':')
            if (failedTrackId != null && playbackStartedTrackId != failedTrackId) {
                val nextRetry = PlaybackStartRetryPolicy.nextRetryCount(playbackStartRetries)
                if (nextRetry != null) {
                    playbackStartRetries = nextRetry
                    lastError = null
                    player.prepare()
                    publishSnapshot()
                    return
                }
            }
            if (failedTrackId != null && skipFailedTrack(failedTrackId)) {
                publishSnapshot()
                return
            }
            lastError = error.message ?: "Playback failed."
            publishSnapshot()
        }
    }

    override fun onCreate() {
        super.onCreate()
        createPlaybackNotificationChannel()
        setMediaNotificationProvider(
            DefaultMediaNotificationProvider.Builder(this)
                .setChannelId(PLAYBACK_NOTIFICATION_CHANNEL_ID)
                .setChannelName(R.string.playback_notification_channel_name)
                .build()
                .apply { setSmallIcon(R.drawable.ic_stat_peridot) },
        )
        sessions = SessionStore(this)
        playbackStore = PlaybackStore(this)
        offlineStore = OfflineStore(this)
        api = PeridotApiClient(sessions)

        val resolver = ResolvingDataSource.Resolver { dataSpec -> resolveTrackDataSpec(dataSpec) }
        val httpDataSource = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
        val mediaSourceFactory = DefaultMediaSourceFactory(
            ResolvingDataSource.Factory(httpDataSource, resolver),
        )
        player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(mediaSourceFactory)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                true,
            )
            .setHandleAudioBecomingNoisy(true)
            .build()
        player.addListener(playerListener)

        val callback = object : MediaLibrarySession.Callback {
            override fun onGetLibraryRoot(
                session: MediaLibrarySession,
                browser: MediaSession.ControllerInfo,
                params: LibraryParams?,
            ): ListenableFuture<LibraryResult<MediaItem>> =
                Futures.immediateFuture(LibraryResult.ofItem(rootItem(), params))

            override fun onGetItem(
                session: MediaLibrarySession,
                browser: MediaSession.ControllerInfo,
                mediaId: String,
            ): ListenableFuture<LibraryResult<MediaItem>> {
                val result = SettableFuture.create<LibraryResult<MediaItem>>()
                libraryScope.launch {
                    try {
                        val item = loadLibraryItem(mediaId)
                        result.set(
                            if (item == null) {
                                LibraryResult.ofError(SessionError.ERROR_BAD_VALUE)
                            } else {
                                LibraryResult.ofItem(item, null)
                            },
                        )
                    } catch (error: Throwable) {
                        result.set(LibraryResult.ofError(libraryErrorCode(error)))
                    }
                }
                return result
            }

            override fun onGetChildren(
                session: MediaLibrarySession,
                browser: MediaSession.ControllerInfo,
                parentId: String,
                page: Int,
                pageSize: Int,
                params: LibraryParams?,
            ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> =
                loadChildren(parentId, page, pageSize, params)

            override fun onGetSearchResult(
                session: MediaLibrarySession,
                browser: MediaSession.ControllerInfo,
                query: String,
                page: Int,
                pageSize: Int,
                params: LibraryParams?,
            ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
                val result = SettableFuture.create<LibraryResult<ImmutableList<MediaItem>>>()
                libraryScope.launch {
                    try {
                        val items = pageItems(
                            api.search(query).map(::browseItem),
                            page,
                            pageSize,
                        )
                        result.set(
                            LibraryResult.ofItemList(ImmutableList.copyOf(items), params),
                        )
                    } catch (error: Throwable) {
                        result.set(LibraryResult.ofError(libraryErrorCode(error)))
                    }
                }
                return result
            }

            override fun onAddMediaItems(
                mediaSession: MediaSession,
                controller: MediaSession.ControllerInfo,
                mediaItems: List<MediaItem>,
            ): ListenableFuture<List<MediaItem>> {
                val result = SettableFuture.create<List<MediaItem>>()
                libraryScope.launch {
                    try {
                        result.set(
                            mediaItems.flatMap(::resolveAddedMediaItems),
                        )
                    } catch (error: Throwable) {
                        result.setException(error)
                    }
                }
                return result
            }

            override fun onSetMediaItems(
                mediaSession: MediaSession,
                controller: MediaSession.ControllerInfo,
                mediaItems: List<MediaItem>,
                startIndex: Int,
                startPositionMs: Long,
            ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
                val result =
                    SettableFuture.create<MediaSession.MediaItemsWithStartPosition>()
                libraryScope.launch {
                    try {
                        result.set(
                            resolveSetMediaItems(
                                mediaItems,
                                startIndex,
                                startPositionMs,
                            ),
                        )
                    } catch (error: Throwable) {
                        result.setException(error)
                    }
                }
                return result
            }

            override fun onPlaybackResumption(
                mediaSession: MediaSession,
                controller: MediaSession.ControllerInfo,
                isForPlayback: Boolean,
            ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
                val queue = playbackStore.readQueue() ?: return Futures.immediateFailedFuture(
                    IllegalStateException("No saved playback queue."),
                )
                val items = playableItems(queue.tracks)
                val activeIndex =
                    queue.tracks.indexOfFirst { it.id == queue.activeTrackId }.coerceAtLeast(0)
                return Futures.immediateFuture(
                    MediaSession.MediaItemsWithStartPosition(
                        items,
                        activeIndex,
                        queue.positionMs,
                    ),
                )
            }

            override fun onCustomCommand(
                session: MediaSession,
                controller: MediaSession.ControllerInfo,
                customCommand: SessionCommand,
                args: android.os.Bundle,
            ): ListenableFuture<SessionResult> =
                Futures.immediateFuture(SessionResult(SessionError.ERROR_NOT_SUPPORTED))
        }

        val sessionActivity = PendingIntent.getActivity(
            this,
            0,
            playerActivityIntent(this),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        librarySession = MediaLibrarySession.Builder(this, player, callback)
            .setSessionActivity(sessionActivity)
            .build()
        restoreQueue()
        mainHandler.post(publishProgress)
    }

    private fun createPlaybackNotificationChannel() {
        val channel = NotificationChannel(
            PLAYBACK_NOTIFICATION_CHANNEL_ID,
            getString(R.string.playback_notification_channel_name),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = getString(R.string.playback_notification_channel_description)
            setShowBadge(false)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        getSystemService(NotificationManager::class.java)
            .createNotificationChannel(channel)
    }

    override fun onGetSession(
        controllerInfo: MediaSession.ControllerInfo,
    ): MediaLibrarySession = librarySession

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val result = super.onStartCommand(intent, flags, startId)
        if (intent != null) handleCommand(intent)
        return result
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(publishProgress)
        player.removeListener(playerListener)
        player.release()
        librarySession.release()
        libraryScope.cancel()
        serviceScope.cancel()
        super.onDestroy()
    }

    private fun restoreQueue() {
        val queue = playbackStore.readQueue() ?: return
        activeQueue = queue
        activeTracks = queue.tracks.associateBy(TrackSnapshot::id)
        replaceQueue(queue, prepare = false)
    }

    private fun skipFailedTrack(failedTrackId: String): Boolean {
        val currentIndex = player.currentMediaItemIndex
        if (currentIndex == C.INDEX_UNSET) return false
        unavailableTrackIds += failedTrackId
        val nextIndex = PlaybackSkipPolicy.nextIndexWithoutWrapping(
            currentIndex = currentIndex,
            repeatMode = player.repeatMode,
            setRepeatMode = { player.repeatMode = it },
            getNextIndex = { player.nextMediaItemIndex },
        ) ?: return false
        val nextTrackId = player.getMediaItemAt(nextIndex).mediaId.substringAfter(':')
        if (nextTrackId == failedTrackId) return false

        lastError = null
        playbackStartRetries = 0
        playbackStartedTrackId = null
        player.seekTo(nextIndex, 0L)
        player.prepare()
        player.play()
        return true
    }

    private fun handleCommand(intent: Intent) {
        when (intent.action) {
            ACTION_REPLACE_QUEUE -> {
                val queueJson = intent.getStringExtra(EXTRA_QUEUE) ?: return
                val queue = runCatching {
                    PlaybackQueue.fromJson(JSONObject(queueJson))
                }.getOrNull() ?: return
                activeQueue = queue
                activeTracks = queue.tracks.associateBy(TrackSnapshot::id)
                playbackStore.saveQueue(queue)
                replaceQueue(queue, prepare = true)
            }

            ACTION_PLAY -> {
                if (player.mediaItemCount == 0) restoreQueue()
                lastError = null
                playbackStartRetries = 0
                playbackStartedTrackId = null
                player.play()
                publishSnapshot()
            }

            ACTION_PAUSE -> {
                player.pause()
                publishSnapshot()
            }

            ACTION_NEXT -> {
                player.seekToNext()
                player.play()
                publishSnapshot()
            }

            ACTION_PREVIOUS -> {
                player.seekToPrevious()
                player.play()
                publishSnapshot()
            }

            ACTION_SEEK -> {
                player.seekTo(intent.getLongExtra(EXTRA_POSITION_MS, 0L).coerceAtLeast(0L))
                publishSnapshot()
            }

            ACTION_VOLUME -> {
                player.volume = intent.getFloatExtra(EXTRA_VOLUME, 1f).coerceIn(0f, 1f)
                publishSnapshot()
            }

            ACTION_REPEAT -> {
                player.repeatMode = when (intent.getStringExtra(EXTRA_REPEAT_MODE)) {
                    "one" -> Player.REPEAT_MODE_ONE
                    "all" -> Player.REPEAT_MODE_ALL
                    else -> Player.REPEAT_MODE_OFF
                }
                publishSnapshot()
            }

            ACTION_SHUFFLE -> {
                player.shuffleModeEnabled = intent.getBooleanExtra(EXTRA_SHUFFLE, false)
                publishSnapshot()
            }

            ACTION_CLEAR -> {
                player.stop()
                player.clearMediaItems()
                activeQueue = null
                activeTracks = emptyMap()
                lastError = null
                unavailableTrackIds.clear()
                synchronized(trackParents) {
                    trackParents.clear()
                    trackParentScope = null
                }
                api.clearCachedSession()
                playbackStore.clear()
                publishSnapshot()
                stopSelf()
            }

            ACTION_MEDIA_PLAY_FROM_SEARCH -> {
                val query = intent.getStringExtra(SearchManager.QUERY)?.trim().orEmpty()
                if (query.isNotEmpty()) searchAndPlay(query)
            }
        }
    }

    private fun searchAndPlay(query: String) {
        libraryScope.launch {
            val tracks = runCatching {
                api.search(query).mapNotNull(BrowseEntry::track).take(50)
            }.getOrElse { return@launch }
            if (tracks.isEmpty()) return@launch
            val queue = PlaybackQueue(
                tracks = tracks,
                activeTrackId = tracks.first().id,
                playing = true,
                volume = player.volume,
                repeatMode = when (player.repeatMode) {
                    Player.REPEAT_MODE_ONE -> "one"
                    Player.REPEAT_MODE_ALL -> "all"
                    else -> "off"
                },
                shuffleEnabled = player.shuffleModeEnabled,
            )
            mainHandler.post {
                activeQueue = queue
                activeTracks = tracks.associateBy(TrackSnapshot::id)
                playbackStore.saveQueue(queue)
                replaceQueue(queue, prepare = true)
            }
        }
    }

    private fun replaceQueue(queue: PlaybackQueue, prepare: Boolean) {
        lastError = null
        playbackStartRetries = 0
        playbackStartedTrackId = null
        val items = playableItems(queue.tracks)
        if (items.isEmpty()) {
            player.clearMediaItems()
            publishSnapshot()
            return
        }
        val activeIndex =
            queue.tracks.indexOfFirst { it.id == queue.activeTrackId }.coerceAtLeast(0)
        player.repeatMode = when (queue.repeatMode) {
            "one" -> Player.REPEAT_MODE_ONE
            "all" -> Player.REPEAT_MODE_ALL
            else -> Player.REPEAT_MODE_OFF
        }
        player.shuffleModeEnabled = queue.shuffleEnabled
        player.volume = queue.volume
        player.setMediaItems(items, activeIndex, queue.positionMs.coerceAtLeast(0))
        if (prepare) {
            player.prepare()
            player.playWhenReady = queue.playing
        }
        publishSnapshot()
    }

    private fun loadChildren(
        parentId: String,
        page: Int,
        pageSize: Int,
        params: LibraryParams?,
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
        val result = SettableFuture.create<LibraryResult<ImmutableList<MediaItem>>>()
        libraryScope.launch {
            try {
                val allItems = when {
                    parentId == ROOT_ID -> rootChildren()
                    parentId == QUEUE_ID -> queueItems()
                    parentId == LIKED_ID -> collectionItems(LIKED_ID)
                    parentId == ALBUMS_ID -> api.albums().map(::browseItem)
                    parentId == ARTISTS_ID -> api.artists().map(::browseItem)
                    parentId == PLAYLISTS_ID -> api.playlists().map(::browseItem)
                    isCollectionId(parentId) -> collectionItems(parentId)
                    else -> emptyList()
                }
                val items = pageItems(allItems, page, pageSize)
                result.set(
                    LibraryResult.ofItemList(ImmutableList.copyOf(items), params),
                )
            } catch (error: Throwable) {
                result.set(LibraryResult.ofError(libraryErrorCode(error)))
            }
        }
        return result
    }

    private fun rootChildren(): List<MediaItem> = listOf(
        browseNode(
            LIKED_ID,
            getString(R.string.auto_liked_tracks),
            getString(R.string.auto_liked_tracks_description),
        ),
        browseNode(
            ALBUMS_ID,
            getString(R.string.auto_albums),
            getString(R.string.auto_albums_description),
        ),
        browseNode(
            PLAYLISTS_ID,
            getString(R.string.auto_playlists),
            getString(R.string.auto_playlists_description),
        ),
        browseNode(
            ARTISTS_ID,
            getString(R.string.auto_artists),
            getString(R.string.auto_artists_description),
        ),
        browseNode(
            QUEUE_ID,
            getString(R.string.auto_queue),
            getString(R.string.auto_queue_description),
        ),
    )

    private fun queueItems(): List<MediaItem> =
        playableItems(activeQueue?.tracks.orEmpty())

    private fun loadLibraryItem(mediaId: String): MediaItem? = when {
        mediaId == ROOT_ID -> rootItem()
        mediaId == QUEUE_ID -> browseNode(
            QUEUE_ID,
            getString(R.string.auto_queue),
            getString(R.string.auto_queue_description),
        )
        mediaId == LIKED_ID -> browseNode(
            LIKED_ID,
            getString(R.string.auto_liked_tracks),
            getString(R.string.auto_liked_tracks_description),
        )
        mediaId == ALBUMS_ID -> browseNode(
            ALBUMS_ID,
            getString(R.string.auto_albums),
            getString(R.string.auto_albums_description),
        )
        mediaId == PLAYLISTS_ID -> browseNode(
            PLAYLISTS_ID,
            getString(R.string.auto_playlists),
            getString(R.string.auto_playlists_description),
        )
        mediaId == ARTISTS_ID -> browseNode(
            ARTISTS_ID,
            getString(R.string.auto_artists),
            getString(R.string.auto_artists_description),
        )
        mediaId.startsWith("$ALBUM_PREFIX:") ->
            api.album(mediaId.substringAfter(':').takeIf(String::isNotBlank) ?: return null)
                ?.let(::browseItem)
        mediaId.startsWith("$ARTIST_PREFIX:") ->
            api.artist(mediaId.substringAfter(':').takeIf(String::isNotBlank) ?: return null)
                ?.let(::browseItem)
        mediaId.startsWith("$PLAYLIST_PREFIX:") ->
            api.playlist(mediaId.substringAfter(':').takeIf(String::isNotBlank) ?: return null)
                ?.let(::browseItem)
        mediaId.startsWith("$TRACK_PREFIX:") -> {
            val trackId = mediaId.substringAfter(':').takeIf(String::isNotBlank)
            if (trackId == null) {
                null
            } else {
                val track = activeTracks[trackId] ?: api.track(trackId)
                if (!hasPlayableSource(track)) {
                    null
                } else {
                    playableItem(track, trackParent(mediaId))
                }
            }
        }
        else -> null
    }

    private fun rootItem(): MediaItem =
        browseNode(
            ROOT_ID,
            getString(R.string.auto_root_title),
            getString(R.string.auto_root_description),
        )

    private fun browseNode(id: String, title: String, subtitle: String): MediaItem =
        MediaItem.Builder()
            .setMediaId(id)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(title)
                    .setArtist(subtitle)
                    .setIsBrowsable(true)
                    .setIsPlayable(false)
                    .build(),
            )
            .build()

    private fun browseItem(entry: BrowseEntry): MediaItem {
        entry.track?.let { return playableItem(it) }
        val artwork = entry.coverUrl?.let(Uri::parse)
        val isCollection =
            entry.id.startsWith("$ALBUM_PREFIX:") ||
                entry.id.startsWith("$PLAYLIST_PREFIX:") ||
                entry.id.startsWith("$ARTIST_PREFIX:")
        val mediaType = when {
            entry.id.startsWith("$ALBUM_PREFIX:") -> MediaMetadata.MEDIA_TYPE_ALBUM
            entry.id.startsWith("$PLAYLIST_PREFIX:") -> MediaMetadata.MEDIA_TYPE_PLAYLIST
            entry.id.startsWith("$ARTIST_PREFIX:") -> MediaMetadata.MEDIA_TYPE_ARTIST
            else -> MediaMetadata.MEDIA_TYPE_MIXED
        }
        return MediaItem.Builder()
            .setMediaId(entry.id)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(entry.title)
                    .setArtist(entry.subtitle)
                    .setArtworkUri(artwork)
                    .setMediaType(mediaType)
                    .setIsBrowsable(true)
                    .setIsPlayable(isCollection)
                    .build(),
            )
            .build()
    }

    private fun playableItems(
        tracks: List<TrackSnapshot>,
        parentId: String? = null,
    ): List<MediaItem> =
        tracks
            .filter(::hasPlayableSource)
            .map { playableItem(it, parentId) }

    private fun hasPlayableSource(track: TrackSnapshot): Boolean {
        if (track.available) return true
        val session = sessions.read() ?: return false
        return offlineStore.audioFile(session, track.id).isFile
    }

    private fun playableItem(
        track: TrackSnapshot,
        parentId: String? = null,
    ): MediaItem {
        val artwork = track.coverUrl?.let(Uri::parse)
        val metadata = MediaMetadata.Builder()
            .setTitle(track.title)
            .setArtist(track.artist)
            .setAlbumTitle(track.album)
            .setArtworkUri(artwork)
            .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
            .setIsBrowsable(false)
            .setIsPlayable(true)
        track.durationMs?.takeIf { it > 0 }?.let(metadata::setDurationMs)
        if (parentId != null) {
            metadata.setExtras(
                Bundle().apply {
                    putString(EXTRA_TRACK_PARENT, parentId)
                },
            )
        }
        return MediaItem.Builder()
            .setMediaId("$TRACK_PREFIX:${track.id}")
            .setUri(trackDataSourceUri(track.id))
            .setMimeType(track.mimeType)
            .setMediaMetadata(metadata.build())
            .build()
    }

    private fun collectionItems(parentId: String): List<MediaItem> {
        val tracks = collectionTracks(parentId)
        rememberTrackParents(parentId, tracks)
        return playableItems(tracks, parentId)
    }

    private fun collectionTracks(parentId: String): List<TrackSnapshot> = when {
        parentId == LIKED_ID -> api.likedTracks()
        parentId.startsWith("$ALBUM_PREFIX:") ->
            api.albumTracks(parentId.substringAfter(':'))
        parentId.startsWith("$PLAYLIST_PREFIX:") ->
            api.playlistTracks(parentId.substringAfter(':'))
        parentId.startsWith("$ARTIST_PREFIX:") ->
            api.artistTracks(parentId.substringAfter(':'))
        else -> emptyList()
    }

    private fun collectionPlayback(
        parentId: String,
        requestedTrackId: String?,
    ): Pair<List<MediaItem>, Int> {
        val tracks = collectionTracks(parentId).filter(::hasPlayableSource)
        rememberTrackParents(parentId, tracks)
        val items = tracks.map { playableItem(it, parentId) }
        val index = requestedTrackId
            ?.let { trackId -> tracks.indexOfFirst { it.id == trackId } }
            ?.takeIf { it >= 0 }
            ?: 0
        return items to index
    }

    private fun resolveAddedMediaItems(item: MediaItem): List<MediaItem> {
        if (isCollectionId(item.mediaId)) {
            return collectionItems(item.mediaId)
        }
        return listOfNotNull(resolvePlayableItem(item))
    }

    private fun resolveSetMediaItems(
        mediaItems: List<MediaItem>,
        startIndex: Int,
        startPositionMs: Long,
    ): MediaSession.MediaItemsWithStartPosition {
        if (mediaItems.size == 1) {
            val requested = mediaItems.single()
            val requestedTrackId = requested.mediaId
                .takeIf { it.startsWith("$TRACK_PREFIX:") }
                ?.substringAfter(':')
            val parentId = if (isCollectionId(requested.mediaId)) {
                requested.mediaId
            } else {
                trackParent(requested)
            }
            if (parentId != null) {
                val (items, index) = collectionPlayback(parentId, requestedTrackId)
                if (items.isNotEmpty()) {
                    return MediaSession.MediaItemsWithStartPosition(
                        items,
                        index,
                        startPositionMs.coerceAtLeast(0),
                    )
                }
            }
            val resolved = listOfNotNull(resolvePlayableItem(requested))
            return MediaSession.MediaItemsWithStartPosition(
                resolved,
                0,
                startPositionMs.coerceAtLeast(0),
            )
        }

        val resolved = mediaItems.flatMap(::resolveAddedMediaItems)
        val index = startIndex.coerceIn(0, (resolved.size - 1).coerceAtLeast(0))
        return MediaSession.MediaItemsWithStartPosition(
            resolved,
            index,
            startPositionMs.coerceAtLeast(0),
        )
    }

    private fun resolvePlayableItem(item: MediaItem): MediaItem? {
        if (item.localConfiguration != null) return item
        if (!item.mediaId.startsWith("$TRACK_PREFIX:")) return null
        val trackId = item.mediaId.substringAfter(':').takeIf(String::isNotBlank)
            ?: return null
        val track = activeTracks[trackId] ?: api.track(trackId)
        if (!hasPlayableSource(track)) return null
        return playableItem(track, trackParent(item))
    }

    private fun rememberTrackParents(
        parentId: String,
        tracks: List<TrackSnapshot>,
    ) {
        val scope = sessionScope() ?: return
        synchronized(trackParents) {
            if (trackParentScope != scope) {
                trackParents.clear()
                trackParentScope = scope
            }
            tracks.forEach { track ->
                trackParents["$TRACK_PREFIX:${track.id}"] = parentId
            }
        }
    }

    private fun trackParent(mediaItem: MediaItem): String? {
        val metadataParent = mediaItem.mediaMetadata.extras
            ?.getString(EXTRA_TRACK_PARENT)
            ?.takeIf(String::isNotBlank)
        if (metadataParent != null) return metadataParent
        return trackParent(mediaItem.mediaId)
    }

    private fun trackParent(mediaId: String): String? {
        val scope = sessionScope() ?: return null
        return synchronized(trackParents) {
            if (trackParentScope == scope) trackParents[mediaId] else null
        }
    }

    private fun sessionScope(): String? =
        sessions.read()?.let { "${it.serverAddress}|${it.userId}" }

    private fun isCollectionId(mediaId: String): Boolean =
        mediaId == LIKED_ID ||
            mediaId.startsWith("$ALBUM_PREFIX:") ||
            mediaId.startsWith("$PLAYLIST_PREFIX:") ||
            mediaId.startsWith("$ARTIST_PREFIX:")

    private fun libraryErrorCode(error: Throwable): Int = when (error) {
        is SessionExpiredException -> SessionError.ERROR_SESSION_AUTHENTICATION_EXPIRED
        is LibraryRequestException -> when (error.statusCode) {
            400, 404, 410 -> SessionError.ERROR_BAD_VALUE
            403 -> SessionError.ERROR_PERMISSION_DENIED
            else -> SessionError.ERROR_IO
        }
        else -> SessionError.ERROR_IO
    }

    private fun <T> pageItems(
        items: List<T>,
        page: Int,
        pageSize: Int,
    ): List<T> {
        if (page < 0 || pageSize <= 0) return emptyList()
        val start = page.toLong() * pageSize.toLong()
        if (start >= items.size) return emptyList()
        val end = (start + pageSize.toLong()).coerceAtMost(items.size.toLong())
        return items.subList(start.toInt(), end.toInt())
    }

    private fun resolveTrackDataSpec(dataSpec: DataSpec): DataSpec {
        val trackId = dataSpec.uri.pathSegments.lastOrNull()
            ?: throw IOException("Track URL is invalid.")
        val session = sessions.read() ?: throw SessionExpiredException()
        val localFile = offlineStore.audioFile(session, trackId)
        if (localFile.isFile) {
            return dataSpec.withUri(Uri.fromFile(localFile))
        }
        return dataSpec.withUri(Uri.parse(api.playbackUrl(trackId)))
    }

    private fun publishSnapshot() {
        val current = player.currentMediaItem
        val trackId = current?.mediaId?.substringAfter(':')
        val position = player.currentPosition.coerceAtLeast(0)
        val duration = player.duration.takeIf { it > 0 && it != C.TIME_UNSET } ?: 0
        val tracks = (activeQueue?.tracks ?: emptyList())
            .associateBy(TrackSnapshot::id)
            .toMutableMap()
        activeTracks.forEach { (id, track) -> tracks.putIfAbsent(id, track) }
        val snapshot = PlaybackSnapshot(
            trackIds = player.currentTimeline.let { timeline ->
                buildList {
                    for (index in 0 until timeline.windowCount) {
                        add(player.getMediaItemAt(index).mediaId.substringAfter(':'))
                    }
                }
            },
            tracks = tracks.values.toList(),
            unavailableTrackIds = unavailableTrackIds.toList(),
            activeTrackId = trackId,
            playing = playbackControlActive(
                playWhenReady = player.playWhenReady,
                playbackState = player.playbackState,
                hasError = lastError != null,
            ),
            loading = player.playbackState == Player.STATE_BUFFERING,
            positionMs = if (position == C.TIME_UNSET) 0 else position,
            durationMs = duration,
            volume = player.volume,
            repeatMode = when (player.repeatMode) {
                Player.REPEAT_MODE_ONE -> "one"
                Player.REPEAT_MODE_ALL -> "all"
                else -> "off"
            },
            shuffleEnabled = player.shuffleModeEnabled,
            shuffleTrackIds = activeQueue?.shuffleTrackIds.orEmpty(),
            error = lastError,
        )
        playbackStore.saveSnapshot(snapshot)
        val currentQueue = activeQueue
        if (currentQueue != null) {
            playbackStore.saveQueue(
                currentQueue.copy(
                    activeTrackId = trackId,
                    positionMs = snapshot.positionMs,
                    playing = snapshot.playing,
                    volume = snapshot.volume,
                    repeatMode = snapshot.repeatMode,
                    shuffleEnabled = snapshot.shuffleEnabled,
                )
            )
        }
        PlaybackEventBus.publish(snapshot)
    }

    private fun trackDataSourceUri(trackId: String): Uri =
        Uri.Builder()
            .scheme("peridot-track")
            .authority("track")
            .appendPath(trackId)
            .build()

    companion object {
        const val ACTION_REPLACE_QUEUE = "app.peridot.android.action.REPLACE_QUEUE"
        const val ACTION_PLAY = "app.peridot.android.action.PLAY"
        const val ACTION_PAUSE = "app.peridot.android.action.PAUSE"
        const val ACTION_NEXT = "app.peridot.android.action.NEXT"
        const val ACTION_PREVIOUS = "app.peridot.android.action.PREVIOUS"
        const val ACTION_SEEK = "app.peridot.android.action.SEEK"
        const val ACTION_VOLUME = "app.peridot.android.action.VOLUME"
        const val ACTION_REPEAT = "app.peridot.android.action.REPEAT"
        const val ACTION_SHUFFLE = "app.peridot.android.action.SHUFFLE"
        const val ACTION_CLEAR = "app.peridot.android.action.CLEAR"
        const val ACTION_MEDIA_PLAY_FROM_SEARCH =
            "android.media.action.MEDIA_PLAY_FROM_SEARCH"
        const val EXTRA_QUEUE = "queue"
        const val EXTRA_POSITION_MS = "positionMs"
        const val EXTRA_VOLUME = "volume"
        const val EXTRA_REPEAT_MODE = "repeatMode"
        const val EXTRA_SHUFFLE = "shuffle"
        const val EXTRA_TRACK_PARENT =
            "app.peridot.android.playback.TRACK_PARENT"

        const val ROOT_ID = "root"
        const val QUEUE_ID = "queue"
        const val LIKED_ID = "liked"
        const val ALBUMS_ID = "albums"
        const val ARTISTS_ID = "artists"
        const val PLAYLISTS_ID = "playlists"
        const val TRACK_PREFIX = "track"
        const val ALBUM_PREFIX = "album"
        const val ARTIST_PREFIX = "artist"
        const val PLAYLIST_PREFIX = "playlist"
        const val PLAYBACK_NOTIFICATION_CHANNEL_ID = "peridot_playback"
        const val PLAYER_DEEP_LINK = "peridot://player"

        fun playerActivityIntent(context: Context): Intent =
            Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                data = Uri.parse(PLAYER_DEEP_LINK)
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
            }

        fun command(context: Context, action: String, configure: Intent.() -> Unit = {}) {
            val intent = Intent(context, PeridotPlaybackService::class.java).apply {
                this.action = action
                configure()
            }
            context.startService(intent)
        }
    }
}
