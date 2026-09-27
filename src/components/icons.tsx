interface IconProps {
  className?: string
}

export function PlayIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z" fill="currentColor" />
    </svg>
  )
}

export function PauseIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="6" y="5" width="4" height="14" rx="1.4" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1.4" fill="currentColor" />
    </svg>
  )
}

export function StopIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  )
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M9 3.75h6a1 1 0 0 1 1 1V6h4a1 1 0 0 1 0 2h-.79l-.7 11.1A2 2 0 0 1 16.5 21h-9a2 2 0 0 1-1.99-1.9L4.79 8H4a1 1 0 0 1 0-2h4v-1.25a1 1 0 0 1 1-1Zm2 2.25h2V5.75h-2V6Zm-4.2 4 .7 9h7l.7-9H6.8Z"
        fill="currentColor"
      />
    </svg>
  )
}
