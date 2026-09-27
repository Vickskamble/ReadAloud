export interface TextStats {
  characters: number
  words: number
}

/**
 * Local-only character and word counts. Nothing is sent anywhere.
 */
export function getTextStats(text: string): TextStats {
  return {
    characters: text.length,
    words: countWords(text),
  }
}

export function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
}
