import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SpeechControls } from './SpeechControls'
import { StatusMessage } from './StatusMessage'
import { ReadingStatus } from './ReadingStatus'
import { TextStats } from './TextStats'
import { LiveCaption } from './LiveCaption'
import { ProgressBar } from './ProgressBar'
import { VoiceWave } from './VoiceWave'
import { SpeedControl } from './SpeedControl'
import { PitchControl } from './PitchControl'
import { VoiceSelector } from './VoiceSelector'
import { TextEditor } from './TextEditor'
import { createVoice } from '../test/fakeSpeech'

function noop() {}

describe('TextEditor', () => {
  it('shows the paste-or-type placeholder', () => {
    render(<TextEditor value="" onChange={noop} />)
    expect(
      screen.getByPlaceholderText('Paste the chat message here...'),
    ).toBeInTheDocument()
  })

  it('is a labelled multiline text field', () => {
    render(<TextEditor value="" onChange={noop} />)
    const textarea = screen.getByLabelText('Text to read aloud')
    expect(textarea.tagName).toBe('TEXTAREA')
  })

  it('reports typed text to the parent', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TextEditor value="" onChange={onChange} />)

    await user.type(screen.getByLabelText('Text to read aloud'), 'Hi')
    expect(onChange).toHaveBeenCalled()
  })

  it('displays multi-line pasted content', () => {
    const pasted = 'line one\nline two'
    render(<TextEditor value={pasted} onChange={noop} />)
    expect(screen.getByLabelText('Text to read aloud')).toHaveValue(pasted)
  })
})

describe('TextStats', () => {
  it('shows character and word counts', () => {
    render(<TextStats characters={1250} words={210} />)
    expect(screen.getByText('1,250')).toBeInTheDocument()
    expect(screen.getByText('210')).toBeInTheDocument()
    expect(screen.getByText('Characters')).toBeInTheDocument()
    expect(screen.getByText('Words')).toBeInTheDocument()
  })
})

describe('ProgressBar', () => {
  it('reports no progress before anything is read', () => {
    render(<ProgressBar value={null} label="Progress" />)

    const bar = screen.getByRole('progressbar', { name: 'Reading progress' })
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    expect(bar).toHaveAttribute('aria-valuetext', 'Not started')
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('shows the label and the real percentage', () => {
    render(<ProgressBar value={0.42} label="Part 3 of 7" />)

    const bar = screen.getByRole('progressbar', { name: 'Reading progress' })
    expect(bar).toHaveAttribute('aria-valuenow', '42')
    expect(bar).toHaveAttribute('aria-valuetext', '42 percent read aloud')
    expect(screen.getByText('Part 3 of 7')).toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  it('never reports a value outside the range', () => {
    render(<ProgressBar value={1.4} label="Progress" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })
})

describe('LiveCaption', () => {
  it('says so when nothing is playing', () => {
    render(<LiveCaption text="" activeWord={null} active={false} />)
    expect(screen.getByText(/Nothing is playing right now/)).toBeInTheDocument()
  })

  it('marks the word the engine is speaking', () => {
    const text = 'Namaste duniya, aaj mausam bahut acha hai.'
    render(
      <LiveCaption
        text={text}
        activeWord={{ start: 8, length: 6 }}
        active
        lang="hi-IN"
      />,
    )

    expect(screen.getByText('duniya')).toHaveClass('live-caption__word')
    expect(screen.getByText(/Namaste/)).toBeInTheDocument()
    // Marked with the speaking language so a screen reader reads it correctly.
    expect(screen.getByText(/Namaste/).closest('p')).toHaveAttribute('lang', 'hi-IN')
  })

  it('keeps the rest of the text readable around the highlight', () => {
    render(
      <LiveCaption text="ek do teen" activeWord={{ start: 3, length: 2 }} active />,
    )
    expect(screen.getByText('do')).toHaveClass('live-caption__word')
  })

  it('shows the chunk plainly before the first word boundary arrives', () => {
    render(<LiveCaption text="ek do teen" activeWord={null} active />)
    expect(screen.getByText('ek do teen')).toBeInTheDocument()
  })

  it('clamps a boundary that points past the end of the chunk', () => {
    render(<LiveCaption text="short" activeWord={{ start: 90, length: 5 }} active />)
    expect(screen.getByText('short')).toBeInTheDocument()
  })
})

describe('VoiceWave', () => {
  it('is decorative, so it stays out of the accessibility tree', () => {
    const { container } = render(<VoiceWave active={false} paused={false} tick={0} />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('draws a fixed row of bars', () => {
    const { container } = render(<VoiceWave active={false} paused={false} tick={0} />)
    expect(container.querySelectorAll('rect')).toHaveLength(32)
  })

  it('marks the active and paused states for styling', () => {
    const { container: reading } = render(<VoiceWave active paused={false} tick={0} />)
    expect(reading.firstElementChild).toHaveClass('voice-wave--active')

    const { container: paused } = render(<VoiceWave active paused tick={0} />)
    expect(paused.firstElementChild).toHaveClass('voice-wave--paused')
  })
})

describe('SpeedControl', () => {
  it('offers the documented speed steps with 1x selected by default', () => {
    render(<SpeedControl value={1} onChange={noop} disabled={false} />)
    expect(screen.getByRole('button', { name: '0.5x' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2x' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1x' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('reports the chosen speed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SpeedControl value={1} onChange={onChange} disabled={false} />)

    await user.click(screen.getByRole('button', { name: '1.5x' }))
    expect(onChange).toHaveBeenCalledWith(1.5)
  })

  it('disables every step when disabled', () => {
    render(<SpeedControl value={1} onChange={noop} disabled />)
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled()
    }
  })
})

describe('PitchControl', () => {
  it('defaults to Normal', () => {
    render(<PitchControl value={1} onChange={noop} disabled={false} />)
    expect(screen.getByRole('button', { name: 'Normal' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('reports the chosen pitch', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PitchControl value={1} onChange={onChange} disabled={false} />)

    await user.click(screen.getByRole('button', { name: 'High' }))
    expect(onChange).toHaveBeenCalledWith(1.4)
  })
})

describe('VoiceSelector', () => {
  const voices = [
    createVoice({ voiceURI: 'en-1', name: 'English Voice', lang: 'en-US' }),
    createVoice({ voiceURI: 'hi-1', name: 'Hindi Voice', lang: 'hi-IN' }),
    createVoice({ voiceURI: 'mr-1', name: 'Marathi Voice', lang: 'mr-IN' }),
  ]

  it('opens on Hindi and lists only that language\'s voices', () => {
    render(
      <VoiceSelector
        voices={voices}
        voicesLoading={false}
        selectedVoiceURI=""
        onSelect={noop}
        disabled={false}
      />,
    )

    // Hindi leads, so the picker starts there without the user choosing.
    expect((screen.getByLabelText('Language') as HTMLSelectElement).value).toBe('hi-IN')

    const select = screen.getByLabelText('Voice') as HTMLSelectElement
    const values = [...select.options].map((option) => option.value)
    expect(values).toEqual(['', 'hi-1'])
  })

  it('offers Hindi and Marathi only', () => {
    render(
      <VoiceSelector
        voices={voices}
        voicesLoading={false}
        selectedVoiceURI=""
        onSelect={noop}
        disabled={false}
      />,
    )

    const language = screen.getByLabelText('Language') as HTMLSelectElement
    expect([...language.options].map((option) => option.value)).toEqual(['hi-IN', 'mr-IN'])
    expect(within(language).queryByRole('option', { name: 'All languages' })).toBeNull()
    expect(language.options).toHaveLength(2)
  })

  it('falls back to every language when the device has neither Hindi nor Marathi', () => {
    render(
      <VoiceSelector
        voices={[createVoice({ voiceURI: 'en-1', name: 'Zeta', lang: 'en-US' })]}
        voicesLoading={false}
        selectedVoiceURI=""
        onSelect={noop}
        disabled={false}
      />,
    )

    const language = screen.getByLabelText('Language') as HTMLSelectElement
    expect([...language.options].map((option) => option.value)).toEqual(['en-US'])
  })

  it('marks how human each voice sounds', () => {
    render(
      <VoiceSelector
        voices={[
          createVoice({ voiceURI: 'natural', name: 'Google Hindi', lang: 'hi-IN' }),
          createVoice({ voiceURI: 'compact', name: 'Microsoft Swara - Hindi (India) Compact', lang: 'hi-IN' }),
        ]}
        voicesLoading={false}
        selectedVoiceURI=""
        onSelect={noop}
        disabled={false}
      />,
    )

    expect(screen.getByRole('option', { name: /Google Hindi.*Natural/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Compact.*Robotic/ })).toBeInTheDocument()
  })

  it('reports the selected voice', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <VoiceSelector
        voices={voices}
        voicesLoading={false}
        selectedVoiceURI=""
        onSelect={onSelect}
        disabled={false}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Voice'), 'hi-1')
    expect(onSelect).toHaveBeenCalledWith('hi-1')
  })

  it('auto-selects the first voice when a language filter is applied', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <VoiceSelector
        voices={voices}
        voicesLoading={false}
        selectedVoiceURI=""
        onSelect={onSelect}
        disabled={false}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Language'), 'hi-IN')
    expect(onSelect).toHaveBeenCalledWith('hi-1')
  })

  it('narrows the voice list to the chosen language', async () => {
    const user = userEvent.setup()
    render(
      <VoiceSelector
        voices={voices}
        voicesLoading={false}
        selectedVoiceURI=""
        onSelect={noop}
        disabled={false}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Language'), 'mr-IN')
    const select = screen.getByLabelText('Voice') as HTMLSelectElement
    expect([...select.options].map((option) => option.value)).toEqual(['', 'mr-1'])
  })

  it('says so plainly when the device has no voices', () => {
    render(
      <VoiceSelector
        voices={[]}
        voicesLoading={false}
        selectedVoiceURI=""
        onSelect={noop}
        disabled={false}
      />,
    )

    expect(
      screen.getByRole('option', { name: 'No voices found on this device' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Voice')).toBeDisabled()

    // The default value must not be offered twice while no voice is known.
    const select = screen.getByLabelText('Voice') as HTMLSelectElement
    expect([...select.options].map((option) => option.value)).toEqual([''])
    expect(screen.queryByRole('option', { name: 'Device default voice' })).toBeNull()
  })

  it('falls back to the device default when the selected voice is gone', () => {
    render(
      <VoiceSelector
        voices={voices}
        voicesLoading={false}
        selectedVoiceURI="missing"
        onSelect={noop}
        disabled={false}
      />,
    )

    expect(screen.getByLabelText('Voice')).toHaveValue('')
  })
})

describe('SpeechControls', () => {
  const baseProps = {
    isReading: false,
    isPaused: false,
    disabled: false,
    onPlay: noop,
    onPause: noop,
    onResume: noop,
    onStop: noop,
    onClear: noop,
  }

  it('offers Play and Clear before playback', () => {
    render(<SpeechControls {...baseProps} />)
    expect(screen.getByRole('button', { name: /Play/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Clear/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Pause/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Stop/ })).not.toBeInTheDocument()
  })

  it('offers Pause, Stop and Clear during playback', () => {
    render(<SpeechControls {...baseProps} isReading />)
    expect(screen.getByRole('button', { name: /Pause/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Stop/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Clear/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Play/ })).not.toBeInTheDocument()
  })

  it('offers Resume, Stop and Clear after a pause', () => {
    render(<SpeechControls {...baseProps} isPaused />)
    expect(screen.getByRole('button', { name: /Resume/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Stop/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Clear/ })).toBeInTheDocument()
  })

  it('wires each button to its handler', async () => {
    const user = userEvent.setup()
    const onPlay = vi.fn()
    const onClear = vi.fn()
    render(<SpeechControls {...baseProps} onPlay={onPlay} onClear={onClear} />)

    await user.click(screen.getByRole('button', { name: /Play/ }))
    await user.click(screen.getByRole('button', { name: /Clear/ }))
    expect(onPlay).toHaveBeenCalledTimes(1)
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('wires pause and resume', async () => {
    const user = userEvent.setup()
    const onPause = vi.fn()
    const { rerender } = render(<SpeechControls {...baseProps} isReading onPause={onPause} />)
    await user.click(screen.getByRole('button', { name: /Pause/ }))
    expect(onPause).toHaveBeenCalledTimes(1)

    const onResume = vi.fn()
    rerender(<SpeechControls {...baseProps} isPaused onResume={onResume} />)
    await user.click(screen.getByRole('button', { name: /Resume/ }))
    expect(onResume).toHaveBeenCalledTimes(1)
  })
})

describe('ReadingStatus', () => {
  it('starts in the Ready state', () => {
    render(<ReadingStatus status="idle" chunkIndex={0} totalChunks={0} />)
    expect(screen.getByRole('status')).toHaveTextContent('Ready')
  })

  it('shows Reading while speaking', () => {
    render(<ReadingStatus status="reading" chunkIndex={0} totalChunks={0} />)
    expect(screen.getByRole('status')).toHaveTextContent('Reading')
  })

  it('shows Paused after a pause', () => {
    render(<ReadingStatus status="paused" chunkIndex={0} totalChunks={0} />)
    expect(screen.getByRole('status')).toHaveTextContent('Paused')
  })

  it('shows Completed at the end', () => {
    render(<ReadingStatus status="completed" chunkIndex={0} totalChunks={0} />)
    expect(screen.getByRole('status')).toHaveTextContent('Completed')
  })

  it('reports chunk progress only for multi-chunk text', () => {
    const { rerender } = render(
      <ReadingStatus status="reading" chunkIndex={1} totalChunks={5} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Part 2 of 5')

    rerender(<ReadingStatus status="reading" chunkIndex={0} totalChunks={1} />)
    expect(screen.getByRole('status')).not.toHaveTextContent('Part')
  })
})

describe('StatusMessage', () => {
  it('is announced as an alert', () => {
    render(<StatusMessage message="Something went wrong." onDismiss={noop} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.')
  })

  it('can be dismissed', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(<StatusMessage message="Notice" onDismiss={onDismiss} />)

    await user.click(screen.getByRole('button', { name: 'Dismiss message' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
