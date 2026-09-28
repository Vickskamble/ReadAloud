package com.vickskamble.readaloud.tts

import android.content.Intent
import android.media.AudioAttributes
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
/** One unit of speech: the text plus the language it was detected as. */
private class Segment(val text: String, val lang: String)

@CapacitorPlugin(name = "ReadAloudTts")
class ReadAloudTtsPlugin : Plugin() {

    private var tts: TextToSpeech? = null
    private var ready = false
    private var initError: String? = null

    /**
     * Calls that arrived before the engine finished initialising. The text
     * engine connects asynchronously, so without this the app would ask for its
     * voice list before any voice existed and show the picker as empty.
     */
    private val pendingCalls = mutableListOf<Pair<PluginCall, (TextToSpeech) -> Unit>>()

    private var segments: List<Segment> = emptyList()
    private var index = 0
    private val session = AtomicLong(0)

    private var rate = 1.0f
    private var pitch = 1.0f
        private var voiceId: String? = null

    private var active = false
    private var paused = false
    private var wordOffset = 0

    /* ------------------------------------------------------------------ setup */

    private fun engine(): TextToSpeech? = tts?.takeIf { ready }

    /**
     * Runs [action] now if the engine is up, otherwise once it finishes
     * starting up. Rejects straight away only if initialisation already failed.
     */
    private fun whenReady(call: PluginCall, action: (TextToSpeech) -> Unit) {
        val instance = engine()
        if (instance != null) {
            action(instance)
            return
        }
        if (initError != null) {
            call.reject(initError!!)
            return
        }
        pendingCalls.add(call to action)
    }

    private fun flushPending() {
        if (pendingCalls.isEmpty()) return
        val waiting = pendingCalls.toList()
        pendingCalls.clear()
        val instance = engine() ?: return
        for ((call, action) in waiting) action(instance)
    }

    override fun load() {
        tts = TextToSpeech(context) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val instance = tts
                if (instance != null) {
                    instance.setOnUtteranceProgressListener(listener())
                    // Routes audio as assistive speech, so the read comes out of
                    // the media stream at a sensible volume on every device.
                    instance.setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build()
                    )
                    ready = true
                    initError = null
                }
            } else {
                initError = "No text-to-speech engine is available on this device"
                ready = false
            }
            notifyListeners("ttsReady", readyState())
            flushPending()
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
        whenReady(call) { instance ->
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

    /**
     * Picks the voice for one segment.
     *
     * The segment's language decides, not the user's picker: that is the whole
     * point of segmentation, and it is what stops an English voice from being
     * used to read Devanagari. An explicit pick still wins, but only when it
     * speaks the same language as the segment being read.
     */
    private fun resolveVoice(segmentLang: String?): Voice? {
        val instance = engine() ?: return null
        val tag = segmentLang?.takeIf { it.isNotBlank() } ?: return null
        val wanted = Locale.forLanguageTag(tag)
        val voices = instance.voices ?: return null

        val picked = voiceId?.let { id -> voices.firstOrNull { it.name == id } }
        if (picked != null && picked.locale.language == wanted.language) return picked

        // Exact regional match first, so hi-IN is preferred over another hi.
        val exact = voices.filter { it.locale.toLanguageTag().equals(tag, ignoreCase = true) }
        exact.maxByOrNull { it.quality }?.let { return it }

        return voices.filter { it.locale.language == wanted.language }.maxByOrNull { it.quality }
    }

    /* ---------------------------------------------------------------- speaking */

    /**
     * Starts a new reading session. The whole segment list is handed over at
     * once so the native side can own queueing, pause and resume independently.
     * Each segment carries the language it was detected as, so a Hindi run and
     * an English run inside one message are read by the right voices.
     */
    @PluginMethod
    fun speak(call: PluginCall) {
        whenReady(call) { instance ->
            val list = call.getArray("segments")
            if (list == null || list.length() == 0) {
                call.reject("No text to speak")
                return@whenReady
            }

            val pending = ArrayList<Segment>(list.length())
            for (i in 0 until list.length()) {
                val text = list.getString(i)?.takeIf { it.isNotBlank() } ?: continue
                pending.add(Segment(text, list.getJSONObject(i)?.optString("lang") ?: ""))
            }
            if (pending.isEmpty()) {
                call.reject("No text to speak")
                return@whenReady
            }

            rate = call.getFloat("rate", 1.0f)?.coerceIn(0.1f, 10f) ?: 1.0f
            pitch = call.getFloat("pitch", 1.0f)?.coerceIn(0f, 2f) ?: 1.0f
            voiceId = call.getString("voiceId")

            halt()
            segments = pending
            index = 0
            wordOffset = 0
            paused = false
            active = true
            session.incrementAndGet()

            pendingAt(0)
            call.resolve()
        }
    }

    private fun pendingAt(position: Int) {
        if (!active || position >= segments.size) {
            complete()
            return
        }
        index = position
        val instance = engine() ?: return
        val segment = segments[position]
        // Resolved per segment: this is what makes a mixed-language message
        // readable, and what stops Devanagari being read by an English voice.
        val segmentVoice = resolveVoice(segment.lang)
        applyVoice(instance, segmentVoice)
        val params = Bundle()
        params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId(position))
        instance.speak(segment.text, TextToSpeech.QUEUE_FLUSH, params, utteranceId(position))
    }

    /**
     * Applies the chosen voice, rate and pitch to the engine.
     *
     * Setting the voice is what makes the picker and the per-segment language
     * actually work, and it is also what makes Devanagari sound right: without
     * it the engine reads Hindi text in its own default language, which is what
     * produces the garbled pronunciation. An engine can refuse a voice it no
     * longer has, so this falls back to the engine default instead of failing.
     */
    private fun applyVoice(instance: TextToSpeech, preferred: Voice?) {
        if (preferred != null) {
            try {
                instance.voice = preferred
            } catch (_: Exception) {
                // Voice disappeared since it was listed; keep the engine default.
            }
        }
        instance.setSpeechRate(rate)
        instance.setPitch(pitch)
    }

    /**
     * Opens the system text-to-speech settings so a missing voice can be
     * installed. Reports failure instead of crashing when the device has no
     * such screen.
     */
    @PluginMethod
    fun openVoiceSettings(call: PluginCall) {
        val response = JSObject()
        response.put("opened", openTtsSettings())
        call.resolve(response)
    }

    /**
     * Opens the system text-to-speech settings so a missing voice can be
     * installed.
     *
     * The action differs between Android versions and some OEM builds ship only
     * the fully qualified one, so each known action is tried in turn and the
     * first the device actually resolves wins. The action is written out
     * rather than referenced as a constant because it is absent from some
     * compile SDKs even though devices respond to it.
     */
    private fun openTtsSettings(): Boolean {
        val actions = listOf(
            "com.android.settings.TTS_SETTINGS",
            "android.settings.TTS_SETTINGS"
        )
        for (action in actions) {
            try {
                val intent = Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (intent.resolveActivity(context.packageManager) != null) {
                    context.startActivity(intent)
                    return true
                }
            } catch (_: Exception) {
                // Try the next known action.
            }
        }
        return false
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
            if (next >= segments.size) complete() else pendingAt(next)
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
        payload.put("total", segments.size)
        payload.put("text", segments.getOrElse(position) { Segment("", "") }.text)
        notifyListeners("ttsChunkStart", payload)
    }

    private fun complete() {
        active = false
        paused = false
        segments = emptyList()
        wordOffset = 0
        notifyListeners("ttsComplete", JSObject())
    }

    private fun fail(message: String) {
        if (!active) return
        active = false
        paused = false
        segments = emptyList()
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

        val segment = segments.getOrNull(index)
        if (segment == null) {
            complete()
            call.resolve()
            return
        }

        val remainder = segment.text.substring(wordOffset.coerceIn(0, segment.text.length))
        val params = Bundle()
        params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId(index))
        // The same voice as before the pause, resolved from this segment's
        // language, so resuming never drops into the wrong pronunciation.
        applyVoice(instance, resolveVoice(segment.lang))
        instance.speak(remainder, TextToSpeech.QUEUE_FLUSH, params, utteranceId(index))
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        halt()
        segments = emptyList()
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
