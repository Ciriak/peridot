package app.peridot.android.playback

import android.content.Intent
import android.net.Uri
import android.webkit.CookieManager
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.peridot.android.MainActivity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
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

    @Test
    fun mediaSessionLaunchUrlOpensTheFullscreenPlayerRoute() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val cookies = CookieManager.getInstance()
        cookies.setCookie(
            "http://localhost",
            "peridot-server=${Uri.encode("http://127.0.0.1:17430")}; path=/",
        )
        cookies.setCookie(
            "http://localhost",
            "peridot-session=player-route-test; path=/",
        )
        cookies.flush()

        try {
            ActivityScenario.launch<MainActivity>(
                PeridotPlaybackService.playerActivityIntent(context),
            ).use { scenario ->
                val deadline = System.currentTimeMillis() + ROUTE_TIMEOUT_MS
                var url: String? = null
                while (url?.contains(PLAYER_ROUTE) != true &&
                    System.currentTimeMillis() < deadline
                ) {
                    scenario.onActivity { activity ->
                        url = activity.bridge?.webView?.url
                    }
                    if (url?.contains(PLAYER_ROUTE) != true) {
                        Thread.sleep(POLL_INTERVAL_MS)
                    }
                }
                assertTrue(
                    "Expected the mobile player route, but loaded $url",
                    url?.contains(PLAYER_ROUTE) == true,
                )
            }
        } finally {
            cookies.removeAllCookies(null)
            cookies.flush()
        }
    }

    private companion object {
        const val PLAYER_ROUTE = "player=fullscreen"
        const val ROUTE_TIMEOUT_MS = 15_000L
        const val POLL_INTERVAL_MS = 100L
    }
}
