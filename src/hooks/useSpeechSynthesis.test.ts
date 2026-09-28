import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSpeechSynthesis } from './useSpeechSynthesis'
import type { SpeakCallbacks, SpeakRequest } from '../services/speechService'
import { MAX_TEXT_LENGTH } from '../utils/constants'
import { AUTO_VOICE } from '../utils/voices'
import { createVoice } from '../test/fakeSpeech'

class MockSpeechService {
  supported = true
  availableVoices: SpeechSynthesisVoice[] = []
  speakResult = true
  lastRequest: SpeakRequest | null = null
  lastCallbacks: SpeakCallbacks = {}
  pauseResult = true
  resumeResult = true
  stopCount = 0
  releaseCount = 0
  updateSettingsCount = 0
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

  updateSettings(): void {
    this.updateSettingsCount += 1
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

  release(): void {
    this.releaseCount += 1
  }
}

let instance: MockSpeechService

vi.mock('../services/speechService', () => ({
  // A normal function (not an arrow) so it can be used with `new`.
  SpeechService: vi.fn(function createMockService() {
    return instance
  }),
}))

/**
 * A device with the voices the app expects. Playback is blocked when a
 * language has no installed voice, so a test that expects speech to start
 * needs a device that can actually speak the text.
 */
const DEVICE_VOICES: SpeechSynthesisVoice[] = [
  createVoice({ voiceURI: 'v1' }),
  createVoice({ voiceURI: 'hi-1', name: 'Swara', lang: 'hi-IN' }),
]

function setup(
  overrides: Partial<Parameters<typeof useSpeechSynthesis>[0]> = {},
  voices: SpeechSynthesisVoice[] = DEVICE_VOICES,
  supported = true,
) {
  instance = new MockSpeechService()
  instance.availableVoices = voices
  instance.supported = supported
  return renderHook(
    (props: Parameters<typeof useSpeechSynthesis>[0]) => useSpeechSynthesis(props),
    {
      initialProps: {
        text: 'Hello world.',
        voiceURI: '',
        rate: 1,
        pitch: 1,
        ...overrides,
      },
    },
  )
}

describe('useSpeechSynthesis startup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('discovers the voices exposed by the device', async () => {
    const voices = [createVoice({ voiceURI: 'v1' })]
    const { result } = setup({}, voices)
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))
    expect(result.current.voices).toEqual(voices)
    expect(result.current.hasNoVoices).toBe(false)
  })

  it('reports when the device exposes no voices at all', async () => {
    const { result } = setup({}, [])
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))
    expect(result.current.hasNoVoices).toBe(true)
  })

  it('updates the voice list when voices arrive late', async () => {
    const { result } = setup({}, [])
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))

    act(() => instance.emitVoices([createVoice({ voiceURI: 'late' })]))
    expect(result.current.voices).toHaveLength(1)
    expect(result.current.hasNoVoices).toBe(false)
  })

  it('shows a clear message when the engine is unavailable', async () => {
    const { result } = setup({}, [], false)
    await waitFor(() => expect(result.current.supported).toBe(false))
    expect(result.current.message).toBe(
      'Text-to-Speech is not available on this device/browser. Please try another browser or install a supported voice.',
    )
    expect(result.current.status).toBe('idle')
    expect(result.current.voicesLoading).toBe(false)
  })

  it('cannot play when the engine is unavailable', async () => {
    const { result } = setup({}, [], false)
    await waitFor(() => expect(result.current.supported).toBe(false))
    act(() => result.current.play())
    expect(result.current.status).toBe('idle')
    expect(instance.lastRequest).toBeNull()
  })

  it('releases the engine on unmount so no speech is left running', async () => {
    const { result, unmount } = setup({}, [])
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))
    const service = instance
    unmount()
    expect(service.releaseCount).toBe(1)
  })
})

describe('useSpeechSynthesis playback controls', () => {
  it('starts reading and reports the chunk plan', async () => {
    const sentence = 'This sentence is here to make the document comfortably long. '
    const text = sentence.repeat(6)
    const { result } = setup({ text })
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))

    act(() => result.current.play())

    expect(result.current.status).toBe('reading')
    expect(result.current.isReading).toBe(true)
    expect(instance.lastRequest?.text).toBe(text)
    expect(result.current.totalChunks).toBeGreaterThan(1)
    expect(result.current.chunkIndex).toBe(0)
  })

  it('forwards the selected voice, rate and pitch', async () => {
    const voice = createVoice({ voiceURI: 'v1' })
    const { result } = setup({ voiceURI: 'v1', rate: 1.5, pitch: 0.7 }, [voice])
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))

    act(() => result.current.play())
    expect(instance.lastRequest?.voice).toBe(voice)
    expect(instance.lastRequest?.rate).toBe(1.5)
    expect(instance.lastRequest?.pitch).toBe(0.7)
  })

  it('uses the device default voice when the user asks for it', async () => {
    const { result } = setup({ voiceURI: '' }, [createVoice({ voiceURI: 'v1' })])
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))

    act(() => result.current.play())
    expect(instance.lastRequest?.voice).toBeNull()
  })

  it('picks the best Hindi or Marathi voice when there is no preference yet', async () => {
    const { result } = setup({ voiceURI: AUTO_VOICE }, [
      createVoice({ voiceURI: 'en', name: 'Google US English', lang: 'en-US' }),
      createVoice({ voiceURI: 'hi', name: 'Google Hindi', lang: 'hi-IN' }),
    ])
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))

    expect(result.current.activeVoiceURI).toBe('hi')

    act(() => result.current.play())
    expect(instance.lastRequest?.voice?.voiceURI).toBe('hi')
  })

  it('ignores the automatic pick when the user chooses the device default', async () => {
    const { result } = setup({ voiceURI: '' }, [
      createVoice({ voiceURI: 'hi', name: 'Google Hindi', lang: 'hi-IN' }),
    ])
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))

    expect(result.current.activeVoiceURI).toBe('')
    expect(result.current.selectedVoice).toBeNull()
  })

  it('refuses to play empty text and explains why', async () => {
    const { result } = setup({ text: '   ' })
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))

    act(() => result.current.play())
    expect(result.current.status).toBe('idle')
    expect(result.current.message).toBe('Please enter some text first.')
    expect(instance.lastRequest).toBeNull()
  })

  it('refuses to play oversized text instead of truncating it', async () => {
    const { result } = setup({ text: 'a'.repeat(MAX_TEXT_LENGTH + 1) })
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))

    act(() => result.current.play())
    expect(result.current.status).toBe('idle')
    expect(result.current.message).toBe(
      'This text is too long to read. Please shorten it or split it into smaller parts.',
    )
    expect(instance.lastRequest).toBeNull()
  })

  it('explains when the chosen voice has disappeared', async () => {
    const { result } = setup({ voiceURI: 'gone' }, [])
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))

    act(() => result.current.play())
    expect(result.current.status).toBe('idle')
    expect(result.current.message).toBe(
      'The selected voice is no longer available. Please choose another voice.',
    )
  })

  it('explains when a previously available voice is dropped by the device', async () => {
    const voice = createVoice({ voiceURI: 'v1' })
    const { result } = setup({ voiceURI: 'v1' }, [voice])
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))

    act(() => instance.emitVoices([]))
    act(() => result.current.play())

    expect(result.current.status).toBe('idle')
    expect(result.current.message).toBe(
      'The selected voice is no longer available. Please choose another voice.',
    )
  })

  it('pauses and resumes using the native engine', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))

    act(() => result.current.play())
    act(() => result.current.pause())
    expect(result.current.status).toBe('paused')
    expect(result.current.isPaused).toBe(true)

    act(() => result.current.resume())
    expect(result.current.status).toBe('reading')
  })

  it('treats play as resume while paused', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))

    act(() => result.current.play())
    act(() => result.current.pause())
    act(() => result.current.play())
    expect(result.current.status).toBe('reading')
  })

  it('ignores a second play while already reading', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))

    act(() => result.current.play())
    act(() => result.current.play())
    expect(result.current.status).toBe('reading')
  })

  it('stops playback and resets progress', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))

    act(() => result.current.play())
    act(() => instance.lastCallbacks.onChunkStart?.(1, 'Second chunk of text.'))
    expect(result.current.chunkIndex).toBe(1)

    act(() => result.current.stop())
    expect(instance.stopCount).toBe(1)
    expect(result.current.status).toBe('idle')
    expect(result.current.chunkIndex).toBe(0)
    expect(result.current.totalChunks).toBe(0)
  })

  it('clears speech, queue and message state', async () => {
    const { result } = setup({ text: '' })
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))

    act(() => result.current.play())
    expect(result.current.message).not.toBeNull()

    act(() => result.current.clear())
    expect(instance.stopCount).toBeGreaterThan(0)
    expect(result.current.status).toBe('idle')
    expect(result.current.message).toBeNull()
    expect(result.current.totalChunks).toBe(0)
  })

  it('marks the reading as completed when the last chunk finishes', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))

    act(() => result.current.play())
    act(() => instance.lastCallbacks.onComplete?.())
    expect(result.current.status).toBe('completed')
    expect(result.current.isReading).toBe(false)
  })

  it('surfaces engine errors and returns to idle', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))

    act(() => result.current.play())
    act(() => instance.lastCallbacks.onError?.('Something went wrong.'))

    expect(result.current.status).toBe('idle')
    expect(result.current.message).toBe('Something went wrong.')
  })

  it('can dismiss a message', async () => {
    const { result } = setup({ text: '' })
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))

    act(() => result.current.play())
    act(() => result.current.dismissMessage())
    expect(result.current.message).toBeNull()
  })

  it('applies later voice, rate and pitch changes to the running queue', async () => {
    const voice = createVoice({ voiceURI: 'v1' })
    const { result, rerender } = setup({ voiceURI: 'v1' }, [voice])
    await waitFor(() => expect(result.current.voicesLoading).toBe(false))

    const before = instance.updateSettingsCount
    rerender({ text: 'Hello world.', voiceURI: 'v1', rate: 2, pitch: 0.5 })
    await waitFor(() => expect(instance.updateSettingsCount).toBeGreaterThan(before))
  })
})
