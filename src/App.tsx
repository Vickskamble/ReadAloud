import { useMemo, useState } from 'react'

import { AppHeader } from './components/AppHeader'
import { FallbackVoiceToggle } from './components/FallbackVoiceToggle'
import { LiveCaption } from './components/LiveCaption'
import { MissingVoiceDialog } from './components/MissingVoiceDialog'
import { Notice } from './components/Notice'
import { PitchControl } from './components/PitchControl'
import { ProgressBar } from './components/ProgressBar'
import { ReadingStatus } from './components/ReadingStatus'
import { SpeedControl } from './components/SpeedControl'
import { SpeechControls } from './components/SpeechControls'
import { StatusMessage } from './components/StatusMessage'
import { TextEditor } from './components/TextEditor'
import { TextStats } from './components/TextStats'
import { VoiceSelector } from './components/VoiceSelector'
import { VoiceWave } from './components/VoiceWave'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis'
import { DEFAULT_PITCH, DEFAULT_RATE } from './utils/constants'
import { getTextStats } from './utils/textStats'
import { classifyVoiceQuality, isPreferredLanguage, AUTO_VOICE } from './utils/voices'
import type { SpeechStatus } from './hooks/useSpeechSynthesis'

const STATUS_TEXT: Record<SpeechStatus, string> = {
  idle: 'Ready',
  reading: 'Reading aloud',
  paused: 'Paused',
  completed: 'Finished',
}

function progressLabel(speech: ReturnType<typeof useSpeechSynthesis>): string {
  if (speech.totalChunks === 0) return 'Progress'
  return `Part ${Math.min(speech.chunkIndex + 1, speech.totalChunks)} of ${speech.totalChunks}`
}

export default function App() {
  const [text, setText] = useState('')
  const [rate, setRate] = useState<number>(DEFAULT_RATE)
  const [pitch, setPitch] = useState<number>(DEFAULT_PITCH)

  // Starts as "no preference": the hook speaks with the best-sounding Hindi or
  // Marathi voice the device has, until the user picks one.
  const [chosenVoiceURI, setChosenVoiceURI] = useState<string>(AUTO_VOICE)

  // Off by default. Reading text in a language the device has no voice for is
  // a wrong pronunciation, not a rough one, so it is the user's explicit
  // choice and never a silent default.
  const [allowFallbackVoice, setAllowFallbackVoice] = useState(false)

  const speech = useSpeechSynthesis({
    text,
    voiceURI: chosenVoiceURI,
    rate,
    pitch,
    allowFallbackVoice,
  })
  const stats = useMemo(() => getTextStats(text), [text])

  const controlsDisabled = !speech.supported

  // A compact voice cannot be made to sound human by any setting, so say so
  // rather than letting the user hunt for the cause.
  const needsBetterVoice = useMemo(() => {
    const selected = speech.selectedVoice
    if (!selected || !isPreferredLanguage(selected.lang)) return false
    return classifyVoiceQuality(selected) === 'basic'
  }, [speech.selectedVoice])

  const handleClear = () => {
    speech.clear()
    setText('')
  }

  useKeyboardShortcuts({
    onPlayPause: () => (speech.isReading ? speech.pause() : speech.play()),
    onStop: speech.stop,
  })

  return (
    <div className="app">
      <AppHeader supported={speech.supported} />

      <main className="app__main">
        <TextEditor value={text} onChange={setText} />
        <TextStats characters={stats.characters} words={stats.words} />

        <div className="stage" data-active={speech.isReading ? 'true' : 'false'}>
          <div className="stage__top">
            <span className="signal">
              <span
                className={`signal__dot signal__dot--${speech.status}`}
                data-testid="signal-dot"
                aria-hidden="true"
              />
              <span className="signal__text">{STATUS_TEXT[speech.status]}</span>
            </span>
            <VoiceWave active={speech.isReading} paused={speech.isPaused} tick={speech.speechTick} />
          </div>

          <LiveCaption
            text={speech.currentChunkText}
            activeWord={speech.activeWord}
            active={speech.isReading || speech.isPaused}
            lang={speech.selectedVoice?.lang}
          />

          <ProgressBar value={speech.progress} label={progressLabel(speech)} />
        </div>

        <section className="app__settings" aria-label="Speech settings">
          <VoiceSelector
            voices={speech.voices}
            voicesLoading={speech.voicesLoading}
            selectedVoiceURI={speech.activeVoiceURI}
            onSelect={setChosenVoiceURI}
            disabled={controlsDisabled}
          />
          <div className="app__settings-row">
            <SpeedControl value={rate} onChange={setRate} disabled={controlsDisabled} />
            <PitchControl value={pitch} onChange={setPitch} disabled={controlsDisabled} />
          </div>
          <FallbackVoiceToggle
            checked={allowFallbackVoice}
            onChange={setAllowFallbackVoice}
            disabled={controlsDisabled}
          />
        </section>

        <SpeechControls
          isReading={speech.isReading}
          isPaused={speech.isPaused}
          disabled={controlsDisabled}
          onPlay={speech.play}
          onPause={speech.pause}
          onResume={speech.resume}
          onStop={speech.stop}
          onClear={handleClear}
        />

        {speech.message && (
          <StatusMessage message={speech.message} onDismiss={speech.dismissMessage} />
        )}

        {speech.hasNoVoices && !speech.message && (
          <Notice>
            No text-to-speech voices were found on this device. Your browser will fall back to its
            default voice, or you can install a language pack in your system settings.
          </Notice>
        )}

        {speech.hasNoPreferredVoice && !speech.message && !speech.missingVoice && (
          <Notice>
            This device has no Hindi or Marathi voice installed, so reading has been paused rather
            than mispronouncing your text. Install one: <strong>Android</strong> Settings &rarr;
            Accessibility &rarr; Text-to-speech output &rarr; install the Hindi (and Marathi) voice
            data, then reopen the app.
          </Notice>
        )}

        {needsBetterVoice && !speech.hasNoVoices && !speech.hasNoPreferredVoice && !speech.message && (
          <Notice>
            This voice sounds robotic. For speech that sounds like a person, install a natural
            voice pack: <strong>Windows</strong> Settings &rarr; Accessibility &rarr; Narrator
            voices, <strong>Android</strong> Settings &rarr; Accessibility &rarr; Text-to-speech
            output, then pick a voice marked Natural here.
          </Notice>
        )}

        <ReadingStatus
          status={speech.status}
          chunkIndex={speech.chunkIndex}
          totalChunks={speech.totalChunks}
        />
      </main>

      {speech.missingVoice && (
        <MissingVoiceDialog
          voice={speech.missingVoice}
          onOpenSettings={speech.openVoiceSettings}
          onDismiss={speech.dismissMissingVoice}
        />
      )}
    </div>
  )
}
