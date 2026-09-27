/**
 * Sentence terminators across the languages we expect to encounter.
 * `।` (U+0964) and `॥` (U+0965) are the Devanagari single/double danda used by
 * Hindi, Marathi, Nepali, Sanskrit, and are also common in Bengali/Telugu text.
 */
const TERMINATORS = new Set(['.', '!', '?', '।', '॥'])

const WHITESPACE = new Set([' ', '\t', '\n'])

/**
 * Tokens that end in a period without ending a sentence.
 */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'mt', 'ft', 'rev', 'hon',
  'no', 'nos', 'vol', 'ch', 'pp', 'ed', 'eds', 'fig', 'eq', 'vs', 'etc', 'al',
  'approx', 'dept', 'est', 'inc', 'ltd', 'co', 'corp', 'gen', 'col', 'capt',
  'lt', 'sgt', 'capt', 'govt', 'min', 'max', 'avg', 'jan', 'feb', 'mar', 'apr',
  'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'mon', 'tue', 'wed',
  'thu', 'fri', 'sat', 'sun', 'am', 'pm', 'a.m', 'p.m', 'eg', 'ie', 'viz',
])

/** Markdown decoration that a speech engine would otherwise read out loud. */
const MARKDOWN_LINE_PREFIX = /^\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+/
const MARKDOWN_INLINE = /(\*\*|__|~~|`)/g
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g

export interface ChunkOptions {
  maxChars?: number
}

/**
 * Cleans text so the speech engine reads natural language instead of markup.
 * Only unambiguous formatting markers are removed - single `*` and `_` are left
 * alone because they may be legitimate content (math, snake_case identifiers).
 */
export function normalizeForSpeech(text: string): string {
  return text
    .replace(ZERO_WIDTH, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(MARKDOWN_LINE_PREFIX, '').replace(MARKDOWN_INLINE, ''))
    .join('\n')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * True when the period-like terminator at `terminatorIndex` belongs to an
 * abbreviation or an initial ("Dr.", "J. R. R. Tolkien") rather than a
 * sentence boundary.
 */
function endsWithAbbreviation(text: string, sentenceStart: number, terminatorIndex: number): boolean {
  const preceding = text.slice(sentenceStart, terminatorIndex)
  const match = /([A-Za-z][A-Za-z.]*)$/.exec(preceding)
  if (!match) return false

  const token = match[1]
  const letters = token.replace(/\./g, '')
  if (letters.length === 0) return false
  if (ABBREVIATIONS.has(letters.toLowerCase())) return true

  return letters.length <= 2 && /^[A-Z]/.test(letters)
}

/**
 * Splits a single block of text into sentences, never mid-word and never
 * mid-abbreviation.
 */
export function splitSentences(text: string): string[] {
  const sentences: string[] = []
  let start = 0

  for (let i = 0; i < text.length; i++) {
    if (!TERMINATORS.has(text[i])) continue

    let end = i + 1
    while (end < text.length && TERMINATORS.has(text[end])) end++

    if (end < text.length && !WHITESPACE.has(text[end])) continue
    if (endsWithAbbreviation(text, start, i)) continue

    const sentence = text.slice(start, end).trim()
    if (sentence) sentences.push(sentence)
    start = end
    i = end - 1
  }

  const tail = text.slice(start).trim()
  if (tail) sentences.push(tail)

  return sentences
}

/**
 * Breaks an over-long sentence at word boundaries. A single word longer than
 * the limit is split rather than dropped, so no text is ever lost.
 */
function splitAtWordBoundaries(text: string, maxChars: number): string[] {
  const pieces: string[] = []
  let current = ''

  for (const word of text.split(/\s+/)) {
    if (!word) continue

    if (word.length > maxChars) {
      if (current) {
        pieces.push(current)
        current = ''
      }
      for (let i = 0; i < word.length; i += maxChars) {
        pieces.push(word.slice(i, i + maxChars))
      }
      continue
    }

    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > maxChars) {
      pieces.push(current)
      current = word
    } else {
      current = candidate
    }
  }

  if (current) pieces.push(current)
  return pieces
}

/**
 * Greedily packs sentences into chunks of at most `maxChars`.
 */
function packSentences(sentences: string[], maxChars: number): string[] {
  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      chunks.push(...splitAtWordBoundaries(sentence, maxChars))
      continue
    }

    const candidate = current ? `${current} ${sentence}` : sentence
    if (candidate.length > maxChars) {
      chunks.push(current)
      current = sentence
    } else {
      current = candidate
    }
  }

  if (current) chunks.push(current)
  return chunks
}

/**
 * Splits arbitrary text into utterance-sized chunks.
 *
 * Boundary preference: paragraph -> sentence -> word. Order is always
 * preserved and no text is silently truncated.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = Math.max(1, Math.floor(options.maxChars ?? 200))
  const normalized = normalizeForSpeech(text)
  if (!normalized) return []

  const blocks = normalized.split(/\n{2,}/)
  const chunks: string[] = []

  for (const block of blocks) {
    const joined = block.replace(/\s*\n\s*/g, ' ').trim()
    if (!joined) continue
    chunks.push(...packSentences(splitSentences(joined), maxChars))
  }

  return chunks.filter((chunk) => chunk.length > 0)
}
