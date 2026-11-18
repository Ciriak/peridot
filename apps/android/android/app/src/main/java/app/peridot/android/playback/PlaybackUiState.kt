package app.peridot.android.playback

import androidx.media3.common.Player

internal fun playbackControlActive(
    playWhenReady: Boolean,
    playbackState: Int,
    hasError: Boolean,
): Boolean =
    playWhenReady &&
        !hasError &&
        playbackState != Player.STATE_ENDED
