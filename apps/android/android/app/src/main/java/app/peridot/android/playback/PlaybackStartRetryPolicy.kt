package app.peridot.android.playback

object PlaybackStartRetryPolicy {
    const val MAX_ATTEMPTS = 3
    const val MAX_RETRIES = MAX_ATTEMPTS - 1

    fun nextRetryCount(retriesUsed: Int): Int? =
        if (retriesUsed < MAX_RETRIES) retriesUsed + 1 else null
}
