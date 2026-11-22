package app.peridot.android.playback

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CachedTrackIdentityTest {
    private lateinit var session: PeridotSession
    private lateinit var store: OfflineStore

    @Before
    fun prepareCache() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        session = PeridotSession(
            serverAddress = "http://127.0.0.1:9",
            token = "offline-identity-test-token",
            userId = "offline-identity-test-user",
        )
        store = OfflineStore(context)
        store.audioFile(session, DUPLICATE_TRACK_ID).apply {
            parentFile?.mkdirs()
            writeBytes(byteArrayOf(1, 2, 3, 4))
        }
    }

    @After
    fun clearCache() {
        store.clear(session)
    }

    @Test
    fun cachedCopyMovesToItsCanonicalTrackId() {
        val canonical = TrackSnapshot(
            id = CANONICAL_TRACK_ID,
            title = "Give Life Back to Music",
            artist = "Daft Punk",
            mimeType = "audio/flac",
            available = false,
        )
        val savedAt = "2026-11-18T10:15:06.475Z"

        val moved = store.move(session, DUPLICATE_TRACK_ID, canonical, savedAt)

        assertNotNull(moved)
        assertTrue(store.audioFile(session, CANONICAL_TRACK_ID).isFile)
        assertFalse(store.audioFile(session, DUPLICATE_TRACK_ID).isFile)
        assertTrue(
            store.list(session).any {
                it.track.id == CANONICAL_TRACK_ID && it.savedAt == savedAt
            },
        )
    }

    private companion object {
        const val DUPLICATE_TRACK_ID = "offline-duplicate-track"
        const val CANONICAL_TRACK_ID = "offline-canonical-track"
    }
}
