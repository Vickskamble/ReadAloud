import { RATE_OPTIONS } from '../utils/constants'

interface SpeedControlProps {
  value: number
  onChange: (rate: number) => void
  disabled: boolean
}

function formatRate(rate: number): string {
  return `${rate}x`
}

/** Discrete speed steps mapped onto the native TTS rate. */
export function SpeedControl({ value, onChange, disabled }: SpeedControlProps) {
  return (
    <div className="field">
      <span className="field__label" id="readaloud-speed-label">
        Speed
      </span>
      <div
        className="segmented"
        role="group"
        aria-labelledby="readaloud-speed-label"
        aria-disabled={disabled || undefined}
      >
        {RATE_OPTIONS.map((rate) => {
          const selected = rate === value
          return (
            <button
              key={rate}
              type="button"
              className="segmented__option"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(rate)}
            >
              {formatRate(rate)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
