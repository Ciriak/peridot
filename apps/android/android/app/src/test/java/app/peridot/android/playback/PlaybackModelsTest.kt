package app.peridot.android.playback

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackModelsTest {
    @Test
    fun queueJsonRoundTripPreservesPlaybackState() {
        val queue = PlaybackQueue(
            tracks = listOf(
                TrackSnapshot(
                    id = "track-1",
                    title = "Opening",
                    artist = "Peridot",
                    album = "Local",
                    durationMs = 42_000,
                    coverUrl = "http://localhost:17430/api/covers/1",
                ),
                TrackSnapshot(
                    id = "track-2",
                    title = "Second",
                    artist = "Peridot",
                    available = false,
                ),
            ),
            activeTrackId = "track-1",
            positionMs = 12_345,
            playing = true,
            volume = 0.72f,
            repeatMode = "all",
            shuffleEnabled = true,
            shuffleTrackIds = listOf("track-2"),
        )

        val restored = PlaybackQueue.fromJson(JSONObject(queue.toJson().toString()))

        assertEquals(listOf("track-1", "track-2"), restored.tracks.map(TrackSnapshot::id))
        assertEquals("track-1", restored.activeTrackId)
        assertEquals(12_345, restored.positionMs)
        assertEquals(0.72f, restored.volume, 0.001f)
        assertEquals("all", restored.repeatMode)
        assertTrue(restored.shuffleEnabled)
        assertEquals(listOf("track-2"), restored.shuffleTrackIds)
        assertFalse(restored.tracks[1].available)
    }

    @Test
    fun trackJsonUsesArtistsFallbackAndNullableMetadata() {
        val track = TrackSnapshot.fromJson(
            JSONObject(
                """
                {
                  "id": "track-1",
                  "title": "A song",
                  "artists": ["One", "Two"],
                  "durationMs": null,
                  "album": null,
                  "available": true
                }
                """.trimIndent(),
            ),
        )

        assertEquals("One", track.artist)
        assertNull(track.durationMs)
        assertNull(track.album)
        assertEquals("music", track.mediaType)
    }
}
