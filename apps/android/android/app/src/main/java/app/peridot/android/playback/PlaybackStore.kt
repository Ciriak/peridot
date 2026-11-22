package app.peridot.android.playback

import android.content.Context
import androidx.core.content.edit
import org.json.JSONObject

class PlaybackStore(context: Context) {
    private val preferences =
        context.applicationContext.getSharedPreferences("peridot-playback", Context.MODE_PRIVATE)

    fun readQueue(): PlaybackQueue? = preferences.getString("queue", null)?.let {
        runCatching { PlaybackQueue.fromJson(JSONObject(it)) }.getOrNull()
    }

    fun saveQueue(queue: PlaybackQueue) {
        preferences.edit { putString("queue", queue.toJson().toString()) }
    }

    fun readSnapshot(): PlaybackSnapshot? = preferences.getString("snapshot", null)?.let {
        runCatching { JSONObject(it) }.getOrNull()?.let(::snapshotFromJson)
    }

    fun saveSnapshot(snapshot: PlaybackSnapshot) {
        preferences.edit { putString("snapshot", snapshot.toJson().toString()) }
    }

    fun clear() {
        preferences.edit { clear() }
    }

    private fun snapshotFromJson(value: JSONObject): PlaybackSnapshot {
        fun stringList(name: String): List<String> {
            val array = value.optJSONArray(name) ?: return emptyList()
            return buildList {
                for (index in 0 until array.length()) add(array.optString(index))
            }
        }

        val tracksArray = value.optJSONArray("tracks")
        val tracks = buildList {
            if (tracksArray != null) {
                for (index in 0 until tracksArray.length()) {
                    tracksArray.optJSONObject(index)?.let {
                        add(TrackSnapshot.fromJson(it))
                    }
                }
            }
        }
        return PlaybackSnapshot(
            trackIds = stringList("trackIds"),
            tracks = tracks,
            unavailableTrackIds = stringList("unavailableTrackIds"),
            activeTrackId = value.optNullableString("activeTrackId"),
            playing = value.optBoolean("playing", false),
            loading = value.optBoolean("loading", false),
            positionMs = value.optLong("positionMs", 0),
            durationMs = value.optLong("durationMs", 0),
            volume = value.optDouble("volume", 1.0).toFloat(),
            repeatMode = value.optString("repeatMode", "off"),
            shuffleEnabled = value.optBoolean("shuffleEnabled", false),
            shuffleTrackIds = stringList("shuffleTrackIds"),
            error = value.optNullableString("error"),
        )
    }
}
