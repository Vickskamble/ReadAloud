import { useEffect, useRef } from 'react'

interface LiveCaptionProps {
  /** The chunk currently being spoken. */
  text: string
  /** Where the spoken word sits inside `text`. */
  activeWord: { start: number; length: number } | null
  active: boolean
  /** BCP-47 tag of the speaking voice, so a screen reader uses that language. */
  lang?: string
}

const NO_TEXT = 'Nothing is playing right now.'

/**
 * Shows what is being read, with the word being spoken picked out. The
 * position comes from the engine's own boundary events, so the highlight is
 * the real playback position rather than an estimate.
 */
export function LiveCaption({ text, activeWord, active, lang }: LiveCaptionProps) {
  const activeRef = useRef<HTMLSpanElement | null>(null)

  // Keep the spoken word in view when a caption is longer than the panel.
  useEffect(() => {
    const element = activeRef.current
    if (!element || !active) return
    if (typeof element.scrollIntoView !== 'function') return
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeWord, active])

  if (!active || !text) {
    return (
      <div className="live-caption live-caption--idle">
        <p className="live-caption__text">{NO_TEXT}</p>
      </div>
    )
  }

  const start = activeWord ? Math.min(activeWord.start, text.length) : 0
  const end = activeWord ? Math.min(start + Math.max(activeWord.length, 1), text.length) : 0
  const before = text.slice(0, start)
  const current = end > start ? text.slice(start, end) : ''
  const after = text.slice(end)

  return (
    <div className="live-caption">
      <p className="live-caption__label">Now reading</p>
      <p className="live-caption__text" lang={lang}>
        {before}
        {current ? (
          <span ref={activeRef} className="live-caption__word">
            {current}
          </span>
        ) : null}
        {after}
      </p>
    </div>
  )
}
