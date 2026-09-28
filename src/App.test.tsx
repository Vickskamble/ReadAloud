import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { MockSpeechService } from './test/mockSpeechService'
import { createVoice } from './test/fakeSpeech'

let instance: MockSpeechService = new MockSpeechService()

vi.mock('./services/speechService', () => ({
  // A normal function (not an arrow) so it can be used with `new`.
  SpeechService: vi.fn(function createMockService() {
    return instance
  }),
}))

const SAMPLE = 'Hello bhai, kya haal hai?'

/**
 * A device that has the voices the app is built for. Playback is blocked when
 * a language has no installed voice, so tests that expect reading to start
 * need a device that can actually speak the sample text.
 */
const DEVICE_VOICES: SpeechSynthesisVoice[] = [
  createVoice({ voiceURI: 'hi-1', name: 'Swara (Natural)', lang: 'hi-IN' }),
  createVoice({ voiceURI: 'mr-1', name: 'Mangal (Natural)', lang: 'mr-IN' }),
  createVoice({ voiceURI: 'en-in', name: 'Neerja', lang: 'en-IN' }),
  createVoice({ voiceURI: 'en-us', name: 'Aria', lang: 'en-US' }),
]

async function renderApp(voices: SpeechSynthesisVoice[] = DEVICE_VOICES) {
  instance = new MockSpeechService()
  instance.availableVoices = voices
  const user = userEvent.setup()
  const view = render(<App />)
  await waitFor(() => expect(instance.availableVoices).toBeDefined())
  return { user, ...view }
}

function textarea(): HTMLTextAreaElement {
  return screen.getByLabelText('Text to read aloud') as HTMLTextAreaElement
}

async function typeText(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.clear(textarea())
  if (value) await user.type(textarea(), value)
}

/** Simulates a paste of a large block, which is far faster than typing it. */
async function pasteText(value: string) {
  fireEvent.change(textarea(), { target: { value } })
}

describe('ReadAloud app', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens straight into the reading screen with no sign-in', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'ReadAloud' })).toBeInTheDocument()
    expect(screen.getByText('Paste. Press Play. Listen.')).toBeInTheDocument()
    expect(textarea()).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /password/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /log ?in|sign ?up/i })).not.toBeInTheDocument()
  })

  it('starts ready with an empty field', () => {
    render(<App />)
    expect(textarea()).toHaveValue('')
    expect(screen.getByRole('status')).toHaveTextContent('Ready')
  })

  it('reads the typed text when Play is pressed', async () => {
    const { user } = await renderApp()
    await typeText(user, SAMPLE)

    await user.click(screen.getByRole('button', { name: /Play/ }))

    expect(instance.lastRequest?.text).toBe(SAMPLE)
    expect(screen.getByRole('status')).toHaveTextContent('Reading')
    expect(screen.getByRole('button', { name: /Pause/ })).toBeInTheDocument()
  })

  it('asks for text instead of starting the engine on empty input', async () => {
    const { user } = await renderApp()

    await user.click(screen.getByRole('button', { name: /Play/ }))

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter some text first.')
    expect(instance.lastRequest).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Ready')
  })

  it('counts characters and words locally as the user types', async () => {
    const { user } = await renderApp()
    await typeText(user, 'Hello world')

    const stats = screen.getByText('Characters').parentElement?.parentElement
    expect(stats).toHaveTextContent('11')
    expect(stats).toHaveTextContent('2')
  })

  it('pauses, resumes and stops', async () => {
    const { user } = await renderApp()
    await typeText(user, SAMPLE)

    await user.click(screen.getByRole('button', { name: /Play/ }))
    await user.click(screen.getByRole('button', { name: /Pause/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Paused')
    expect(screen.getByRole('button', { name: /Resume/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Resume/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Reading')

    await user.click(screen.getByRole('button', { name: /Stop/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Ready')
    expect(instance.stopCount).toBeGreaterThan(0)
  })

  it('stops speech and empties the field on Clear', async () => {
    const { user } = await renderApp()
    await typeText(user, SAMPLE)
    await user.click(screen.getByRole('button', { name: /Play/ }))

    await user.click(screen.getByRole('button', { name: /Clear/ }))

    expect(textarea()).toHaveValue('')
    expect(instance.stopCount).toBeGreaterThan(0)
    expect(screen.getByRole('status')).toHaveTextContent('Ready')
    expect(screen.getByText('Characters').parentElement?.parentElement).toHaveTextContent('0')
  })

  it('marks the reading as completed and can play again', async () => {
    const { user } = await renderApp()
    await typeText(user, SAMPLE)
    await user.click(screen.getByRole('button', { name: /Play/ }))

    act(() => instance.lastCallbacks.onComplete?.())

    expect(screen.getByRole('status')).toHaveTextContent('Completed')
    expect(screen.getByRole('button', { name: /Play/ })).toBeInTheDocument()
  })

  it('shows a readable message when the engine fails', async () => {
    const { user } = await renderApp()
    await typeText(user, SAMPLE)
    await user.click(screen.getByRole('button', { name: /Play/ }))

    act(() => instance.lastCallbacks.onError?.('Something went wrong while reading the text. Please try again.'))

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong while reading the text.')
    expect(alert).not.toHaveTextContent('Error:')
  })

  it('lets the message be dismissed', async () => {
    const { user } = await renderApp()
    await user.click(screen.getByRole('button', { name: /Play/ }))
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dismiss message' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('sends the chosen voice to the engine', async () => {
    const voice = createVoice({ voiceURI: 'hi-1', name: 'Hindi Voice', lang: 'hi-IN' })
    const { user } = await renderApp([voice])

    await user.selectOptions(screen.getByLabelText('Voice'), 'hi-1')
    await typeText(user, 'नमस्ते')
    await user.click(screen.getByRole('button', { name: /Play/ }))

    expect(instance.lastRequest?.voice).toBe(voice)
  })

  it('sends the chosen speed and pitch to the engine', async () => {
    const { user } = await renderApp()
    await typeText(user, SAMPLE)

    await user.click(screen.getByRole('button', { name: '1.5x' }))
    await user.click(screen.getByRole('button', { name: 'High' }))
    await user.click(screen.getByRole('button', { name: /Play/ }))

    expect(instance.lastRequest?.rate).toBe(1.5)
    expect(instance.lastRequest?.pitch).toBe(1.4)
  })

  it('starts on the best-sounding Hindi or Marathi voice', async () => {
    const { user } = await renderApp([
      createVoice({ voiceURI: 'en-1', name: 'Google US English', lang: 'en-US' }),
      createVoice({ voiceURI: 'compact', name: 'Microsoft Swara - Hindi (India) Compact', lang: 'hi-IN' }),
      createVoice({ voiceURI: 'natural', name: 'Google Hindi', lang: 'hi-IN' }),
    ])
    await typeText(user, SAMPLE)
    await user.click(screen.getByRole('button', { name: /Play/ }))

    expect(instance.lastRequest?.voice?.voiceURI).toBe('natural')
    expect(instance.lastRequest?.voice?.lang).toBe('hi-IN')
  })

  it('lets the user fall back to the device default voice on purpose', async () => {
    const { user } = await renderApp([
      createVoice({ voiceURI: 'hi-1', name: 'Google Hindi', lang: 'hi-IN' }),
      createVoice({ voiceURI: 'en-in', name: 'Neerja', lang: 'en-IN' }),
    ])
    await typeText(user, SAMPLE)
    await user.selectOptions(screen.getByLabelText('Voice'), '')
    await user.click(screen.getByRole('button', { name: /Play/ }))

    expect(instance.lastRequest?.voice).toBeNull()
  })

  it('explains how to get a human-sounding voice when only robotic ones exist', async () => {
    await renderApp([
      createVoice({ voiceURI: 'compact', name: 'Microsoft Swara - Hindi (India) Compact', lang: 'hi-IN' }),
    ])

    expect(screen.getByText(/This voice sounds robotic/)).toBeInTheDocument()
  })

  it('does not warn when a natural voice is available', async () => {
    await renderApp([createVoice({ voiceURI: 'natural', name: 'Google Hindi', lang: 'hi-IN' })])

    expect(screen.queryByText(/This voice sounds robotic/)).not.toBeInTheDocument()
  })

  it('warns when the device exposes no voices at all', async () => {
    await renderApp([])
    expect(
      screen.getByText(/No text-to-speech voices were found on this device/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  describe('missing language voice', () => {
    /** A device with English but no Hindi or Marathi voice. */
    const ENGLISH_ONLY = [
      createVoice({ voiceURI: 'en-in', name: 'Neerja', lang: 'en-IN' }),
      createVoice({ voiceURI: 'en-us', name: 'Aria', lang: 'en-US' }),
    ]

    it('blocks reading Hindi rather than mispronouncing it in English', async () => {
      const { user } = await renderApp(ENGLISH_ONLY)
      await typeText(user, 'नमस्ते, आज बारिश होगी')

      await user.click(screen.getByRole('button', { name: /Play/ }))

      expect(instance.lastRequest).toBeNull()
      expect(screen.getByRole('alertdialog')).toHaveTextContent('Hindi Voice Not Available')
    })

    it('names Marathi when the text is Marathi', async () => {
      const { user } = await renderApp(ENGLISH_ONLY)
      await typeText(user, 'मला आज ऑफिसला जायचे आहे')

      await user.click(screen.getByRole('button', { name: /Play/ }))

      expect(screen.getByRole('alertdialog')).toHaveTextContent('Marathi Voice Not Available')
    })

    it('offers a way to open voice settings and a way out', async () => {
      const { user } = await renderApp(ENGLISH_ONLY)
      await typeText(user, 'नमस्ते')
      await user.click(screen.getByRole('button', { name: /Play/ }))

      await user.click(screen.getByRole('button', { name: 'Open Voice Settings' }))
      expect(instance.openVoiceSettingsCalls).toBeGreaterThan(0)

      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('still reads pure English, since the device can speak it', async () => {
      const { user } = await renderApp(ENGLISH_ONLY)
      await typeText(user, 'Please send the report today')

      await user.click(screen.getByRole('button', { name: /Play/ }))

      expect(instance.lastRequest?.segments?.length).toBeGreaterThan(0)
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('reads with another language only after the user opts in', async () => {
      const { user } = await renderApp(ENGLISH_ONLY)
      await typeText(user, 'नमस्ते, आज बारिश होगी')

      await user.click(screen.getByTestId('fallback-voice-toggle'))
      await user.click(screen.getByRole('button', { name: /Play/ }))

      expect(instance.lastRequest?.segments?.length).toBeGreaterThan(0)
    })

    it('falls back from en-IN to en-US without asking', async () => {
      const { user } = await renderApp([
        createVoice({ voiceURI: 'en-us', name: 'Aria', lang: 'en-US' }),
      ])
      await typeText(user, 'Please send the report today')

      await user.click(screen.getByRole('button', { name: /Play/ }))

      expect(instance.lastRequest?.segments?.length).toBeGreaterThan(0)
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
  })

  it('reports missing engine support clearly', async () => {
    instance = new MockSpeechService()
    instance.supported = false
    render(<App />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Text-to-Speech is not available on this device/browser.',
    )
    expect(screen.getByRole('button', { name: /Play/ })).toBeDisabled()
  })

  it('toggles playback with the Space key outside the text field', async () => {
    const { user } = await renderApp()
    await typeText(user, SAMPLE)
    textarea().blur()

    await user.keyboard(' ')
    expect(screen.getByRole('status')).toHaveTextContent('Reading')

    await user.keyboard(' ')
    expect(screen.getByRole('status')).toHaveTextContent('Paused')
  })

  it('does not hijack Space while typing in the text field', async () => {
    const { user } = await renderApp()
    await textarea().focus()

    await user.keyboard('hello')

    expect(textarea()).toHaveValue('hello')
    expect(instance.lastRequest).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Ready')
  })

  it('stops with the Escape key', async () => {
    const { user } = await renderApp()
    await typeText(user, SAMPLE)
    await user.click(screen.getByRole('button', { name: /Play/ }))

    await user.keyboard('{Escape}')

    expect(screen.getByRole('status')).toHaveTextContent('Ready')
    expect(instance.stopCount).toBeGreaterThan(0)
  })

  it('keeps every control reachable by keyboard', async () => {
    const { user } = await renderApp([
      createVoice({ voiceURI: 'en-1', name: 'English Voice', lang: 'en-US' }),
    ])
    await typeText(user, SAMPLE)
    textarea().blur()

    const reached = new Set<string>()
    for (let i = 0; i < 14; i++) {
      await user.tab()
      const active = document.activeElement
      if (active instanceof HTMLElement) reached.add(active.tagName)
    }

    expect(reached.has('TEXTAREA')).toBe(true)
    expect(reached.has('BUTTON')).toBe(true)
    expect(reached.has('SELECT')).toBe(true)
  })

  it('splits long text into ordered parts and shows progress', async () => {
    const { user } = await renderApp()
    const long = 'This sentence is long enough to be split. '.repeat(20)
    await pasteText(long)

    await user.click(screen.getByRole('button', { name: /Play/ }))

    expect(instance.lastRequest?.chunkMaxChars).toBe(200)
    expect(instance.lastRequest?.text.length).toBe(long.length)

    act(() => instance.lastCallbacks.onChunkStart?.(1, 'Second chunk of text.'))
    const status = screen.getByRole('status')
    expect(within(status).getByText(/Part 2 of/)).toBeInTheDocument()
  })
})

describe('ReadAloud privacy guarantees', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('never writes the user text to any browser storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { user } = await renderApp()

    await typeText(user, 'Secret sentence that must never be stored.')
    await user.click(screen.getByRole('button', { name: /Play/ }))

    expect(setItem).not.toHaveBeenCalled()
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
    expect(document.cookie).toBe('')
    expect(window.location.search).toBe('')
  })

  it('never opens an IndexedDB database', async () => {
    // jsdom does not implement IndexedDB, so assert the app never reaches for it.
    const globalWithDb = globalThis as { indexedDB?: IDBFactory }
    const original = globalWithDb.indexedDB
    const open = vi.fn()
    globalWithDb.indexedDB = { open } as unknown as IDBFactory

    try {
      const { user } = await renderApp()
      await typeText(user, 'Secret sentence that must never be stored.')
      await user.click(screen.getByRole('button', { name: /Play/ }))
      expect(open).not.toHaveBeenCalled()
    } finally {
      globalWithDb.indexedDB = original
    }
  })

  it('does not restore any text on a fresh mount', async () => {
    const { user, unmount } = await renderApp()
    await typeText(user, 'Secret sentence that must never be stored.')
    unmount()

    instance = new MockSpeechService()
    render(<App />)
    expect(textarea()).toHaveValue('')
  })

  it('makes no network requests while reading', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { user } = await renderApp()

    await typeText(user, 'Secret sentence that must never be stored.')
    await user.click(screen.getByRole('button', { name: /Play/ }))

    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
