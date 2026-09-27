interface ProgressBarProps {
  /** 0..1, or null when nothing has been read yet. */
  value: number | null
  label: string
}

function percent(value: number | null): number {
  if (value === null) return 0
  return Math.round(Math.min(Math.max(value, 0), 1) * 100)
}

/**
 * A plain reading-progress bar. It is a real progress element, so assistive
 * technology reports the value without any extra live-region chatter.
 */
export function ProgressBar({ value, label }: ProgressBarProps) {
  const amount = percent(value)

  return (
    <div className="progress">
      <div className="progress__labels">
        <span className="progress__label">{label}</span>
        <span className="progress__value">{value === null ? '0%' : `${amount}%`}</span>
      </div>
      <div
        className="progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={amount}
        aria-valuetext={value === null ? 'Not started' : `${amount} percent read aloud`}
        aria-label="Reading progress"
      >
        <div className="progress__fill" style={{ width: `${amount}%` }} />
      </div>
    </div>
  )
}
