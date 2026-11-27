package app.peridot.android.playback

import android.content.ComponentName
import android.app.NotificationManager
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaBrowser
import androidx.media3.session.SessionToken
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.ListenableFuture
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@UnstableApi
@RunWith(AndroidJUnit4::class)
class PeridotMediaBrowserTest {
    private var browser: MediaBrowser? = null

    @Before
    fun connectBrowser() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val token = SessionToken(
            context,
            ComponentName(context, PeridotPlaybackService::class.java),
        )
        browser = MediaBrowser.Builder(context, token).buildAsync().get()
    }

    @After
    fun disconnectBrowser() {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            browser?.release()
        }
        browser = null
    }

    @Test
    fun mediaLibraryExposesAndroidAutoRootCatalog() {
        lateinit var children:
            ListenableFuture<LibraryResult<ImmutableList<MediaItem>>>
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            children = browser!!.getChildren(
                PeridotPlaybackService.ROOT_ID,
                0,
                Int.MAX_VALUE,
                null,
            )
        }
        val result = children.get()

        assertEquals(0, result.resultCode)
        assertNotNull(result.value)
        assertEquals(
            listOf(
                PeridotPlaybackService.LIKED_ID,
                PeridotPlaybackService.ALBUMS_ID,
                PeridotPlaybackService.PLAYLISTS_ID,
                PeridotPlaybackService.ARTISTS_ID,
                PeridotPlaybackService.QUEUE_ID,
            ),
            result.value!!.map { it.mediaId },
        )
    }

    @Test
    fun playbackServiceRegistersNotificationChannel() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val notifications = context.getSystemService(NotificationManager::class.java)

        assertNotNull(
            notifications.getNotificationChannel(
                PeridotPlaybackService.PLAYBACK_NOTIFICATION_CHANNEL_ID,
            ),
        )
    }

    @Test
    fun activePlaybackPostsMediaNotification() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val session = PeridotSession(
            serverAddress = "http://127.0.0.1:9",
            token = "notification-test-token",
            userId = "notification-test-user",
        )
        val sessions = SessionStore(context)
        val offlineStore = OfflineStore(context)
        val trackId = "notification-test-track"
        sessions.save(session.serverAddress, session.token, session.userId)
        offlineStore.audioFile(session, trackId).apply {
            parentFile?.mkdirs()
            writeBytes(silentWav())
        }
        val item = MediaItem.Builder()
            .setMediaId("track:$trackId")
            .setUri(
                Uri.Builder()
                    .scheme("peridot-track")
                    .authority("track")
                    .appendPath(trackId)
                    .build(),
            )
            .setMimeType("audio/wav")
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle("Notification test")
                    .setArtist("Peridot")
                    .build(),
            )
            .build()

        try {
            val controller = requireNotNull(browser)
            instrumentation.runOnMainSync {
                controller.setMediaItem(item)
                controller.prepare()
                controller.play()
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
                "Media3 did not post the playback notification.",
                notificationPosted,
            )
        } finally {
            instrumentation.runOnMainSync {
                browser?.stop()
                browser?.clearMediaItems()
            }
            offlineStore.clear(session)
            sessions.clear()
        }
    }

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
        const val NOTIFICATION_TIMEOUT_MS = 10_000L
        const val POLL_INTERVAL_MS = 100L
    }
}
