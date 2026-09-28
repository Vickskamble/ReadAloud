import { registerPlugin } from '@capacitor/core'
import { prepareForSpeech } from '../pronunciation/segments'
import { SPEECH_FAILED_MESSAGE, VOICE_UNAVAILABLE_MESSAGE } from '../utils/validation'
import { CHUNK_MAX_CHARS } from '../utils/constants'
import type { VoiceQuality } from '../utils/voices'
import type {
  SpeakCallbacks,
  SpeakRequest,
  SpeechEngine,
  SpeechSettings,
} from './speechEngine'

/** A voice as reported by the Android text engine. */
interface NativeVoice {
  id: string
  name: string
  lang: string
  /** False when the voice would have to stream from a server. */
  local: boolean
  quality: string
}

interface NativeBoundary {
  index: number
  charIndex: number
  charLength: number
}

interface NativeChunkStart {
  index: number
  total: number
  text: string
}

interface ReadAloudTtsBridge {
  voices(): Promise<{ voices: NativeVoice[] }>
  speak(options: {
    /** One entry per segment, each with the language it was detected as. */
    segments: { text: string; lang: string }[]
    rate: number
    pitch: number
    voiceId: string
  }): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  stop(): Promise<void>
  openVoiceSettings(): Promise<{ opened: boolean }>
  addListener(event: 'ttsReady', handler: () => void): Promise<{ remove: () => void }>
  addListener(
    event: 'ttsChunkStart',
    handler: (data: NativeChunkStart) => void,
  ): Promise<{ remove: () => void }>
  addListener(
    event: 'ttsBoundary',
    handler: (data: NativeBoundary) => void,
  ): Promise<{ remove: () => void }>
  addListener(event: 'ttsComplete', handler: () => void): Promise<{ remove: () => void }>
  addListener(
    event: 'ttsError',
    handler: (data: { message: string }) => void,
  ): Promise<{ remove: () => void }>
  removeAllListeners(): Promise<void>
}

const Bridge = registerPlugin<ReadAloudTtsBridge>('ReadAloudTts')

/** Android's own quality rating, attached so ranking never has to guess. */
type RatedVoice = SpeechSynthesisVoice & { quality?: VoiceQuality }

const RATINGS = new Set<VoiceQuality>(['natural', 'standard', 'basic'])

function toRate(value: string): VoiceQuality {
  return RATINGS.has(value as VoiceQuality) ? (value as VoiceQuality) : 'standard'
}

/**
 * Presents an Android voice in the shape the rest of the app already uses, so
 * voice ranking, the picker and the labels need no Android-specific code.
 */
function toSynthesisVoice(native: NativeVoice): SpeechSynthesisVoice {
  const voice: RatedVoice = {
    voiceURI: native.id,
    name: native.name,
    lang: native.lang,
    localService: native.local,
    default: false,
    quality: toRate(native.quality),
  }
  return voice
}

function isMissingVoiceError(error: unknown): boolean {
  const text = String(error).toLowerCase()
  return text.includes('voice') || text.includes('language')
}

/**
 * Android text-to-speech backed by the platform engine.
 *
 * The WebView's own speech implementation is unreliable here: it reports an
 * empty voice list on many devices, ignores the selected voice, and cannot
 * pause at all. Driving `android.speech.tts.TextToSpeech` from a Kotlin plugin
 * fixes all three, and exposes the engine's real quality rating so the best
 * Hindi or Marathi voice can be chosen up front.
 */
export class NativeSpeechService implements SpeechEngine {
  private settings: SpeechSettings = { voice: null, rate: 1, pitch: 1 }
  private callbacks: SpeakCallbacks = {}

  private voices: SpeechSynthesisVoice[] = []
  private voiceListeners = new Set<(voices: SpeechSynthesisVoice[]) => void>()
  private pluginListeners: { remove: () => void }[] = []
  private readyWatcher: { remove: () => void } | null = null
  private released = false

  private active = false
  private paused = false
  /** Guards against callbacks left over from a previous reading. */
  private session = 0

  isSupported(): boolean {
    return true
  }

  async loadVoices(): Promise<SpeechSynthesisVoice[]> {
    try {
      const result = await Bridge.voices()
      this.voices = (result.voices ?? []).map(toSynthesisVoice)
    } catch {
      this.voices = []
    }
    for (const listener of this.voiceListeners) listener(this.voices)
    return this.voices
  }

  /**
   * The platform engine connects asynchronously, so a voice list fetched
   * moments after launch can be empty. Re-reading it once the engine reports
   * ready keeps the picker populated without the user having to reopen the app.
   */
  private watchReadiness(): void {
    if (this.readyWatcher) return
    void Bridge.addListener('ttsReady', () => {
      if (this.voices.length > 0) return
      void this.loadVoices()
    }).then((handle) => {
      // release() may already have run while the listener was registering.
      if (this.released) handle.remove()
      else this.readyWatcher = handle
    })
  }

  constructor() {
    this.watchReadiness()
  }

  subscribeVoices(listener: (voices: SpeechSynthesisVoice[]) => void): () => void {
    this.voiceListeners.add(listener)
    if (this.voices.length > 0) listener(this.voices)
    return () => {
      this.voiceListeners.delete(listener)
    }
  }

  getVoices(): SpeechSynthesisVoice[] {
    return this.voices
  }

  updateSettings(settings: Partial<SpeechSettings>): void {
    this.settings = { ...this.settings, ...settings }
  }

  speak(request: SpeakRequest, callbacks: SpeakCallbacks = {}): boolean {
    // The caller normally supplies segments already, but never fall back to
    // plain chunking labelled English: that would label Hindi text as English
    // and have the engine read it with the wrong voice.
    const segments = request.segments ?? prepareForSpeech(request.text, {
      maxChars: request.chunkMaxChars ?? CHUNK_MAX_CHARS,
    })
    if (segments.length === 0) return false

    this.settings = { voice: request.voice, rate: request.rate, pitch: request.pitch }
    this.callbacks = callbacks
    this.active = true
    this.paused = false
    this.session += 1
    const session = this.session

    void this.listen(session)
    void Bridge.speak({
      segments: segments.map((segment) => ({ text: segment.text, lang: segment.language })),
      rate: request.rate,
      pitch: request.pitch,
      voiceId: request.voice?.voiceURI ?? '',
    }).catch((error: unknown) => {
      if (session !== this.session) return
      this.active = false
      this.callbacks.onError?.(
        isMissingVoiceError(error) ? VOICE_UNAVAILABLE_MESSAGE : SPEECH_FAILED_MESSAGE,
      )
    })

    return true
  }

  pause(): boolean {
    if (!this.active || this.paused) return false
    this.paused = true
    void Bridge.pause()
    return true
  }

  resume(): boolean {
    if (!this.active || !this.paused) return false
    this.paused = false
    void Bridge.resume()
    return true
  }

  stop(): void {
    this.cancel()
    void Bridge.stop()
  }

  isSpeaking(): boolean {
    return this.active
  }

  isPaused(): boolean {
    return this.paused
  }

  /**
   * Opens the system text-to-speech settings so the user can install the voice
   * the app just reported as missing. Returns false when the device has no
   * settings screen to open, so the caller can show instructions instead.
   */
  async openVoiceSettings(): Promise<boolean> {
    try {
      const result = await Bridge.openVoiceSettings()
      return result.opened === true
    } catch {
      return false
    }
  }

  release(): void {
    this.released = true
    this.cancel()
    for (const listener of this.pluginListeners) listener.remove()
    this.pluginListeners = []
    this.readyWatcher?.remove()
    this.readyWatcher = null
    this.voiceListeners.clear()
  }

  private cancel(): void {
    this.active = false
    this.paused = false
    this.callbacks = {}
  }

  /**
   * Subscribes to the engine's word events. Listeners are torn down on every
   * new reading so a previous session can never drive the current UI.
   */
  private async listen(session: number): Promise<void> {
    const remove = await Promise.all([
      Bridge.addListener('ttsChunkStart', (data) => {
        if (session !== this.session) return
        this.callbacks.onChunkStart?.(data.index, data.text)
      }),
      Bridge.addListener('ttsBoundary', (data) => {
        if (session !== this.session) return
        this.callbacks.onBoundary?.(data.charIndex, data.charLength)
      }),
      Bridge.addListener('ttsComplete', () => {
        if (session !== this.session) return
        this.active = false
        this.paused = false
        this.callbacks.onComplete?.()
        this.callbacks = {}
      }),
      Bridge.addListener('ttsError', (data) => {
        if (session !== this.session) return
        this.active = false
        this.paused = false
        this.callbacks.onError?.(data.message || SPEECH_FAILED_MESSAGE)
        this.callbacks = {}
      }),
    ])

    if (session !== this.session) {
      for (const handle of remove) handle.remove()
      return
    }
    this.pluginListeners = remove
  }
}
