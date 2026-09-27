import type { ReactNode } from 'react'

interface NoticeProps {
  children: ReactNode
}

/**
 * Static, non-dismissible information (for example a missing voice pack).
 * It is not an alert, so it never competes with real error messages.
 */
export function Notice({ children }: NoticeProps) {
  return <p className="notice">{children}</p>
}
