package app.peridot.android.playback

import androidx.media3.common.Player
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackUiStateTest {
    @Test
    fun requestedPlaybackRemainsActiveWhileBuffering() {
        assertTrue(
            playbackControlActive(
                playWhenReady = true,
                playbackState = Player.STATE_BUFFERING,
                hasError = false,
            ),
        )
    }

    @Test
    fun requestedPlaybackRemainsActiveWhileReady() {
        assertTrue(
            playbackControlActive(
                playWhenReady = true,
                playbackState = Player.STATE_READY,
                hasError = false,
            ),
        )
    }

    @Test
    fun pauseIntentShowsPlayControl() {
        assertFalse(
            playbackControlActive(
                playWhenReady = false,
                playbackState = Player.STATE_READY,
                hasError = false,
            ),
        )
    }

    @Test
    fun completedOrFailedPlaybackShowsPlayControl() {
        assertFalse(
            playbackControlActive(
                playWhenReady = true,
                playbackState = Player.STATE_ENDED,
                hasError = false,
            ),
        )
        assertFalse(
            playbackControlActive(
                playWhenReady = true,
                playbackState = Player.STATE_IDLE,
                hasError = true,
            ),
        )
    }
}
