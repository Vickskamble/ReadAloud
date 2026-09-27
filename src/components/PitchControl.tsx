import { PITCH_OPTIONS } from '../utils/constants'

interface PitchControlProps {
  value: number
  onChange: (pitch: number) => void
  disabled: boolean
}

/** Optional pitch stepper. Default stays Neutral. */
export function PitchControl({ value, onChange, disabled }: PitchControlProps) {
  return (
    <div className="field">
      <span className="field__label" id="readaloud-pitch-label">
        Pitch
      </span>
      <div
        className="segmented"
        role="group"
        aria-labelledby="readaloud-pitch-label"
        aria-disabled={disabled || undefined}
      >
        {PITCH_OPTIONS.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.label}
              type="button"
              className="segmented__option"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
