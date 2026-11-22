package app.peridot.android.playback

import androidx.media3.common.C
import androidx.media3.common.Player

object PlaybackSkipPolicy {
    fun nextIndexWithoutWrapping(
        currentIndex: Int,
        repeatMode: Int,
        setRepeatMode: (Int) -> Unit,
        getNextIndex: () -> Int,
    ): Int? {
        if (currentIndex == C.INDEX_UNSET) return null
        setRepeatMode(Player.REPEAT_MODE_OFF)
        val nextIndex = try {
            getNextIndex()
        } finally {
            setRepeatMode(repeatMode)
        }
        return nextIndex.takeIf {
            it != C.INDEX_UNSET && it != currentIndex
        }
    }
}
