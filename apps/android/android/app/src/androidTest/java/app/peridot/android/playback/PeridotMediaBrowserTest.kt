package app.peridot.android.playback

import android.content.ComponentName
import android.app.NotificationManager
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaBrowser
import androidx.media3.session.SessionToken
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.ListenableFuture
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
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
                PeridotPlaybackService.QUEUE_ID,
                PeridotPlaybackService.LIKED_ID,
                PeridotPlaybackService.ALBUMS_ID,
                PeridotPlaybackService.ARTISTS_ID,
                PeridotPlaybackService.PLAYLISTS_ID,
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
}
