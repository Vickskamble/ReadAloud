interface FallbackVoiceToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled: boolean
}

/**
 * Opt-in to reading text in a language the device has no voice for, using a
 * voice of a different language.
 *
 * Off by default. A compact checkbox rather than a setting screen, because it
 * is a one-off decision about this session and not a preference worth hiding
 * behind navigation. The consequence is spelled out in the label, so enabling
 * it is never a surprise.
 */
export function FallbackVoiceToggle({ checked, onChange, disabled }: FallbackVoiceToggleProps) {
  return (
    <label className="checkbox" data-testid="fallback-voice-toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="checkbox__label">
        Read anyway with another language&rsquo;s voice
        <span className="checkbox__hint">
          Off by default: this produces a wrong pronunciation for text the device has no voice for.
        </span>
      </span>
    </label>
  )
}
