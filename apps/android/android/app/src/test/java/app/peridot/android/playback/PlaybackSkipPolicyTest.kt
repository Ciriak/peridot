package app.peridot.android.playback

import androidx.media3.common.C
import androidx.media3.common.Player
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PlaybackSkipPolicyTest {
    @Test
    fun nextIndexIsResolvedWithoutRepeatWrapping() {
        var repeatMode = Player.REPEAT_MODE_ALL

        val nextIndex = PlaybackSkipPolicy.nextIndexWithoutWrapping(
            currentIndex = 2,
            repeatMode = repeatMode,
            setRepeatMode = { repeatMode = it },
            getNextIndex = {
                assertEquals(Player.REPEAT_MODE_OFF, repeatMode)
                0
            },
        )

        assertEquals(0, nextIndex)
        assertEquals(Player.REPEAT_MODE_ALL, repeatMode)
    }

    @Test
    fun exhaustedQueueHasNoNextIndex() {
        var repeatMode = Player.REPEAT_MODE_ONE

        val nextIndex = PlaybackSkipPolicy.nextIndexWithoutWrapping(
            currentIndex = 2,
            repeatMode = repeatMode,
            setRepeatMode = { repeatMode = it },
            getNextIndex = { C.INDEX_UNSET },
        )

        assertNull(nextIndex)
        assertEquals(Player.REPEAT_MODE_ONE, repeatMode)
    }

    @Test
    fun sameIndexDoesNotCreateASkipLoop() {
        val nextIndex = PlaybackSkipPolicy.nextIndexWithoutWrapping(
            currentIndex = 1,
            repeatMode = Player.REPEAT_MODE_ALL,
            setRepeatMode = {},
            getNextIndex = { 1 },
        )

        assertNull(nextIndex)
    }
}
