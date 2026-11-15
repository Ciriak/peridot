package app.peridot.android.playback

import android.app.PendingIntent
import android.app.SearchManager
import android.content.Context
import android.content.Intent
import android.net.Uri
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
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaLibraryService.LibraryParams
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionError
import androidx.media3.session.SessionResult
import app.peridot.android.MainActivity
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

    private val publishProgress = object : Runnable {
        override fun run() {
            publishSnapshot()
            mainHandler.postDelayed(this, 1_000)
        }
    }

    private val playerListener = object : Player.Listener {
        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            lastError = null
            publishSnapshot()
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            publishSnapshot()
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            publishSnapshot()
        }

        override fun onPlayerError(error: PlaybackException) {
            lastError = error.message ?: "Playback failed."
            publishSnapshot()
        }
    }

    override fun onCreate() {
        super.onCreate()
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
                val item = runCatching { mediaItemForId(mediaId) }.getOrElse {
                    return Futures.immediateFuture(
                        LibraryResult.ofError(SessionError.ERROR_IO),
                    )
                }
                return Futures.immediateFuture(LibraryResult.ofItem(item, null))
            }

            override fun onGetChildren(
                session: MediaLibrarySession,
                browser: MediaSession.ControllerInfo,
                parentId: String,
                page: Int,
                pageSize: Int,
                params: LibraryParams?,
            ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> =
                loadChildren(parentId, params)

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
                        val items = api.search(query).map(::browseItem)
                        result.set(
                            LibraryResult.ofItemList(ImmutableList.copyOf(items), params),
                        )
                    } catch (error: SessionExpiredException) {
                        result.set(LibraryResult.ofError(SessionError.ERROR_NOT_SUPPORTED))
                    } catch (error: Throwable) {
                        result.set(LibraryResult.ofError(SessionError.ERROR_IO))
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
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        librarySession = MediaLibrarySession.Builder(this, player, callback)
            .setSessionActivity(sessionActivity)
            .build()
        restoreQueue()
        mainHandler.post(publishProgress)
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
        params: LibraryParams?,
    ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
        val result = SettableFuture.create<LibraryResult<ImmutableList<MediaItem>>>()
        libraryScope.launch {
            try {
                val items = when {
                    parentId == ROOT_ID -> rootChildren()
                    parentId == LIKED_ID -> api.likedTracks().map(::playableItem)
                    parentId == ALBUMS_ID -> api.albums().map(::browseItem)
                    parentId == ARTISTS_ID -> api.artists().map(::browseItem)
                    parentId == PLAYLISTS_ID -> api.playlists().map(::browseItem)
                    parentId == QUEUE_ID -> queueItems()
                    parentId.startsWith("$ALBUM_PREFIX:") ->
                        api.albumTracks(parentId.substringAfter(':')).map(::playableItem)
                    parentId.startsWith("$ARTIST_PREFIX:") ->
                        api.artistTracks(parentId.substringAfter(':')).map(::playableItem)
                    parentId.startsWith("$PLAYLIST_PREFIX:") ->
                        api.playlistTracks(parentId.substringAfter(':')).map(::playableItem)
                    else -> emptyList()
                }
                result.set(
                    LibraryResult.ofItemList(ImmutableList.copyOf(items), params),
                )
            } catch (error: SessionExpiredException) {
                result.set(LibraryResult.ofError(SessionError.ERROR_NOT_SUPPORTED))
            } catch (error: Throwable) {
                result.set(LibraryResult.ofError(SessionError.ERROR_IO))
            }
        }
        return result
    }

    private fun rootChildren(): List<MediaItem> = listOf(
        browseNode(QUEUE_ID, "Queue", "Continue listening"),
        browseNode(LIKED_ID, "Liked songs", "Your favorites"),
        browseNode(ALBUMS_ID, "Albums", "Browse your collection"),
        browseNode(ARTISTS_ID, "Artists", "Browse by artist"),
        browseNode(PLAYLISTS_ID, "Playlists", "Your playlists"),
    )

    private fun queueItems(): List<MediaItem> =
        activeQueue?.tracks?.map(::playableItem).orEmpty()

    private fun mediaItemForId(mediaId: String): MediaItem = when {
        mediaId == ROOT_ID -> rootItem()
        mediaId == QUEUE_ID -> browseNode(QUEUE_ID, "Queue", "Continue listening")
        mediaId == LIKED_ID -> browseNode(LIKED_ID, "Liked songs", "Your favorites")
        mediaId == ALBUMS_ID -> browseNode(ALBUMS_ID, "Albums", "Browse your collection")
        mediaId == ARTISTS_ID -> browseNode(ARTISTS_ID, "Artists", "Browse by artist")
        mediaId == PLAYLISTS_ID -> browseNode(PLAYLISTS_ID, "Playlists", "Your playlists")
        mediaId.startsWith("$TRACK_PREFIX:") ->
            playableItem(activeTracks[mediaId.substringAfter(':')] ?: api.track(mediaId.substringAfter(':')))
        else -> browseNode(mediaId, mediaId.substringAfter(':'), "")
    }

    private fun rootItem(): MediaItem =
        browseNode(ROOT_ID, "Peridot", "Your music")

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
        return MediaItem.Builder()
            .setMediaId(entry.id)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(entry.title)
                    .setArtist(entry.subtitle)
                    .setArtworkUri(artwork)
                    .setIsBrowsable(true)
                    .setIsPlayable(false)
                    .build(),
            )
            .build()
    }

    private fun playableItems(tracks: List<TrackSnapshot>): List<MediaItem> =
        tracks.filter(TrackSnapshot::available).map(::playableItem)

    private fun playableItem(track: TrackSnapshot): MediaItem {
        val artwork = track.coverUrl?.let(Uri::parse)
        return MediaItem.Builder()
            .setMediaId("$TRACK_PREFIX:${track.id}")
            .setUri(trackDataSourceUri(track.id))
            .setMimeType(track.mimeType)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(track.title)
                    .setArtist(track.artist)
                    .setAlbumTitle(track.album)
                    .setArtworkUri(artwork)
                    .setIsBrowsable(false)
                    .setIsPlayable(true)
                    .build(),
            )
            .build()
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
            activeTrackId = trackId,
            playing = player.isPlaying,
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

        fun command(context: Context, action: String, configure: Intent.() -> Unit = {}) {
            val intent = Intent(context, PeridotPlaybackService::class.java).apply {
                this.action = action
                configure()
            }
            context.startService(intent)
        }
    }
}
