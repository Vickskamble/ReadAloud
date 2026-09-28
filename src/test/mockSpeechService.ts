import type { SpeakCallbacks, SpeakRequest } from '../services/speechService'

/**
 * Test double for SpeechService. Each test file creates an instance, points a
 * module-level `instance` reference at it, and drives the callbacks by hand.
 */
export class MockSpeechService {
  supported = true
  availableVoices: SpeechSynthesisVoice[] = []
  speakResult = true
  pauseResult = true
  resumeResult = true
  lastRequest: SpeakRequest | null = null
  lastCallbacks: SpeakCallbacks = {}
  stopCount = 0
  releaseCount = 0
  updateSettingsCount = 0
  lastSettings: unknown = null
  openVoiceSettingsCalls = 0
  /** Set false to model a platform that cannot open voice settings. */
  canOpenVoiceSettings = true

  private listener: ((voices: SpeechSynthesisVoice[]) => void) | null = null

  isSupported(): boolean {
    return this.supported
  }

  loadVoices(): Promise<SpeechSynthesisVoice[]> {
    this.listener?.(this.availableVoices)
    return Promise.resolve(this.availableVoices)
  }

  subscribeVoices(listener: (voices: SpeechSynthesisVoice[]) => void): () => void {
    this.listener = listener
    return () => {
      this.listener = null
    }
  }

  emitVoices(voices: SpeechSynthesisVoice[]): void {
    this.availableVoices = voices
    this.listener?.(voices)
  }

  isVoiceAvailable(voice: SpeechSynthesisVoice | null): boolean {
    if (!voice) return true
    return this.availableVoices.some((candidate) => candidate.voiceURI === voice.voiceURI)
  }

  updateSettings(settings: unknown): void {
    this.updateSettingsCount += 1
    this.lastSettings = settings
  }

  speak(request: SpeakRequest, callbacks: SpeakCallbacks = {}): boolean {
    this.lastRequest = request
    this.lastCallbacks = callbacks
    return this.speakResult
  }

  pause(): boolean {
    return this.pauseResult
  }

  resume(): boolean {
    return this.resumeResult
  }

  stop(): void {
    this.stopCount += 1
  }

  openVoiceSettings(): Promise<boolean> {
    this.openVoiceSettingsCalls += 1
    return Promise.resolve(this.canOpenVoiceSettings)
  }

  release(): void {
    this.releaseCount += 1
  }
}
