package app.peridot.android.playback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PlaybackStartRetryPolicyTest {
    @Test
    fun allowsThreeRetriesAfterInitialAttempt() {
        assertEquals(3, PlaybackStartRetryPolicy.MAX_RETRIES)
        assertEquals(1, PlaybackStartRetryPolicy.nextRetryCount(0))
        assertEquals(2, PlaybackStartRetryPolicy.nextRetryCount(1))
        assertEquals(3, PlaybackStartRetryPolicy.nextRetryCount(2))
        assertNull(PlaybackStartRetryPolicy.nextRetryCount(3))
    }
}
