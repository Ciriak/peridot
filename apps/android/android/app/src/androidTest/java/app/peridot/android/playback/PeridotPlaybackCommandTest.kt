package app.peridot.android.playback

import android.app.NotificationManager
import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PeridotPlaybackCommandTest {
    private lateinit var session: PeridotSession
    private lateinit var sessions: SessionStore
    private lateinit var playbackStore: PlaybackStore
    private lateinit var offlineStore: OfflineStore

    @Before
    fun preparePlayback() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        sessions = SessionStore(context)
        playbackStore = PlaybackStore(context)
        offlineStore = OfflineStore(context)
        session = PeridotSession(
            serverAddress = "http://127.0.0.1:9",
            token = "command-test-token",
            userId = "command-test-user",
        )

        sessions.save(session.serverAddress, session.token, session.userId)
        offlineStore.audioFile(session, TRACK_ID).apply {
            parentFile?.mkdirs()
            writeBytes(silentWav())
        }
        playbackStore.saveQueue(queue())

        context.startActivity(
            Intent(context, app.peridot.android.MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    @After
    fun clearPlayback() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        context.stopService(
            Intent(context, PeridotPlaybackService::class.java),
        )
        playbackStore.clear()
        offlineStore.clear(session)
        sessions.clear()
    }

    @Test
    fun serviceCommandsPostMediaNotificationWithoutNotificationPermission() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext

        instrumentation.runOnMainSync {
            PeridotPlaybackService.command(
                context,
                PeridotPlaybackService.ACTION_REPLACE_QUEUE,
            ) {
                putExtra(PeridotPlaybackService.EXTRA_QUEUE, queue().toJson().toString())
            }
            PeridotPlaybackService.command(
                context,
                PeridotPlaybackService.ACTION_PLAY,
            )
        }

        val notifications = context.getSystemService(NotificationManager::class.java)
        val deadline = System.currentTimeMillis() + NOTIFICATION_TIMEOUT_MS
        var notificationPosted = false
        while (!notificationPosted && System.currentTimeMillis() < deadline) {
            notificationPosted =
                notifications.activeNotifications.any { notification ->
                    notification.packageName == context.packageName &&
                        notification.notification.channelId ==
                        PeridotPlaybackService.PLAYBACK_NOTIFICATION_CHANNEL_ID
                }
            if (!notificationPosted) Thread.sleep(POLL_INTERVAL_MS)
        }

        assertTrue(
            "Service commands did not post the playback notification.",
            notificationPosted,
        )
    }

    private fun queue() =
        PlaybackQueue(
            tracks = listOf(
                TrackSnapshot(
                    id = TRACK_ID,
                    title = "Notification test",
                    artist = "Peridot",
                    mimeType = "audio/wav",
                    available = false,
                ),
            ),
            activeTrackId = TRACK_ID,
            playing = true,
        )

    private fun silentWav(): ByteArray {
        val sampleRate = 8_000
        val sampleCount = 1_600
        val dataSize = sampleCount * 2
        return ByteBuffer.allocate(44 + dataSize)
            .order(ByteOrder.LITTLE_ENDIAN)
            .apply {
                put("RIFF".toByteArray(Charsets.US_ASCII))
                putInt(36 + dataSize)
                put("WAVE".toByteArray(Charsets.US_ASCII))
                put("fmt ".toByteArray(Charsets.US_ASCII))
                putInt(16)
                putShort(1)
                putShort(1)
                putInt(sampleRate)
                putInt(sampleRate * 2)
                putShort(2)
                putShort(16)
                put("data".toByteArray(Charsets.US_ASCII))
                putInt(dataSize)
            }
            .array()
    }

    private companion object {
        const val TRACK_ID = "command-notification-test-track"
        const val NOTIFICATION_TIMEOUT_MS = 10_000L
        const val POLL_INTERVAL_MS = 100L
    }
}
