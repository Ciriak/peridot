package app.peridot.android.playback

import android.content.Context
import androidx.core.content.edit
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import org.json.JSONObject

data class CachedTrack(
    val track: TrackSnapshot,
    val savedAt: String,
    val size: Long,
)

class OfflineStore(context: Context) {
    private val appContext = context.applicationContext
    private val preferences =
        appContext.getSharedPreferences("peridot-offline", Context.MODE_PRIVATE)

    fun download(
        session: PeridotSession,
        track: TrackSnapshot,
        audioUrl: String,
        onProgress: ((Int?) -> Unit)? = null,
    ): CachedTrack {
        val target = audioFile(session, track.id)
        target.parentFile?.mkdirs()
        val temporary = File(target.parentFile, "${target.name}.part")
        val connection = URL(audioUrl).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 15_000
            connection.readTimeout = 60_000
            connection.setRequestProperty("Accept", "audio/*")
            val status = connection.responseCode
            if (status !in 200..299) {
                throw IOException("Audio download failed with HTTP $status")
            }
            val expected = connection.contentLengthLong
            var received = 0L
            connection.inputStream.use { input ->
                temporary.outputStream().use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        output.write(buffer, 0, count)
                        received += count
                        onProgress?.invoke(
                            if (expected > 0) {
                                ((received * 100) / expected).toInt().coerceIn(0, 100)
                            } else {
                                null
                            }
                        )
                    }
                }
            }
            if (!temporary.renameTo(target)) {
                temporary.copyTo(target, overwrite = true)
                temporary.delete()
            }
            val cached = CachedTrack(
                track = track,
                savedAt = java.time.Instant.now().toString(),
                size = target.length(),
            )
            saveManifest(session, cached)
            onProgress?.invoke(100)
            return cached
        } catch (error: Throwable) {
            temporary.delete()
            throw error
        } finally {
            connection.disconnect()
        }
    }

    fun list(session: PeridotSession): List<CachedTrack> {
        val scope = scopeKey(session)
        return preferences.all.entries.mapNotNull { (key, value) ->
            if (!key.startsWith("$scope:")) return@mapNotNull null
            val json = (value as? String)?.let { runCatching { JSONObject(it) }.getOrNull() }
                ?: return@mapNotNull null
            val track = json.optJSONObject("track")?.let {
                runCatching { TrackSnapshot.fromJson(it) }.getOrNull()
            } ?: return@mapNotNull null
            CachedTrack(
                track = track,
                savedAt = json.optString("savedAt"),
                size = json.optLong("size"),
            )
        }.sortedByDescending(CachedTrack::savedAt)
    }

    fun remove(session: PeridotSession, trackId: String) {
        preferences.edit { remove("${scopeKey(session)}:$trackId") }
        audioFile(session, trackId).delete()
    }

    fun clear(session: PeridotSession) {
        val prefix = "${scopeKey(session)}:"
        preferences.edit {
            preferences.all.keys
                .filter { it.startsWith(prefix) }
                .forEach(::remove)
        }
        directory(session).deleteRecursively()
    }

    fun audioFile(session: PeridotSession, trackId: String): File {
        return File(directory(session), "${safeFileName(trackId)}.audio")
    }

    private fun saveManifest(session: PeridotSession, cached: CachedTrack) {
        val payload = JSONObject()
            .put("track", cached.track.toJson())
            .put("savedAt", cached.savedAt)
            .put("size", cached.size)
        preferences.edit {
            putString("${scopeKey(session)}:${cached.track.id}", payload.toString())
        }
    }

    private fun directory(session: PeridotSession): File =
        File(File(appContext.filesDir, "offline"), scopeKey(session))

    private fun scopeKey(session: PeridotSession): String {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest("${session.serverAddress}|${session.userId}".toByteArray())
        return digest.joinToString("") { "%02x".format(it) }.take(32)
    }

    private fun safeFileName(value: String): String =
        value.replace(Regex("[^A-Za-z0-9._-]"), "_").take(120)
}
