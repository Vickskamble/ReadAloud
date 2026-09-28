import { beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (data: unknown) => void

const bridge = {
  voices: vi.fn(),
  speak: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  openVoiceSettings: vi.fn(),
  addListener: vi.fn(),
  removeAllListeners: vi.fn(),
}

vi.mock('@capacitor/core', () => ({
  registerPlugin: () => bridge,
}))

const { NativeSpeechService } = await import('./nativeTts')

/** Emits a native event to whoever subscribed to it. */
function emit(event: string, data?: unknown): void {
  for (const call of bridge.addListener.mock.calls) {
    if (call[0] === event) (call[1] as Listener)(data)
  }
}

const androidVoice = {
  id: 'Google हिन्दी',
  name: 'Google हिन्दी',
  lang: 'hi-IN',
  local: true,
  quality: 'natural',
}

describe('NativeSpeechService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    bridge.voices.mockResolvedValue({ voices: [androidVoice] })
    bridge.speak.mockResolvedValue(undefined)
    bridge.pause.mockResolvedValue(undefined)
    bridge.resume.mockResolvedValue(undefined)
    bridge.stop.mockResolvedValue(undefined)
    bridge.openVoiceSettings.mockResolvedValue({ opened: true })
    bridge.addListener.mockResolvedValue({ remove: vi.fn() })
  })

  describe('loadVoices', () => {
    it('maps an Android voice onto the shape the app already uses', async () => {
      const service = new NativeSpeechService()

      const [voice] = await service.loadVoices()

      expect(voice.voiceURI).toBe('Google हिन्दी')
      expect(voice.lang).toBe('hi-IN')
      expect(voice.localService).toBe(true)
    })

    it('keeps the engine quality rating so ranking does not guess from the name', async () => {
      bridge.voices.mockResolvedValue({
        voices: [{ ...androidVoice, id: 'espeak-hi', name: 'espeak-hi', quality: 'basic' }],
      })
      const service = new NativeSpeechService()

      const [voice] = await service.loadVoices()
      const { classifyVoiceQuality } = await import('../utils/voices')

      expect(classifyVoiceQuality(voice)).toBe('basic')
    })

    it('marks a network voice as not local so it is ranked last', async () => {
      bridge.voices.mockResolvedValue({
        voices: [{ ...androidVoice, local: false }],
      })
      const service = new NativeSpeechService()

      const [voice] = await service.loadVoices()
      const { isRemoteVoice } = await import('../utils/voices')

      expect(isRemoteVoice(voice)).toBe(true)
    })

    it('reports no voices instead of throwing when the engine is missing', async () => {
      bridge.voices.mockRejectedValue(new Error('no engine'))
      const service = new NativeSpeechService()

      await expect(service.loadVoices()).resolves.toEqual([])
    })

    it('notifies subscribers and replays the list to late subscribers', async () => {
      const service = new NativeSpeechService()
      await service.loadVoices()

      const late = vi.fn()
      service.subscribeVoices(late)

      expect(late).toHaveBeenCalledWith([expect.objectContaining({ lang: 'hi-IN' })])
    })
  })

  describe('speak', () => {
    it('hands the whole chunk list to the engine in one call', async () => {
      const service = new NativeSpeechService()
      const text = `${'नमस्ते। यह दूसरा वाक्य है। '.repeat(12)}`

      const started = service.speak({ text, rate: 1, pitch: 1, voice: null })

      expect(started).toBe(true)
      const options = bridge.speak.mock.calls[0][0]
      expect(options.segments.length).toBeGreaterThan(1)
      // Every word reaches the engine in order. Punctuation is not spoken, so
      // the spoken text is the words only, not the source text verbatim.
      const spoken = options.segments.map((s: { text: string }) => s.text).join(' ')
      const words = (value: string) => value.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ')
      expect(words(spoken)).toEqual(words(text))
      expect(options.segments.every((s: { lang: string }) => typeof s.lang === 'string')).toBe(true)
    })

    it('passes the chosen voice to the engine', async () => {
      const service = new NativeSpeechService()
      const [voice] = await service.loadVoices()

      service.speak({ text: 'नमस्ते', rate: 1, pitch: 1, voice: voice! })

      const options = bridge.speak.mock.calls[0][0]
      expect(options.voiceId).toBe('Google हिन्दी')
      // The language travels per segment now, not once for the whole call.
      expect(options.segments[0].lang).toBe('hi-IN')
    })

    it('marks mixed-language text so the engine can switch voice per segment', async () => {
      const service = new NativeSpeechService()

      service.speak({ text: 'Aaj mujhe office jaana hai.', rate: 1, pitch: 1, voice: null })

      const options = bridge.speak.mock.calls[0][0]
      expect(options.segments.map((s: { lang: string }) => s.lang)).toContain('hi-IN')
    })

    it('refuses to start with no text', () => {
      const service = new NativeSpeechService()

      expect(service.speak({ text: '   ', rate: 1, pitch: 1, voice: null })).toBe(false)
      expect(bridge.speak).not.toHaveBeenCalled()
    })

    it('reports a voice problem when the engine rejects the start', async () => {
      bridge.speak.mockRejectedValue(new Error('language unavailable'))
      const service = new NativeSpeechService()
      const onError = vi.fn()

      service.speak({ text: 'नमस्ते', rate: 1, pitch: 1, voice: null }, { onError })

      await vi.waitFor(() => expect(onError).toHaveBeenCalled())
      expect(onError.mock.calls[0][0]).toMatch(/voice|language/i)
    })
  })

  describe('events', () => {
    it('forwards the word position that drives the caption and wave', async () => {
      const service = new NativeSpeechService()
      const onBoundary = vi.fn()
      service.speak({ text: 'नमस्ते', rate: 1, pitch: 1, voice: null }, { onBoundary })
      await vi.waitFor(() => expect(bridge.addListener).toHaveBeenCalled())

      emit('ttsBoundary', { index: 0, charIndex: 4, charLength: 3 })

      expect(onBoundary).toHaveBeenCalledWith(4, 3)
    })

    it('reports the chunk that is being read', async () => {
      const service = new NativeSpeechService()
      const onChunkStart = vi.fn()
      service.speak({ text: 'नमस्ते', rate: 1, pitch: 1, voice: null }, { onChunkStart })
      await vi.waitFor(() => expect(bridge.addListener).toHaveBeenCalled())

      emit('ttsChunkStart', { index: 0, total: 3, text: 'नमस्ते' })

      expect(onChunkStart).toHaveBeenCalledWith(0, 'नमस्ते')
    })

    it('ignores events from a previous reading', async () => {
      const service = new NativeSpeechService()
      const onBoundary = vi.fn()
      service.speak({ text: 'पहला', rate: 1, pitch: 1, voice: null }, { onBoundary })
      await vi.waitFor(() => expect(bridge.addListener).toHaveBeenCalled())

      service.speak({ text: 'दूसरा', rate: 1, pitch: 1, voice: null })
      emit('ttsBoundary', { index: 0, charIndex: 2, charLength: 1 })

      expect(onBoundary).not.toHaveBeenCalled()
    })

    it('reports completion once the last chunk finishes', async () => {
      const service = new NativeSpeechService()
      const onComplete = vi.fn()
      service.speak({ text: 'नमस्ते', rate: 1, pitch: 1, voice: null }, { onComplete })
      await vi.waitFor(() => expect(bridge.addListener).toHaveBeenCalled())

      emit('ttsComplete')

      expect(onComplete).toHaveBeenCalledTimes(1)
    })

    it('surfaces the engine error message', async () => {
      const service = new NativeSpeechService()
      const onError = vi.fn()
      service.speak({ text: 'नमस्ते', rate: 1, pitch: 1, voice: null }, { onError })
      await vi.waitFor(() => expect(bridge.addListener).toHaveBeenCalled())

      emit('ttsError', { message: 'Engine is busy' })

      expect(onError).toHaveBeenCalledWith('Engine is busy')
    })
  })

  describe('control', () => {
    it('pauses only while reading, and only once', () => {
      const service = new NativeSpeechService()

      expect(service.pause()).toBe(false)
      service.speak({ text: 'नमस्ते', rate: 1, pitch: 1, voice: null })

      expect(service.pause()).toBe(true)
      expect(service.pause()).toBe(false)
      expect(bridge.pause).toHaveBeenCalledTimes(1)
    })

    it('resumes only after a pause', () => {
      const service = new NativeSpeechService()
      service.speak({ text: 'नमस्ते', rate: 1, pitch: 1, voice: null })

      expect(service.resume()).toBe(false)
      service.pause()
      expect(service.resume()).toBe(true)
      expect(bridge.resume).toHaveBeenCalledTimes(1)
    })

    it('stops the engine and drops the callbacks', () => {
      const service = new NativeSpeechService()
      const onComplete = vi.fn()
      service.speak({ text: 'नमस्ते', rate: 1, pitch: 1, voice: null }, { onComplete })

      service.stop()
      emit('ttsComplete')

      expect(bridge.stop).toHaveBeenCalled()
      expect(onComplete).not.toHaveBeenCalled()
      expect(service.isSpeaking()).toBe(false)
    })

    it('re-reads an empty voice list once the engine reports it is ready', async () => {
      bridge.voices.mockResolvedValue({ voices: [] })
      const service = new NativeSpeechService()
      await service.loadVoices()
      expect(service.getVoices()).toHaveLength(0)

      emit('ttsReady')

      await vi.waitFor(() => expect(bridge.voices).toHaveBeenCalled())
    })

    it('does not re-read a voice list it already has', async () => {
      const service = new NativeSpeechService()
      await service.loadVoices()
      bridge.voices.mockClear()

      emit('ttsReady')

      await Promise.resolve()
      expect(bridge.voices).not.toHaveBeenCalled()
    })
  })
})
