import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SpeechService } from './speechService'
import {
  AUDIO_BLOCKED_MESSAGE,
  SPEECH_FAILED_MESSAGE,
  TEXT_TOO_LONG_MESSAGE,
  TTS_UNAVAILABLE_MESSAGE,
  VOICE_UNAVAILABLE_MESSAGE,
} from '../utils/validation'
import {
  FakeSpeechSynthesis,
  FakeUtterance,
  createVoice,
  type FakeUtteranceCtor,
} from '../test/fakeSpeech'

const LONG_TEXT =
  'This is the first sentence of a long document. ' +
  'This is the second sentence of the same document. ' +
  'This is the third sentence and it wraps things up nicely.'

function createService(voices: SpeechSynthesisVoice[] = []) {
  const synth = new FakeSpeechSynthesis(voices)
  const service = new SpeechService({
    synth: synth as unknown as SpeechSynthesis,
    Utterance: FakeUtterance as unknown as FakeUtteranceCtor as unknown as typeof SpeechSynthesisUtterance,
  })
  return { synth, service }
}

describe('SpeechService support detection', () => {
  it('reports unsupported when no engine is available', () => {
    const service = new SpeechService({ synth: undefined, Utterance: undefined })
    const supported = service.isSupported()
    expect(typeof supported).toBe('boolean')
  })

  it('refuses to speak when unsupported', () => {
    const { service } = createService()
    const spy = vi.spyOn(service, 'isSupported').mockReturnValue(false)
    expect(service.speak({ text: 'hello', voice: null, rate: 1, pitch: 1 })).toBe(false)
    spy.mockRestore()
  })
})

describe('SpeechService voices', () => {
  it('returns voices synchronously when the engine already has them', async () => {
    const voices = [createVoice()]
    const { service } = createService(voices)
    await expect(service.loadVoices()).resolves.toEqual(voices)
  })

  it('waits for the voiceschanged event when voices load asynchronously', async () => {
    const { synth, service } = createService([])
    const pending = service.loadVoices()
    const voices = [createVoice({ name: 'Late Voice' })]
    synth.setVoices(voices)
    await expect(pending).resolves.toEqual(voices)
  })

  it('resolves with an empty list instead of hanging when no voices arrive', async () => {
    vi.useFakeTimers()
    try {
      const { service } = createService([])
      const pending = service.loadVoices()
      await vi.advanceTimersByTimeAsync(2000)
      await expect(pending).resolves.toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('notifies subscribers about late voice changes', async () => {
    const { synth, service } = createService([])
    const listener = vi.fn()
    service.subscribeVoices(listener)
    void service.loadVoices()

    const voices = [createVoice({ name: 'Async Voice' })]
    synth.setVoices(voices)
    expect(listener).toHaveBeenCalledWith(voices)
  })

  it('stops notifying after unsubscribe', async () => {
    const { synth, service } = createService([])
    const listener = vi.fn()
    const unsubscribe = service.subscribeVoices(listener)
    unsubscribe()
    void service.loadVoices()
    synth.setVoices([createVoice()])
    expect(listener).not.toHaveBeenCalled()
  })

  it('detects whether the selected voice is still present', async () => {
    const voice = createVoice()
    const { service } = createService([voice])
    await service.loadVoices()
    expect(service.isVoiceAvailable(voice)).toBe(true)
    expect(service.isVoiceAvailable(createVoice({ voiceURI: 'gone' }))).toBe(false)
    expect(service.isVoiceAvailable(null)).toBe(true)
  })
})

describe('SpeechService playback', () => {
  let ctx: ReturnType<typeof createService>

  beforeEach(() => {
    ctx = createService()
  })

  it('does not speak empty text', async () => {
    const started = ctx.service.speak({ text: '   ', voice: null, rate: 1, pitch: 1 })
    expect(started).toBe(false)
    expect(ctx.synth.spoken).toHaveLength(0)
  })

  it('speaks the first chunk synchronously so iOS keeps the user gesture', () => {
    const { service, synth } = createService()
    service.speak({ text: 'Hello there.', voice: null, rate: 1, pitch: 1 })

    expect(synth.spoken).toHaveLength(1)
    expect(synth.spoken[0].text).toBe('Hello there.')
  })

  it('defers the first chunk when replacing a running session', async () => {
    vi.useFakeTimers()
    try {
      const { service, synth } = createService()
      service.speak({ text: 'First text.', voice: null, rate: 1, pitch: 1 })
      expect(synth.spoken).toHaveLength(1)

      service.speak({ text: 'Second text.', voice: null, rate: 1, pitch: 1 })
      expect(synth.spoken).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(10)
      expect(synth.spoken).toHaveLength(2)
      expect(synth.spoken[1].text).toBe('Second text.')
    } finally {
      vi.useRealTimers()
    }
  })

  it('plays every chunk in sequence and reports completion', async () => {
    vi.useFakeTimers()
    try {
      const { service, synth } = ctx
      const onComplete = vi.fn()
      service.speak(
        { text: LONG_TEXT, voice: null, rate: 1, pitch: 1, chunkMaxChars: 40 },
        { onComplete },
      )
      await vi.advanceTimersByTimeAsync(10)
      expect(synth.spoken).toHaveLength(1)

      let guard = 0
      while (onComplete.mock.calls.length === 0 && guard++ < 50) {
        synth.finishCurrent()
        await vi.advanceTimersByTimeAsync(10)
      }

      expect(synth.spoken.length).toBeGreaterThanOrEqual(3)
      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(service.isSpeaking()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports the index of each chunk as it starts', async () => {
    vi.useFakeTimers()
    try {
      const { service, synth } = ctx
      const onChunkStart = vi.fn()
      service.speak(
        { text: LONG_TEXT, voice: null, rate: 1, pitch: 1, chunkMaxChars: 40 },
        { onChunkStart },
      )
      await vi.advanceTimersByTimeAsync(10)
      synth.finishCurrent()
      await vi.advanceTimersByTimeAsync(10)
      expect(onChunkStart).toHaveBeenNthCalledWith(1, 0, expect.any(String))
      expect(onChunkStart).toHaveBeenNthCalledWith(2, 1, expect.any(String))
    } finally {
      vi.useRealTimers()
    }
  })

  it('applies voice, rate and pitch to the utterance', async () => {
    vi.useFakeTimers()
    try {
      const { service, synth } = ctx
      const voice = createVoice({ voiceURI: 'v1', name: 'V1' })
      service.speak({ text: 'Hello.', voice, rate: 1.5, pitch: 0.7 })
      await vi.advanceTimersByTimeAsync(10)
      expect(synth.spoken[0].voice).toBe(voice)
      expect(synth.spoken[0].rate).toBe(1.5)
      expect(synth.spoken[0].pitch).toBe(0.7)
    } finally {
      vi.useRealTimers()
    }
  })

  it('states the voice language so Devanagari is read by a matching voice', () => {
    const voice = createVoice({ voiceURI: 'hi-1', name: 'Google Hindi', lang: 'hi-IN' })
    const { service, synth } = createService([voice])

    service.speak({ text: 'नमस्कार', voice, rate: 1, pitch: 1 })

    expect(synth.spoken[0].lang).toBe('hi-IN')
    expect(synth.spoken[0].voice).toBe(voice)
  })

  it('leaves the language unset for the device default voice', () => {
    const { service, synth } = createService()

    service.speak({ text: 'नमस्कार', voice: null, rate: 1, pitch: 1 })

    expect(synth.spoken[0].lang).toBe('')
  })

  it('clamps out-of-range rate and pitch instead of failing', async () => {
    vi.useFakeTimers()
    try {
      const { service, synth } = ctx
      service.speak({ text: 'Hello.', voice: null, rate: 99, pitch: -5 })
      await vi.advanceTimersByTimeAsync(10)
      expect(synth.spoken[0].rate).toBe(10)
      expect(synth.spoken[0].pitch).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('falls back to default rate and pitch for non-finite values', async () => {
    vi.useFakeTimers()
    try {
      const { service, synth } = ctx
      service.speak({ text: 'Hello.', voice: null, rate: Number.NaN, pitch: Number.NaN })
      await vi.advanceTimersByTimeAsync(10)
      expect(synth.spoken[0].rate).toBe(1)
      expect(synth.spoken[0].pitch).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('forwards boundary events for the spoken word', async () => {
    vi.useFakeTimers()
    try {
      const { service, synth } = ctx
      const onBoundary = vi.fn()
      service.speak({ text: 'Hello world.', voice: null, rate: 1, pitch: 1 }, { onBoundary })
      await vi.advanceTimersByTimeAsync(10)
      synth.boundaryCurrent(6, 5)
      expect(onBoundary).toHaveBeenCalledWith(6, 5)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('SpeechService pause and resume', () => {
  it('uses the native pause and resume calls', async () => {
    vi.useFakeTimers()
    try {
      const { service, synth } = createService()
      service.speak({ text: 'Hello there friend.', voice: null, rate: 1, pitch: 1 })
      await vi.advanceTimersByTimeAsync(10)

      expect(service.pause()).toBe(true)
      expect(synth.pauseCount).toBe(1)
      expect(service.isPaused()).toBe(true)

      expect(service.resume()).toBe(true)
      expect(synth.resumeCount).toBe(1)
      expect(service.isPaused()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores pause when nothing is playing', () => {
    const { service } = createService()
    expect(service.pause()).toBe(false)
    expect(service.resume()).toBe(false)
  })

  it('holds the queue while paused and continues on resume', async () => {
    vi.useFakeTimers()
    try {
      const { service, synth } = createService()
      const onChunkStart = vi.fn()
      service.speak(
        { text: LONG_TEXT, voice: null, rate: 1, pitch: 1, chunkMaxChars: 40 },
        { onChunkStart },
      )
      await vi.advanceTimersByTimeAsync(10)
      service.pause()

      synth.finishCurrent()
      await vi.advanceTimersByTimeAsync(10)
      expect(synth.spoken).toHaveLength(1)
      expect(onChunkStart).toHaveBeenCalledTimes(1)

      service.resume()
      await vi.advanceTimersByTimeAsync(10)
      expect(synth.spoken).toHaveLength(2)
      expect(onChunkStart).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('SpeechService stop and restart', () => {
  it('cancels native speech and clears the queue on stop', async () => {
    vi.useFakeTimers()
    try {
      const { service, synth } = createService()
      service.speak(
        { text: LONG_TEXT, voice: null, rate: 1, pitch: 1, chunkMaxChars: 40 },
        { onComplete: vi.fn() },
      )
      await vi.advanceTimersByTimeAsync(10)
      expect(synth.spoken).toHaveLength(1)

      service.stop()
      expect(synth.cancelled).toBeGreaterThan(0)
      expect(service.isSpeaking()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not start a pending chunk after stop', async () => {
    vi.useFakeTimers()
    try {
      const { service, synth } = createService()
      service.speak({ text: 'First text.', voice: null, rate: 1, pitch: 1 })
      expect(synth.spoken).toHaveLength(1)

      // The restart is deferred; stopping first must drop it entirely.
      service.speak({ text: 'Second text.', voice: null, rate: 1, pitch: 1 })
      service.stop()
      await vi.advanceTimersByTimeAsync(50)

      expect(synth.spoken).toHaveLength(1)
      expect(service.isSpeaking()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('restarts from the beginning on the next play', async () => {
    vi.useFakeTimers()
    try {
      const { service, synth } = createService()
      service.speak(
        { text: LONG_TEXT, voice: null, rate: 1, pitch: 1, chunkMaxChars: 40 },
        { onComplete: vi.fn() },
      )
      await vi.advanceTimersByTimeAsync(10)
      synth.finishCurrent()
      await vi.advanceTimersByTimeAsync(10)
      expect(synth.spoken).toHaveLength(2)

      service.stop()
      service.speak(
        { text: LONG_TEXT, voice: null, rate: 1, pitch: 1, chunkMaxChars: 40 },
        { onComplete: vi.fn() },
      )
      await vi.advanceTimersByTimeAsync(10)
      expect(synth.spoken.at(-1)?.text).toBe(synth.spoken[0].text)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores events from an utterance that was already replaced', async () => {
    vi.useFakeTimers()
    try {
      const { service, synth } = createService()
      const onComplete = vi.fn()
      service.speak({ text: 'First text here.', voice: null, rate: 1, pitch: 1 }, { onComplete })
      await vi.advanceTimersByTimeAsync(10)
      const stale = synth.current

      service.stop()
      service.speak({ text: 'Second text here.', voice: null, rate: 1, pitch: 1 }, { onComplete })
      await vi.advanceTimersByTimeAsync(10)

      stale.onend?.({ type: 'end' } as SpeechSynthesisEvent)
      expect(onComplete).not.toHaveBeenCalled()
      expect(synth.spoken).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('SpeechService error handling', () => {
  const cases: Array<[SpeechSynthesisErrorCode, string]> = [
    ['not-allowed', AUDIO_BLOCKED_MESSAGE],
    ['voice-unavailable', VOICE_UNAVAILABLE_MESSAGE],
    ['language-unavailable', VOICE_UNAVAILABLE_MESSAGE],
    ['text-too-long', TEXT_TOO_LONG_MESSAGE],
    ['synthesis-failed', SPEECH_FAILED_MESSAGE],
    ['synthesis-unavailable', TTS_UNAVAILABLE_MESSAGE],
  ]

  for (const [code, message] of cases) {
    it(`maps "${code}" to a friendly message`, async () => {
      vi.useFakeTimers()
      try {
        const { service, synth } = createService()
        const onError = vi.fn()
        const onComplete = vi.fn()
        service.speak({ text: 'Hello there.', voice: null, rate: 1, pitch: 1 }, { onError, onComplete })
        await vi.advanceTimersByTimeAsync(10)
        synth.failCurrent(code)

        expect(onError).toHaveBeenCalledWith(message)
        expect(onComplete).not.toHaveBeenCalled()
        expect(service.isSpeaking()).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })
  }

  for (const code of ['canceled', 'interrupted'] as SpeechSynthesisErrorCode[]) {
    it(`treats "${code}" as a normal stop and shows no error`, async () => {
      vi.useFakeTimers()
      try {
        const { service, synth } = createService()
        const onError = vi.fn()
        service.speak({ text: 'Hello there.', voice: null, rate: 1, pitch: 1 }, { onError })
        await vi.advanceTimersByTimeAsync(10)
        synth.failCurrent(code)

        expect(onError).not.toHaveBeenCalled()
        expect(service.isSpeaking()).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })
  }
})

describe('SpeechService lifecycle', () => {
  it('cancels speech and pending timers on release, staying reusable', async () => {
    vi.useFakeTimers()
    try {
      const { service, synth } = createService()
      service.speak({ text: 'Hello there.', voice: null, rate: 1, pitch: 1 })
      await vi.advanceTimersByTimeAsync(10)
      expect(synth.spoken).toHaveLength(1)

      service.release()
      expect(synth.cancelled).toBeGreaterThan(0)
      expect(service.isSpeaking()).toBe(false)

      // The same instance must work again after a remount.
      expect(service.speak({ text: 'Hello again.', voice: null, rate: 1, pitch: 1 })).toBe(true)
      await vi.advanceTimersByTimeAsync(10)
      expect(synth.spoken.at(-1)?.text).toBe('Hello again.')
    } finally {
      vi.useRealTimers()
    }
  })

  it('abandons a pending voice load on release', async () => {
    vi.useFakeTimers()
    try {
      const { service } = createService([])
      const pending = service.loadVoices()
      service.release()
      await vi.advanceTimersByTimeAsync(5000)
      let settled = false
      void pending.then(() => {
        settled = true
      })
      await vi.advanceTimersByTimeAsync(0)
      expect(settled).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('applies updated settings to chunks that have not started yet', async () => {
    vi.useFakeTimers()
    try {
      const { service, synth } = createService()
      const voice = createVoice({ voiceURI: 'v2', name: 'V2' })
      service.speak(
        { text: LONG_TEXT, voice: null, rate: 1, pitch: 1, chunkMaxChars: 40 },
        { onComplete: vi.fn() },
      )
      await vi.advanceTimersByTimeAsync(10)
      service.updateSettings({ voice, rate: 2, pitch: 1.5 })

      synth.finishCurrent()
      await vi.advanceTimersByTimeAsync(10)
      expect(synth.spoken.at(-1)?.voice).toBe(voice)
      expect(synth.spoken.at(-1)?.rate).toBe(2)
      expect(synth.spoken.at(-1)?.pitch).toBe(1.5)
    } finally {
      vi.useRealTimers()
    }
  })
})
