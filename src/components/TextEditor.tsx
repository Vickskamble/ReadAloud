interface TextEditorProps {
  value: string
  onChange: (value: string) => void
}

/**
 * Plain textarea: typing, pasting, selecting and copying all use native
 * browser behaviour. It is never disabled, so text stays readable and
 * copyable even when the speech engine is unavailable. No content is mirrored
 * anywhere else.
 */
export function TextEditor({ value, onChange }: TextEditorProps) {
  return (
    <>
      <label className="visually-hidden" htmlFor="readaloud-text">
        Text to read aloud
      </label>
      <textarea
        id="readaloud-text"
        className="text-editor__input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Paste the chat message here..."
        rows={5}
        spellCheck
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        aria-describedby="readaloud-text-hint"
      />
      <p className="visually-hidden" id="readaloud-text-hint">
        Paste or type the message you want to hear. Press Play to read it aloud, Space to pause and
        Escape to stop.
      </p>
    </>
  )
}
