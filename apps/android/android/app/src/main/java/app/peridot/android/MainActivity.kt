package app.peridot.android

import android.os.Bundle
import androidx.media3.common.util.UnstableApi
import app.peridot.android.playback.PeridotMediaPlugin
import com.getcapacitor.BridgeActivity

@UnstableApi
class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(PeridotMediaPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
