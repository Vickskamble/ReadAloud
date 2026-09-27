package com.vickskamble.readaloud

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.vickskamble.readaloud.tts.ReadAloudTtsPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Registered before super.onCreate() so the bridge is live for the
        // first page load and the web app can query voices immediately.
        registerPlugin(ReadAloudTtsPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
