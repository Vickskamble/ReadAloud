/**
 * Minimal, controllable stand-in for the browser speech engine.
 * jsdom does not implement SpeechSynthesis, so tests drive this instead.
 */
export class FakeUtterance {
  text: string
  lang = ''
  voice: SpeechSynthesisVoice | null = null
  volume = 1
  rate = 1
  pitch = 1

  onstart: ((event: SpeechSynthesisEvent) => void) | null = null
  onend: ((event: SpeechSynthesisEvent) => void) | null = null
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null
  onboundary: ((event: SpeechSynthesisEvent) => void) | null = null

  constructor(text: string) {
    this.text = text
  }
}

export type FakeUtteranceCtor = new (text: string) => FakeUtterance

export class FakeSpeechSynthesis extends EventTarget {
  spoken: FakeUtterance[] = []
  cancelled = 0
  pauseCount = 0
  resumeCount = 0
  voices: SpeechSynthesisVoice[] = []
  speaking = false
  paused = false

  constructor(voices: SpeechSynthesisVoice[] = []) {
    super()
    this.voices = voices
  }

  getVoices(): SpeechSynthesisVoice[] {
    return this.voices
  }

  speak(utterance: FakeUtterance): void {
    this.spoken.push(utterance as unknown as SpeechSynthesisUtterance)
    this.speaking = true
    this.paused = false
    utterance.onstart?.({ type: 'start' } as SpeechSynthesisEvent)
  }

  cancel(): void {
    this.cancelled += 1
    this.speaking = false
    this.paused = false
  }

  pause(): void {
    this.pauseCount += 1
    this.paused = true
  }

  resume(): void {
    this.resumeCount += 1
    this.paused = false
  }

  /* ------------------------------------------------------------- test drivers */

  setVoices(voices: SpeechSynthesisVoice[]): void {
    this.voices = voices
    this.dispatchEvent(new Event('voiceschanged'))
  }

  get current(): FakeUtterance {
    const utterance = this.spoken.at(-1)
    if (!utterance) throw new Error('No utterance has been spoken yet')
    return utterance
  }

  finishCurrent(): void {
    const utterance = this.current
    this.speaking = false
    utterance.onend?.({ type: 'end' } as SpeechSynthesisEvent)
  }

  failCurrent(error: SpeechSynthesisErrorCode): void {
    const utterance = this.current
    this.speaking = false
    utterance.onerror?.({ type: 'error', error } as SpeechSynthesisErrorEvent)
  }

  boundaryCurrent(charIndex: number, charLength = 0): void {
    this.current.onboundary?.({
      type: 'boundary',
      name: 'word',
      charIndex,
      charLength,
    } as SpeechSynthesisEvent)
  }
}

export function createVoice(overrides: Partial<SpeechSynthesisVoice> = {}): SpeechSynthesisVoice {
  return {
    voiceURI: 'mock-voice',
    name: 'Mock Voice',
    lang: 'en-US',
    localService: true,
    default: false,
    ...overrides,
  } as SpeechSynthesisVoice
}
