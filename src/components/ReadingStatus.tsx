import type { SpeechStatus } from '../hooks/useSpeechSynthesis'

const LABELS: Record<SpeechStatus, string> = {
  idle: 'Ready',
  reading: 'Reading',
  paused: 'Paused',
  completed: 'Completed',
}

interface ReadingStatusProps {
  status: SpeechStatus
  chunkIndex: number
  totalChunks: number
}

/** Small, unobtrusive reading indicator. */
export function ReadingStatus({ status, chunkIndex, totalChunks }: ReadingStatusProps) {
  const showProgress = totalChunks > 1 && (status === 'reading' || status === 'paused')

  return (
    <p className="reading-status" role="status" aria-live="polite">
      <span className={`reading-status__dot reading-status__dot--${status}`} aria-hidden="true" />
      <span className="reading-status__label">{LABELS[status]}</span>
      {showProgress && (
        <span className="reading-status__progress">
          Part {Math.min(chunkIndex + 1, totalChunks)} of {totalChunks}
        </span>
      )}
    </p>
  )
}
