package app.peridot.android.playback

import org.json.JSONArray
import org.json.JSONObject

data class TrackSnapshot(
    val id: String,
    val title: String,
    val artist: String,
    val album: String? = null,
    val albumId: String? = null,
    val durationMs: Long? = null,
    val coverUrl: String? = null,
    val mimeType: String = "audio/mpeg",
    val available: Boolean = true,
    val mediaType: String = "music",
) {
    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("title", title)
        .put("artist", artist)
        .put("album", album ?: JSONObject.NULL)
        .put("albumId", albumId ?: JSONObject.NULL)
        .put("durationMs", durationMs ?: JSONObject.NULL)
        .put("coverUrl", coverUrl ?: JSONObject.NULL)
        .put("mimeType", mimeType)
        .put("available", available)
        .put("mediaType", mediaType)

    companion object {
        fun fromJson(value: JSONObject): TrackSnapshot {
            val artists = value.optJSONArray("artists")
            val artist = when {
                !value.optString("artist").isNullOrBlank() -> value.optString("artist")
                artists != null && artists.length() > 0 -> artists.optString(0)
                else -> "Unknown artist"
            }
            return TrackSnapshot(
                id = value.getString("id"),
                title = value.optString("title", "Untitled"),
                artist = artist,
                album = value.optNullableString("album"),
                albumId = value.optNullableString("albumId"),
                durationMs = value.optNullableLong("durationMs"),
                coverUrl = value.optNullableString("coverUrl"),
                mimeType = value.optString("mimeType", "audio/mpeg"),
                available = value.optBoolean("available", true),
                mediaType = value.optString("mediaType", "music"),
            )
        }
    }
}

data class PlaybackQueue(
    val tracks: List<TrackSnapshot>,
    val activeTrackId: String?,
    val positionMs: Long = 0,
    val playing: Boolean = false,
    val volume: Float = 1f,
    val repeatMode: String = "off",
    val shuffleEnabled: Boolean = false,
    val shuffleTrackIds: List<String> = emptyList(),
) {
    fun toJson(): JSONObject {
        val tracksJson = JSONArray()
        tracks.forEach { tracksJson.put(it.toJson()) }
        val shuffleJson = JSONArray()
        shuffleTrackIds.forEach(shuffleJson::put)
        return JSONObject()
            .put("tracks", tracksJson)
            .put("activeTrackId", activeTrackId ?: JSONObject.NULL)
            .put("positionMs", positionMs)
            .put("playing", playing)
            .put("volume", volume.toDouble())
            .put("repeatMode", repeatMode)
            .put("shuffleEnabled", shuffleEnabled)
            .put("shuffleTrackIds", shuffleJson)
    }

    companion object {
        fun fromJson(value: JSONObject): PlaybackQueue {
            val tracksJson = value.optJSONArray("tracks") ?: JSONArray()
            val tracks = buildList {
                for (index in 0 until tracksJson.length()) {
                    tracksJson.optJSONObject(index)?.let { add(TrackSnapshot.fromJson(it)) }
                }
            }
            val shuffleJson = value.optJSONArray("shuffleTrackIds") ?: JSONArray()
            val shuffle = buildList {
                for (index in 0 until shuffleJson.length()) {
                    shuffleJson.optString(index).takeIf(String::isNotBlank)?.let(::add)
                }
            }
            return PlaybackQueue(
                tracks = tracks,
                activeTrackId = value.optNullableString("activeTrackId"),
                positionMs = value.optLong("positionMs", 0).coerceAtLeast(0),
                playing = value.optBoolean("playing", false),
                volume = value.optDouble("volume", 1.0).toFloat().coerceIn(0f, 1f),
                repeatMode = value.optString("repeatMode", "off"),
                shuffleEnabled = value.optBoolean("shuffleEnabled", false),
                shuffleTrackIds = shuffle,
            )
        }
    }
}

data class PlaybackSnapshot(
    val trackIds: List<String>,
    val tracks: List<TrackSnapshot>,
    val unavailableTrackIds: List<String> = emptyList(),
    val activeTrackId: String?,
    val playing: Boolean,
    val loading: Boolean,
    val positionMs: Long,
    val durationMs: Long,
    val volume: Float,
    val repeatMode: String,
    val shuffleEnabled: Boolean,
    val shuffleTrackIds: List<String>,
    val error: String? = null,
) {
    fun toJson(): JSONObject {
        val tracksJson = JSONArray()
        tracks.forEach { tracksJson.put(it.toJson()) }
        val idsJson = JSONArray()
        trackIds.forEach(idsJson::put)
        val shuffleJson = JSONArray()
        shuffleTrackIds.forEach(shuffleJson::put)
        val unavailableJson = JSONArray()
        unavailableTrackIds.forEach(unavailableJson::put)
        return JSONObject()
            .put("trackIds", idsJson)
            .put("tracks", tracksJson)
            .put("unavailableTrackIds", unavailableJson)
            .put("activeTrackId", activeTrackId ?: JSONObject.NULL)
            .put("playing", playing)
            .put("loading", loading)
            .put("positionMs", positionMs)
            .put("durationMs", durationMs)
            .put("volume", volume.toDouble())
            .put("repeatMode", repeatMode)
            .put("shuffleEnabled", shuffleEnabled)
            .put("shuffleTrackIds", shuffleJson)
            .put("error", error ?: JSONObject.NULL)
    }
}

fun JSONObject.optNullableString(name: String): String? {
    if (!has(name) || isNull(name)) return null
    return optString(name).takeIf(String::isNotBlank)
}

fun JSONObject.optNullableLong(name: String): Long? {
    if (!has(name) || isNull(name)) return null
    return optLong(name)
}
