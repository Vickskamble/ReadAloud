import {
  AUDIO_BLOCKED_MESSAGE,
  NETWORK_VOICE_MESSAGE,
  SPEECH_FAILED_MESSAGE,
  TTS_UNAVAILABLE_MESSAGE,
  TEXT_TOO_LONG_MESSAGE,
  VOICE_UNAVAILABLE_MESSAGE,
} from '../utils/validation'
import { chunkText } from '../utils/textChunker'

/** How long to wait for the asynchronous `voiceschanged` event before giving up. */
const VOICE_LOAD_TIMEOUT_MS = 1500

/**
 * Chrome (and some Android WebViews) can silently stop an utterance after
 * roughly 15 seconds. Calling resume() on a playing synthesis refreshes it
 * without audibly restarting the speech.
 */
const KEEP_ALIVE_INTERVAL_MS = 10_000

/** Chrome drops a speak() issued in the same task as a cancel(). */
const RESTART_DELAY_MS = 0

export interface SpeechSettings {
  voice: SpeechSynthesisVoice | null
  rate: number
  pitch: number
}

export interface SpeakCallbacks {
  /** `text` is the chunk about to be spoken, for live captions. */
  onChunkStart?: (index: number, text: string) => void
  onBoundary?: (charIndex: number, charLength: number) => void
  onComplete?: () => void
  onError?: (message: string) => void
}

export interface SpeakRequest extends SpeechSettings {
  text: string
  chunkMaxChars?: number
}

export interface SpeechServiceDeps {
  synth?: SpeechSynthesis
  Utterance?: typeof SpeechSynthesisUtterance
}

const BENIGN_ERRORS = new Set(['canceled', 'interrupted'])

function mapErrorCode(code: SpeechSynthesisErrorCode): string {
  switch (code) {
    case 'not-allowed':
      return AUDIO_BLOCKED_MESSAGE
    case 'voice-unavailable':
    case 'language-unavailable':
      return VOICE_UNAVAILABLE_MESSAGE
    case 'network':
      return NETWORK_VOICE_MESSAGE
    case 'text-too-long':
      return TEXT_TOO_LONG_MESSAGE
    case 'synthesis-unavailable':
      return TTS_UNAVAILABLE_MESSAGE
    default:
      return SPEECH_FAILED_MESSAGE
  }
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/**
 * Thin, framework-free wrapper around the browser Text-to-Speech engine.
 * Owns the utterance queue, pause/resume, cancellation and error mapping.
 * All state lives in memory only and is discarded on stop().
 */
export class SpeechService {
  private readonly synth: SpeechSynthesis | null
  private readonly Utterance: typeof SpeechSynthesisUtterance | null

  private settings: SpeechSettings = { voice: null, rate: 1, pitch: 1 }
  private callbacks: SpeakCallbacks = {}

  private chunks: string[] = []
  private index = 0
  private generation = 0
  private active = false
  private paused = false
  private advancePending = false

  private cachedVoices: SpeechSynthesisVoice[] = []
  private readonly voiceListeners = new Set<(voices: SpeechSynthesisVoice[]) => void>()

  private keepAliveTimer: ReturnType<typeof setInterval> | null = null
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private voiceWaitTimer: ReturnType<typeof setTimeout> | null = null

  constructor(deps: SpeechServiceDeps = {}) {
    const hasWindow = typeof window !== 'undefined'
    const synth = deps.synth ?? (hasWindow ? window.speechSynthesis : undefined)
    const Utterance =
      deps.Utterance ??
      (hasWindow && 'SpeechSynthesisUtterance' in window
        ? window.SpeechSynthesisUtterance
        : undefined)

    this.synth = synth ?? null
    this.Utterance = Utterance ?? null
  }

  isSupported(): boolean {
    return this.synth !== null && this.Utterance !== null
  }

  /* ------------------------------------------------------------------ voices */

  /**
   * Resolves the device's voices, waiting for the asynchronous
   * `voiceschanged` event where the browser uses one.
   */
  loadVoices(): Promise<SpeechSynthesisVoice[]> {
    const synth = this.synth
    if (!synth) return Promise.resolve([])

    const immediate = this.readVoices()
    if (immediate.length > 0) {
      this.publishVoices(immediate)
      return Promise.resolve(immediate)
    }

    return new Promise((resolve) => {
      let settled = false
      const onVoicesChanged = () => finish()

      const finish = () => {
        if (settled) return
        settled = true
        this.clearVoiceWaitTimer()
        this.detachVoicesChanged(onVoicesChanged)
        const voices = this.readVoices()
        this.publishVoices(voices)
        resolve(voices)
      }

      this.attachVoicesChanged(onVoicesChanged)
      this.clearVoiceWaitTimer()
      this.voiceWaitTimer = setTimeout(finish, VOICE_LOAD_TIMEOUT_MS)
    })
  }

  /** Notifies on every voice list change, including late-arriving voices. */
  subscribeVoices(listener: (voices: SpeechSynthesisVoice[]) => void): () => void {
    this.voiceListeners.add(listener)
    if (this.cachedVoices.length > 0) listener(this.cachedVoices)
    return () => {
      this.voiceListeners.delete(listener)
    }
  }

  getVoices(): SpeechSynthesisVoice[] {
    return this.cachedVoices.length > 0 ? this.cachedVoices : this.readVoices()
  }

  isVoiceAvailable(voice: SpeechSynthesisVoice | null): boolean {
    if (!voice) return true
    return this.getVoices().some((candidate) => candidate.voiceURI === voice.voiceURI)
  }

  private readVoices(): SpeechSynthesisVoice[] {
    if (!this.synth?.getVoices) return []
    try {
      return this.synth.getVoices() ?? []
    } catch {
      return []
    }
  }

  private publishVoices(voices: SpeechSynthesisVoice[]): void {
    this.cachedVoices = voices
    for (const listener of this.voiceListeners) listener(voices)
  }

  private attachVoicesChanged(handler: () => void): void {
    if (typeof this.synth?.addEventListener === 'function') {
      this.synth.addEventListener('voiceschanged', handler)
    }
  }

  private detachVoicesChanged(handler: () => void): void {
    if (typeof this.synth?.removeEventListener === 'function') {
      this.synth.removeEventListener('voiceschanged', handler)
    }
  }

  private clearVoiceWaitTimer(): void {
    if (this.voiceWaitTimer !== null) {
      clearTimeout(this.voiceWaitTimer)
      this.voiceWaitTimer = null
    }
  }

  /* ----------------------------------------------------------------- control */

  /** Applies voice/rate/pitch changes to chunks that have not started yet. */
  updateSettings(settings: Partial<SpeechSettings>): void {
    this.settings = { ...this.settings, ...settings }
  }

  getSettings(): SpeechSettings {
    return this.settings
  }

  /**
   * Speaks the given text, chunk by chunk, until every chunk completes.
   * Any current playback is cancelled and restarted from the beginning.
   */
  speak(request: SpeakRequest, callbacks: SpeakCallbacks = {}): boolean {
    if (!this.isSupported()) return false

    const chunks = chunkText(request.text, { maxChars: request.chunkMaxChars })
    if (chunks.length === 0) return false

    // A restart must wait for a task boundary, because Chrome silently drops a
    // speak() issued in the same task as a cancel(). A first play, however, has
    // to stay synchronous so iOS Safari still sees the originating user gesture.
    const wasPlaying = this.active || this.synth?.speaking === true

    this.cancelCurrentSession()

    const generation = this.generation
    this.chunks = chunks
    this.settings = {
      voice: request.voice,
      rate: request.rate,
      pitch: request.pitch,
    }
    this.callbacks = callbacks

    this.active = true
    this.paused = false
    this.advancePending = false
    this.index = 0
    this.startKeepAlive()

    if (wasPlaying) {
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null
        if (generation === this.generation) this.speakNext(generation)
      }, RESTART_DELAY_MS)
    } else {
      this.speakNext(generation)
    }

    return true
  }

  pause(): boolean {
    if (!this.active || this.paused) return false
    this.paused = true
    try {
      this.synth?.pause()
    } catch {
      /* native pause is best-effort */
    }
    return true
  }

  resume(): boolean {
    if (!this.active || !this.paused) return false
    this.paused = false
    try {
      this.synth?.resume()
    } catch {
      /* native resume is best-effort */
    }
    if (this.advancePending) {
      this.advancePending = false
      this.index += 1
      this.speakNext(this.generation)
    }
    return true
  }

  /** Stops playback, clears the queue, and resets to the top of the text. */
  stop(): void {
    this.cancelCurrentSession()
    this.callbacks = {}
  }

  isSpeaking(): boolean {
    return this.active
  }

  isPaused(): boolean {
    return this.paused
  }

  /**
   * Stops speech and clears pending timers, leaving the instance reusable.
   * Used when the owning UI goes away (including React StrictMode remounts,
   * where the same instance is re-attached immediately afterwards).
   */
  release(): void {
    this.cancelCurrentSession()
    this.clearVoiceWaitTimer()
    this.callbacks = {}
  }

  /* ------------------------------------------------------------------ private */

  private cancelCurrentSession(): void {
    this.generation += 1
    this.active = false
    this.paused = false
    this.advancePending = false
    this.index = 0
    this.chunks = []
    this.clearRestartTimer()
    this.stopKeepAlive()
    try {
      this.synth?.cancel()
    } catch {
      /* nothing to cancel */
    }
  }

  private clearRestartTimer(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
  }

  private startKeepAlive(): void {
    this.stopKeepAlive()
    this.keepAliveTimer = setInterval(() => {
      if (!this.active || this.paused) return
      try {
        this.synth?.resume()
      } catch {
        /* ignore */
      }
    }, KEEP_ALIVE_INTERVAL_MS)
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer !== null) {
      clearInterval(this.keepAliveTimer)
      this.keepAliveTimer = null
    }
  }

  private speakNext(generation: number): void {
    if (generation !== this.generation || !this.active) return
    if (!this.Utterance) return
    if (this.index >= this.chunks.length) {
      this.finish(generation)
      return
    }

    const index = this.index
    const utterance = new this.Utterance(this.chunks[index])
    utterance.voice = this.settings.voice
    // The language has to be stated explicitly. Without it an engine may fall
    // back to its own default voice, which mispronounces Devanagari badly.
    utterance.lang = this.settings.voice?.lang || ''
    utterance.rate = clamp(this.settings.rate, 0.1, 10, 1)
    utterance.pitch = clamp(this.settings.pitch, 0, 2, 1)

    utterance.onstart = () => {
      if (generation !== this.generation) return
      this.callbacks.onChunkStart?.(index, this.chunks[index])
    }

    utterance.onboundary = (event) => {
      if (generation !== this.generation) return
      if (event.name && event.name !== 'word') return
      this.callbacks.onBoundary?.(event.charIndex, event.charLength ?? 0)
    }

    utterance.onend = () => {
      if (generation !== this.generation) return
      if (this.paused) {
        // Native engines may report the end of a chunk while paused; hold the
        // queue position until the user resumes.
        this.advancePending = true
        return
      }
      this.index = index + 1
      this.speakNext(generation)
    }

    utterance.onerror = (event) => {
      if (generation !== this.generation) return
      const code = (event.error ?? '') as SpeechSynthesisErrorCode
      if (BENIGN_ERRORS.has(code)) {
        this.active = false
        this.stopKeepAlive()
        return
      }
      this.fail(generation, mapErrorCode(code))
    }

    this.synth?.speak(utterance)
  }

  private finish(generation: number): void {
    if (generation !== this.generation) return
    this.active = false
    this.paused = false
    this.stopKeepAlive()
    this.callbacks.onComplete?.()
    this.callbacks = {}
  }

  private fail(generation: number, message: string): void {
    if (generation !== this.generation) return
    this.active = false
    this.paused = false
    this.stopKeepAlive()
    this.callbacks.onError?.(message)
    this.callbacks = {}
  }
}
