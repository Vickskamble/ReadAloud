package com.vickskamble.readaloud.tts

import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.Locale
import java.util.concurrent.atomic.AtomicLong

/**
 * Native Android text-to-speech for ReadAloud.
 *
 * The WebView speech engine is unreliable on Android (it drops the voice list,
 * ignores the selected voice, and cannot be paused), so the app talks to the
 * platform [TextToSpeech] service directly instead.
 *
 * Responsibilities:
 *  - report the engine's real voices, including each voice's own quality
 *    rating and whether it needs a network connection,
 *  - own the chunk queue so playback survives WebView reloads,
 *  - emulate pause/resume (the platform API has no pause) by remembering the
 *    current word and re-speaking the remainder,
 *  - emit word-boundary events that drive the live caption and wave.
 *
 * Nothing is persisted: all state is in memory and dropped on stop.
 */
@CapacitorPlugin(name = "ReadAloudTts")
class ReadAloudTtsPlugin : Plugin() {

    private var tts: TextToSpeech? = null
    private var ready = false
    private var initError: String? = null

    private var chunks: List<String> = emptyList()
    private var index = 0
    private val session = AtomicLong(0)

    private var rate = 1.0f
    private var pitch = 1.0f
    private var voice: Voice? = null
    private var voiceId: String? = null

    private var active = false
    private var paused = false
    private var wordOffset = 0

    /* ------------------------------------------------------------------ setup */

    private fun engine(): TextToSpeech? = tts?.takeIf { ready }

    override fun load() {
        tts = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val instance = tts
                if (instance != null) {
                    instance.setOnUtteranceProgressListener(listener())
                    ready = true
                    initError = null
                }
            } else {
                initError = "Text engine returned status $status"
                ready = false
            }
            notifyListeners("ttsReady", readyState())
        }
    }

    override fun handleOnDestroy() {
        halt()
        tts?.shutdown()
        tts = null
        ready = false
        super.handleOnDestroy()
    }

    private fun readyState(): JSObject = JSObject().apply {
        put("ready", ready)
        put("error", initError ?: "")
    }

    /* ----------------------------------------------------------------- voices */

    @PluginMethod
    fun voices(call: PluginCall) {
        val instance = engine()
        if (instance == null) {
            call.reject(initError ?: "Text-to-speech engine is not ready")
            return
        }

        val result = JSArray()
        for (candidate in instance.voices ?: emptySet()) {
            val entry = JSObject()
            entry.put("id", candidate.name)
            entry.put("name", candidate.name)
            entry.put("lang", candidate.locale.toLanguageTag())
            // Drives the existing "on-device first, network last" privacy ranking.
            entry.put("local", !candidate.isNetworkConnectionRequired)
            entry.put("quality", qualityLabel(candidate.quality))
            result.put(entry)
        }

        val response = JSObject()
        response.put("voices", result)
        response.put("ready", true)
        call.resolve(response)
    }

    /**
     * Maps the engine's own quality rating onto the labels the UI already uses.
     * Values are `android.speech.tts.Voice.QUALITY_*`; ULTRA_HIGH only exists
     * from API 31, so the numbers are used directly to stay compile-safe.
     */
    private fun qualityLabel(quality: Int): String = when (quality) {
        2, 3, 4 -> "natural"
        1 -> "standard"
        else -> "basic"
    }

    private fun resolveVoice(id: String?, lang: String?): Voice? {
        val instance = engine() ?: return null
        if (id != null) {
            instance.voices?.firstOrNull { it.name == id }?.let { return it }
        }
        val tag = lang?.takeIf { it.isNotBlank() } ?: return null
        val wanted = Locale.forLanguageTag(tag)
        val matching = instance.voices?.filter { it.locale.language == wanted.language } ?: emptyList()
        return matching.maxByOrNull { it.quality }
    }

    /* ---------------------------------------------------------------- speaking */

    /**
     * Starts a new reading session. The whole chunk list is handed over at once
     * so the native side can own queueing, pause and resume independently.
     */
    @PluginMethod
    fun speak(call: PluginCall) {
        val instance = engine()
        if (instance == null) {
            call.reject(initError ?: "Text-to-speech engine is not ready")
            return
        }

        val list = call.getArray("chunks")
        if (list == null || list.length() == 0) {
            call.reject("No text to speak")
            return
        }

        val pending = ArrayList<String>(list.length())
        for (i in 0 until list.length()) {
            list.getString(i)?.takeIf { it.isNotBlank() }?.let { pending.add(it) }
        }
        if (pending.isEmpty()) {
            call.reject("No text to speak")
            return
        }

        rate = call.getFloat("rate", 1.0f)?.coerceIn(0.1f, 10f) ?: 1.0f
        pitch = call.getFloat("pitch", 1.0f)?.coerceIn(0f, 2f) ?: 1.0f
        voiceId = call.getString("voiceId")
        voice = resolveVoice(voiceId, call.getString("lang"))

        halt()
        chunks = pending
        index = 0
        wordOffset = 0
        paused = false
        active = true
        session.incrementAndGet()

        instance.setSpeechRate(rate)
        instance.setPitch(pitch)
        pendingAt(0)
        call.resolve()
    }

    private fun pendingAt(position: Int) {
        if (!active || position >= chunks.size) {
            complete()
            return
        }
        index = position
        val instance = engine() ?: return
        val text = chunks[position]
        val params = Bundle()
        params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId(position))
        instance.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId(position))
    }

    private fun utteranceId(position: Int): String = "ra-${session.get()}-$position"

    private fun listener() = object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String?) {
            val position = positionOf(utteranceId) ?: return
            if (!active) return
            emitChunkStart(position)
        }

        override fun onDone(utteranceId: String?) {
            val position = positionOf(utteranceId) ?: return
            if (!active || paused) return
            val next = position + 1
            if (next >= chunks.size) complete() else pendingAt(next)
        }

        @Suppress("DEPRECATION")
        override fun onError(utteranceId: String?) {
            fail("The text engine stopped unexpectedly.")
        }

        override fun onError(utteranceId: String?, errorCode: Int) {
            fail("The text engine could not read this text (code $errorCode).")
        }

        override fun onRangeStart(utteranceId: String?, start: Int, end: Int, charCount: Int) {
            val position = positionOf(utteranceId) ?: return
            if (!active) return
            wordOffset = start

            val payload = JSObject()
            payload.put("index", position)
            payload.put("charIndex", start)
            payload.put("charLength", end - start)
            notifyListeners("ttsBoundary", payload)
        }
    }

    /** Resolves an utterance id back to its queue position, or null if stale. */
    private fun positionOf(utteranceId: String?): Int? {
        if (utteranceId == null) return null
        if (!utteranceId.startsWith("ra-${session.get()}-")) return null
        return utteranceId.substringAfterLast('-').toIntOrNull()
    }

    private fun emitChunkStart(position: Int) {
        val payload = JSObject()
        payload.put("index", position)
        payload.put("total", chunks.size)
        payload.put("text", chunks.getOrElse(position) { "" })
        notifyListeners("ttsChunkStart", payload)
    }

    private fun complete() {
        active = false
        paused = false
        chunks = emptyList()
        wordOffset = 0
        notifyListeners("ttsComplete", JSObject())
    }

    private fun fail(message: String) {
        if (!active) return
        active = false
        paused = false
        chunks = emptyList()
        val payload = JSObject()
        payload.put("message", message)
        notifyListeners("ttsError", payload)
    }

    /** Stops the engine and drops queue state without notifying the UI. */
    private fun halt() {
        active = false
        try {
            tts?.stop()
        } catch (_: Exception) {
            // Nothing to halt.
        }
    }

    /* ----------------------------------------------------------------- control */

    /**
     * Android's [TextToSpeech] has no pause, so the current word is remembered
     * and the remainder of that chunk is spoken again on resume.
     */
    @PluginMethod
    fun pause(call: PluginCall) {
        if (!active || paused) {
            call.resolve()
            return
        }
        paused = true
        try {
            tts?.stop()
        } catch (_: Exception) {
            // Already stopped.
        }
        call.resolve()
    }

    @PluginMethod
    fun resume(call: PluginCall) {
        if (!active || !paused) {
            call.resolve()
            return
        }
        paused = false

        val instance = engine() ?: run {
            call.reject("Text-to-speech engine is not ready")
            return
        }

        val chunk = chunks.getOrNull(index)
        if (chunk == null) {
            complete()
            call.resolve()
            return
        }

        val remainder = chunk.substring(wordOffset.coerceIn(0, chunk.length))
        val params = Bundle()
        params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId(index))
        instance.setSpeechRate(rate)
        instance.setPitch(pitch)
        instance.speak(remainder, TextToSpeech.QUEUE_FLUSH, params, utteranceId(index))
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        halt()
        chunks = emptyList()
        index = 0
        wordOffset = 0
        paused = false
        call.resolve()
    }

    @PluginMethod
    fun status(call: PluginCall) {
        val response = readyState()
        response.put("active", active)
        response.put("paused", paused)
        call.resolve(response)
    }
}
