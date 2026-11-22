package app.peridot.android.playback

import android.content.ComponentName
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

@CapacitorPlugin(name = "PeridotMedia")
@UnstableApi
class PeridotMediaPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var sessions: SessionStore
    private lateinit var playbackStore: PlaybackStore
    private lateinit var offlineStore: OfflineStore
    private lateinit var api: PeridotApiClient
    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var unsubscribe: (() -> Unit)? = null

    override fun load() {
        val context = context.applicationContext
        sessions = SessionStore(context)
        playbackStore = PlaybackStore(context)
        offlineStore = OfflineStore(context)
        api = PeridotApiClient(sessions)
        unsubscribe = PlaybackEventBus.subscribe { snapshot ->
            notifyListeners(
                "playbackStateChanged",
                JSObject().put("snapshot", JSObject(snapshot.toJson().toString())),
            )
        }
        connectPlaybackController()
    }

    override fun handleOnDestroy() {
        unsubscribe?.invoke()
        unsubscribe = null
        controllerFuture?.let { MediaController.releaseFuture(it) }
        controllerFuture = null
        scope.cancel()
        super.handleOnDestroy()
    }

    private fun connectPlaybackController() {
        val token = SessionToken(
            context,
            ComponentName(context, PeridotPlaybackService::class.java),
        )
        // Raw service intents need a connected controller to publish platform media controls.
        controllerFuture = MediaController.Builder(context, token).buildAsync()
    }

    @PluginMethod
    fun initializeSession(call: PluginCall) {
        val serverAddress = call.getString("serverAddress")
        val token = call.getString("token")
        val userId = call.getString("userId")
        if (serverAddress.isNullOrBlank() || token.isNullOrBlank() || userId.isNullOrBlank()) {
            call.reject("A server address, session token, and user ID are required.")
            return
        }
        val previous = sessions.read()
        if (
            previous != null &&
            (previous.serverAddress != serverAddress.trimEnd('/') ||
                previous.userId != userId)
        ) {
            offlineStore.clear(previous)
            playbackStore.clear()
        }
        sessions.save(serverAddress, token, userId)
        call.resolve()
    }

    @PluginMethod
    fun clearSession(call: PluginCall) {
        sessions.read()?.let(offlineStore::clear)
        sessions.clear()
        playbackStore.clear()
        PeridotPlaybackService.command(context, PeridotPlaybackService.ACTION_CLEAR)
        call.resolve()
    }

    @PluginMethod
    fun replaceQueue(call: PluginCall) {
        val queue = call.getObject("queue")
        if (queue == null) {
            call.reject("A playback queue is required.")
            return
        }
        PeridotPlaybackService.command(
            context,
            PeridotPlaybackService.ACTION_REPLACE_QUEUE,
        ) {
            putExtra(PeridotPlaybackService.EXTRA_QUEUE, queue.toString())
        }
        call.resolve()
    }

    @PluginMethod
    fun play(call: PluginCall) {
        PeridotPlaybackService.command(context, PeridotPlaybackService.ACTION_PLAY)
        call.resolve()
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        PeridotPlaybackService.command(context, PeridotPlaybackService.ACTION_PAUSE)
        call.resolve()
    }

    @PluginMethod
    fun next(call: PluginCall) {
        PeridotPlaybackService.command(context, PeridotPlaybackService.ACTION_NEXT)
        call.resolve()
    }

    @PluginMethod
    fun previous(call: PluginCall) {
        PeridotPlaybackService.command(context, PeridotPlaybackService.ACTION_PREVIOUS)
        call.resolve()
    }

    @PluginMethod
    fun seek(call: PluginCall) {
        PeridotPlaybackService.command(context, PeridotPlaybackService.ACTION_SEEK) {
            putExtra(
                PeridotPlaybackService.EXTRA_POSITION_MS,
                ((call.getDouble("positionSeconds") ?: 0.0) * 1000).toLong(),
            )
        }
        call.resolve()
    }

    @PluginMethod
    fun setVolume(call: PluginCall) {
        PeridotPlaybackService.command(context, PeridotPlaybackService.ACTION_VOLUME) {
            putExtra(
                PeridotPlaybackService.EXTRA_VOLUME,
                (call.getFloat("volume") ?: 1f).coerceIn(0f, 1f),
            )
        }
        call.resolve()
    }

    @PluginMethod
    fun setRepeat(call: PluginCall) {
        PeridotPlaybackService.command(context, PeridotPlaybackService.ACTION_REPEAT) {
            putExtra(
                PeridotPlaybackService.EXTRA_REPEAT_MODE,
                call.getString("mode") ?: "off",
            )
        }
        call.resolve()
    }

    @PluginMethod
    fun setShuffle(call: PluginCall) {
        PeridotPlaybackService.command(context, PeridotPlaybackService.ACTION_SHUFFLE) {
            putExtra(
                PeridotPlaybackService.EXTRA_SHUFFLE,
                call.getBoolean("enabled") ?: false,
            )
        }
        call.resolve()
    }

    @PluginMethod
    fun getSnapshot(call: PluginCall) {
        val snapshot = playbackStore.readSnapshot()
        val response = JSObject()
        if (snapshot == null) {
            response.put("snapshot", null)
        } else {
            response.put("snapshot", JSObject(snapshot.toJson().toString()))
        }
        call.resolve(response)
    }

    @PluginMethod
    fun cacheTrack(call: PluginCall) {
        val trackJson = call.getObject("track")
        if (trackJson == null) {
            call.reject("Track metadata is required.")
            return
        }
        val track = runCatching {
            TrackSnapshot.fromJson(org.json.JSONObject(trackJson.toString()))
        }.getOrElse {
            call.reject("Track metadata is invalid: ${it.message ?: "unknown error"}")
            return
        }
        val session = sessions.read()
        if (session == null) {
            call.reject("Connect to a Peridot server first.")
            return
        }
        val keepAlive = call
        scope.launch(Dispatchers.IO) {
            try {
                val url = api.playbackUrl(track.id)
                val cached = offlineStore.download(session, track, url) { progress ->
                    notifyListeners(
                        "offlineProgress",
                        JSObject()
                            .put("trackId", track.id)
                            .put("progress", progress),
                    )
                }
                val response = JSObject()
                    .put("track", JSObject(cached.track.toJson().toString()))
                    .put("savedAt", cached.savedAt)
                    .put("size", cached.size)
                keepAlive.resolve(response)
            } catch (error: Throwable) {
                keepAlive.reject(
                    "The track could not be saved offline.",
                    error as? Exception,
                )
            }
        }
    }

    @PluginMethod
    fun listCachedTracks(call: PluginCall) {
        val session = sessions.read()
        if (session == null) {
            call.resolve(JSObject().put("items", JSArray()))
            return
        }
        val items = JSArray()
        offlineStore.list(session).forEach { cached ->
            items.put(
                JSObject()
                    .put("track", JSObject(cached.track.toJson().toString()))
                    .put("savedAt", cached.savedAt)
                    .put("size", cached.size),
            )
        }
        call.resolve(JSObject().put("items", items))
    }

    @PluginMethod
    fun moveCachedTrack(call: PluginCall) {
        val fromTrackId = call.getString("fromTrackId")
        val savedAt = call.getString("savedAt")
        val trackJson = call.getObject("track")
        val session = sessions.read()
        if (
            fromTrackId.isNullOrBlank() ||
            savedAt.isNullOrBlank() ||
            trackJson == null ||
            session == null
        ) {
            call.reject("A connected session, track ID, metadata, and save time are required.")
            return
        }
        val track = runCatching {
            TrackSnapshot.fromJson(org.json.JSONObject(trackJson.toString()))
        }.getOrElse {
            call.reject("Track metadata is invalid: ${it.message ?: "unknown error"}")
            return
        }
        offlineStore.move(session, fromTrackId, track, savedAt)
        call.resolve()
    }

    @PluginMethod
    fun removeCachedTrack(call: PluginCall) {
        val trackId = call.getString("trackId")
        val session = sessions.read()
        if (trackId.isNullOrBlank() || session == null) {
            call.reject("A connected session and track ID are required.")
            return
        }
        offlineStore.remove(session, trackId)
        call.resolve()
    }

    @PluginMethod
    fun clearOfflineTracks(call: PluginCall) {
        sessions.read()?.let(offlineStore::clear)
        call.resolve()
    }
}
