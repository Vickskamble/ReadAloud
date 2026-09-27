import axe from 'axe-core'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { MockSpeechService } from './test/mockSpeechService'
import { createVoice } from './test/fakeSpeech'

let instance: MockSpeechService = new MockSpeechService()

vi.mock('./services/speechService', () => ({
  SpeechService: vi.fn(function createMockService() {
    return instance
  }),
}))

async function audit(): Promise<string[]> {
  const results = await axe.run(document.body, {
    resultTypes: ['violations'],
    rules: {
      // jsdom does not compute layout, so these cannot be evaluated here.
      // Contrast is handled by the token choices documented in index.css.
      'color-contrast': { enabled: false },
      'color-contrast-enhanced': { enabled: false },
    },
  })
  return results.violations.map(
    (violation) => `${violation.id} (${violation.impact}): ${violation.help}`,
  )
}

function mount(voices: SpeechSynthesisVoice[] = []) {
  instance = new MockSpeechService()
  instance.availableVoices = voices
  render(<App />)
}

describe('accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has no detectable violations on the initial screen', async () => {
    mount([createVoice({ voiceURI: 'en-1', name: 'English Voice', lang: 'en-US' })])
    await waitFor(() => expect(instance.availableVoices).toBeDefined())
    expect(await audit()).toEqual([])
  })

  it('has no detectable violations while reading', async () => {
    mount([createVoice({ voiceURI: 'en-1', name: 'English Voice', lang: 'en-US' })])
    const user = userEvent.setup()
    await waitFor(() => expect(instance.availableVoices).toBeDefined())

    await user.type(screen.getByLabelText('Text to read aloud'), 'Hello there.')
    await user.click(screen.getByRole('button', { name: /Play/ }))

    expect(screen.getByRole('status')).toHaveTextContent('Reading')
    expect(await audit()).toEqual([])
  })

  it('has no detectable violations when an error is shown', async () => {
    mount()
    await waitFor(() => expect(instance.availableVoices).toBeDefined())

    await userEvent.setup().click(screen.getByRole('button', { name: /Play/ }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(await audit()).toEqual([])
  })

  it('exposes exactly one main landmark and a single top-level heading', () => {
    mount()
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('labels every interactive control', () => {
    mount([createVoice({ voiceURI: 'en-1', name: 'English Voice', lang: 'en-US' })])

    for (const control of screen.getAllByRole('button')) {
      const name = control.getAttribute('aria-label') ?? control.textContent ?? ''
      expect(name.trim()).not.toBe('')
    }
    for (const control of screen.getAllByRole('combobox')) {
      expect(control).toHaveAccessibleName()
    }
    expect(screen.getByRole('textbox')).toHaveAccessibleName()
  })
})
