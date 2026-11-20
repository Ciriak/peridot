package app.peridot.android.playback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PlaybackStartRetryPolicyTest {
    @Test
    fun allowsThreeTotalAttempts() {
        assertEquals(3, PlaybackStartRetryPolicy.MAX_ATTEMPTS)
        assertEquals(2, PlaybackStartRetryPolicy.MAX_RETRIES)
        assertEquals(1, PlaybackStartRetryPolicy.nextRetryCount(0))
        assertEquals(2, PlaybackStartRetryPolicy.nextRetryCount(1))
        assertNull(PlaybackStartRetryPolicy.nextRetryCount(2))
    }
}
