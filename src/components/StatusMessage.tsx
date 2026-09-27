interface StatusMessageProps {
  message: string
  onDismiss: () => void
}

/** Simple, dismissible feedback. Never shows technical error dumps. */
export function StatusMessage({ message, onDismiss }: StatusMessageProps) {
  return (
    <div className="status-message" role="alert">
      <p className="status-message__text">{message}</p>
      <button
        type="button"
        className="status-message__dismiss"
        onClick={onDismiss}
        aria-label="Dismiss message"
      >
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  )
}
