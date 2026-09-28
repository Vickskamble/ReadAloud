import { useEffect, useRef, useState } from 'react'
import type { MissingVoice } from '../pronunciation/availability'

interface MissingVoiceDialogProps {
  voice: MissingVoice
  /** Attempts to open system voice settings. Resolves false if not possible. */
  onOpenSettings: () => Promise<boolean>
  onDismiss: () => void
}

/**
 * Shown when playback was blocked because the device has no voice for a
 * language the text is written in.
 *
 * Reading the text anyway with an unrelated voice would produce a wrong
 * pronunciation while looking like it worked, so the only ways out are fixing
 * the device or explicitly allowing a fallback.
 */
export function MissingVoiceDialog({
  voice,
  onOpenSettings,
  onDismiss,
}: MissingVoiceDialogProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [settingsNote, setSettingsNote] = useState<string | null>(null)

  // Move focus into the dialog so keyboard and screen-reader users land here
  // rather than staying on the play button behind it.
  useEffect(() => {
    headingRef.current?.focus()
  }, [voice.language])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onDismiss])

  const openSettings = async () => {
    const opened = await onOpenSettings()
    setSettingsNote(
      opened
        ? null
        : `Open your device's Text-to-speech settings and install a ${voice.name} voice, then try again.`,
    )
  }

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="missing-voice-title"
        aria-describedby="missing-voice-message"
      >
        <h2 className="dialog__title" id="missing-voice-title" tabIndex={-1} ref={headingRef}>
          {voice.title}
        </h2>
        <p className="dialog__message" id="missing-voice-message">
          {voice.message}
        </p>
        {settingsNote && (
          <p className="dialog__note" role="status">
            {settingsNote}
          </p>
        )}
        <div className="dialog__actions">
          <button type="button" className="button button--primary" onClick={() => void openSettings()}>
            Open Voice Settings
          </button>
          <button type="button" className="button" onClick={onDismiss} ref={closeRef}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
