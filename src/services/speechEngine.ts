import type {
  SpeakCallbacks,
  SpeakRequest,
  SpeechSettings,
} from './speechService'

export type {
  SpeakCallbacks,
  SpeakRequest,
  SpeechSettings,
} from './speechService'

/**
 * The surface the reading UI needs from a speech engine.
 *
 * Two implementations satisfy it: the browser's Web Speech engine (used in a
 * normal browser) and Android's platform text engine (used in the app). The UI
 * never branches on which one it is talking to.
 */
export interface SpeechEngine {
  isSupported(): boolean
  loadVoices(): Promise<SpeechSynthesisVoice[]>
  subscribeVoices(listener: (voices: SpeechSynthesisVoice[]) => void): () => void
  getVoices(): SpeechSynthesisVoice[]
  updateSettings(settings: Partial<SpeechSettings>): void
  speak(request: SpeakRequest, callbacks?: SpeakCallbacks): boolean
  pause(): boolean
  resume(): boolean
  stop(): void
  isSpeaking(): boolean
  isPaused(): boolean
  release(): void
}
