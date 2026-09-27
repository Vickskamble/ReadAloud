import { PauseIcon, PlayIcon, StopIcon, TrashIcon } from './icons'

interface SpeechControlsProps {
  isReading: boolean
  isPaused: boolean
  disabled: boolean
  onPlay: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
  onClear: () => void
}

/**
 * Only the controls that make sense right now are rendered, so the user always
 * knows what is available:
 *   before playback -> Play, Clear
 *   during playback -> Pause, Stop, Clear
 *   after pause     -> Resume, Stop, Clear
 */
export function SpeechControls({
  isReading,
  isPaused,
  disabled,
  onPlay,
  onPause,
  onResume,
  onStop,
  onClear,
}: SpeechControlsProps) {
  return (
    <div className="speech-controls__primary">
      {!isReading && !isPaused && (
        <button
          type="button"
          className="button button--primary"
          onClick={onPlay}
          disabled={disabled}
        >
          <PlayIcon className="button__icon" />
          <span>Play</span>
        </button>
      )}

      {isReading && (
        <button
          type="button"
          className="button button--primary"
          onClick={onPause}
          disabled={disabled}
        >
          <PauseIcon className="button__icon" />
          <span>Pause</span>
        </button>
      )}

      {isPaused && (
        <button
          type="button"
          className="button button--primary"
          onClick={onResume}
          disabled={disabled}
        >
          <PlayIcon className="button__icon" />
          <span>Resume</span>
        </button>
      )}

      {(isReading || isPaused) && (
        <button
          type="button"
          className="button button--secondary"
          onClick={onStop}
          disabled={disabled}
        >
          <StopIcon className="button__icon" />
          <span>Stop</span>
        </button>
      )}

      <button
        type="button"
        className="button button--ghost"
        onClick={onClear}
        disabled={disabled}
      >
        <TrashIcon className="button__icon" />
        <span>Clear</span>
      </button>
    </div>
  )
}
