import { useEffect } from 'react'

interface UseKeyboardShortcutsOptions {
  onPlayPause: () => void
  onStop: () => void
}

const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (TEXT_ENTRY_TAGS.has(target.tagName)) return true
  return target.isContentEditable
}

/**
 * Space toggles play/pause, Escape stops. Native behaviour inside the text
 * field and on buttons is left untouched.
 */
export function useKeyboardShortcuts({ onPlayPause, onStop }: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onStop()
        return
      }

      if (event.key !== ' ' && event.code !== 'Space') return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (isTextEntry(event.target)) return
      if (event.target instanceof HTMLElement && event.target.closest('button, a, [role="button"]')) {
        return
      }

      event.preventDefault()
      onPlayPause()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onPlayPause, onStop])
}
