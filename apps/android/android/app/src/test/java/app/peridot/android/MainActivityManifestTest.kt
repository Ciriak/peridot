package app.peridot.android

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class MainActivityManifestTest {
    @Test
    fun manifestLocksPhoneActivityToPortrait() {
        val manifest = File("src/main/AndroidManifest.xml").readText()

        assertTrue(manifest.contains("android:screenOrientation=\"portrait\""))
    }
}
