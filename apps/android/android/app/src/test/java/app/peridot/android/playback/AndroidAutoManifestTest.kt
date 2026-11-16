package app.peridot.android.playback

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidAutoManifestTest {
    @Test
    fun manifestDeclaresMediaLibraryServiceForAndroidAuto() {
        val manifest = File("src/main/AndroidManifest.xml").readText()

        assertTrue(manifest.contains("com.google.android.gms.car.application"))
        assertTrue(manifest.contains("androidx.media3.session.MediaLibraryService"))
        assertTrue(manifest.contains("android.media.browse.MediaBrowserService"))
        assertTrue(manifest.contains("android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"))
        assertTrue(manifest.contains("android.permission.POST_NOTIFICATIONS"))
        assertTrue(manifest.contains("foregroundServiceType=\"mediaPlayback\""))
    }
}
