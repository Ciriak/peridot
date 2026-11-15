package app.peridot.android.playback

import java.util.concurrent.CopyOnWriteArraySet

object PlaybackEventBus {
    private val listeners = CopyOnWriteArraySet<(PlaybackSnapshot) -> Unit>()

    fun subscribe(listener: (PlaybackSnapshot) -> Unit): () -> Unit {
        listeners.add(listener)
        return { listeners.remove(listener) }
    }

    fun publish(snapshot: PlaybackSnapshot) {
        listeners.forEach { listener -> listener(snapshot) }
    }
}
