package app.peridot.android.playback

object PlaybackStartRetryPolicy {
    const val MAX_RETRIES = 3

    fun nextRetryCount(retriesUsed: Int): Int? =
        if (retriesUsed < MAX_RETRIES) retriesUsed + 1 else null
}
