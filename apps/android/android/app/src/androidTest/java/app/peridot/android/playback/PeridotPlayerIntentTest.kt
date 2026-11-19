package app.peridot.android.playback

import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PeridotPlayerIntentTest {
    @Test
    fun mediaSessionIntentOpensTheMobilePlayerDeepLink() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val intent = PeridotPlaybackService.playerActivityIntent(context)

        assertEquals(Intent.ACTION_VIEW, intent.action)
        assertEquals(PeridotPlaybackService.PLAYER_DEEP_LINK, intent.dataString)
        assertEquals(Intent.FLAG_ACTIVITY_SINGLE_TOP, intent.flags)
    }
}
