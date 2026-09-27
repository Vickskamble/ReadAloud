import { formatNumber } from '../utils/textStats'

interface TextStatsProps {
  characters: number
  words: number
}

/** Character and word counts, computed locally in the browser. */
export function TextStats({ characters, words }: TextStatsProps) {
  return (
    <p className="text-stats" aria-live="polite">
      <span>
        <span className="text-stats__label">Characters</span>
        <span className="text-stats__value">{formatNumber(characters)}</span>
      </span>
      <span className="text-stats__divider" aria-hidden="true">
        ·
      </span>
      <span>
        <span className="text-stats__label">Words</span>
        <span className="text-stats__value">{formatNumber(words)}</span>
      </span>
    </p>
  )
}
