import { CHUNK_MAX_CHARS } from '../utils/constants'
import { classifyToken } from './classify'
import { stripEmoji } from './normalize'
import type { SpeechLanguage, SpeechSegment, Token } from './types'

/** A run of characters kept together, either whitespace or one real token. */
interface Piece {
  readonly raw: string
  /** True for spaces and punctuation runs, which never start a new language. */
  readonly glue: boolean
}

/**
 * One token run.
 *
 * \p{M} is required for Devanagari matras such as ा, which are spacing
 * combining marks and are not \p{L}; without it "मला" splits in two.
 * \p{Sc} covers currency symbols so "₹5,000" stays one token, and ':' is
 * included so "https://host" and "17:30" are not cut in half.
 */
const TOKEN = /[\p{L}\p{N}\p{M}\p{Sc}][\p{L}\p{N}\p{M}\p{Sc}'’._@%+\-/:&,]*|[^\s]/gu

function splitPieces(text: string): Piece[] {
  const pieces: Piece[] = []
  let index = 0

  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0
    if (start > index) {
      const gap = text.slice(index, start)
      pieces.push({ raw: gap, glue: /^\s+$/.test(gap) })
    }
    pieces.push({ raw: match[0], glue: false })
    index = start + match[0].length
  }

  if (index < text.length) {
    const gap = text.slice(index)
    pieces.push({ raw: gap, glue: /^\s+$/.test(gap) })
  }
  return pieces
}

/**
 * Whether a run of small words in the same script should be read as one
 * language or as a different one.
 *
 * A single English word in a Hindi sentence is usually a borrowed technical
 * term, so it is folded into the Hindi run instead of triggering a voice
 * switch. A longer English stretch is genuine English.
 */
const SWITCH_THRESHOLD = 3

interface Run {
  language: SpeechLanguage
  tokens: Token[]
}

export interface BuildSegmentsOptions {
  /** Hard cap per spoken segment, so the engine stays responsive. */
  readonly maxChars?: number
}

/**
 * Rejoins "5" and "PM" into one clock time.
 *
 * The tokenizer separates on whitespace, so a meridiem written apart from its
 * hour arrives as two tokens and would be read as the number five and the
 * letters P M. Only a bare number directly followed by a meridiem qualifies.
 */
const MERIDIEM = /^(?:a\.?m\.?|p\.?m\.?)$/i

function mergeClockTimes(tokens: Token[]): Token[] {
  const merged: Token[] = []

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const next = tokens[index + 1]

    if (token.kind === 'NUMBER' && next && MERIDIEM.test(next.text)) {
      const meridiem = next.text.toLowerCase().replace(/\./g, '').startsWith('a') ? 'am' : 'pm'
      merged.push({
        text: `${token.text} ${next.text}`,
        kind: 'TIME',
        language: next.language,
        spoken: `${token.spoken} o'clock ${meridiem}`,
      })
      index += 1
      continue
    }
    merged.push(token)
  }

  return merged
}

/**
 * Groups tokens into runs of one language.
 *
 * Switching language for every word is what makes an app sound robotic, so
 * consecutive compatible tokens are merged and only a sustained run of a
 * different language starts a new segment.
 */
function buildRuns(tokens: Token[]): Run[] {
  const runs: Run[] = []

  for (const token of tokens) {
    if (token.kind === 'PUNCTUATION' || token.kind === 'EMOJI') continue

    const spokenLanguage = token.language
    const isHindi = spokenLanguage === 'hi-IN' || spokenLanguage === 'mr-IN'
    const isEnglish = spokenLanguage === 'en-IN' || spokenLanguage === 'en-US'

    const current = runs[runs.length - 1]
    if (current) {
      const currentIsHindi = current.language === 'hi-IN' || current.language === 'mr-IN'
      const currentIsEnglish = current.language === 'en-IN' || current.language === 'en-US'

      if (isHindi && currentIsHindi) {
        current.language = spokenLanguage
        current.tokens.push(token)
        continue
      }
      if (isEnglish && currentIsEnglish) {
        current.language = spokenLanguage
        current.tokens.push(token)
        continue
      }

      // A different language family. Merge a short foreign run into the
      // surrounding speech rather than switching voice for one borrowed word.
      if (isEnglish && currentIsHindi && token.kind === 'TECHNICAL_WORD') {
        current.tokens.push({ ...token, language: current.language })
        continue
      }
      if (isHindi && currentIsEnglish && current.tokens.length < SWITCH_THRESHOLD) {
        current.tokens.push({ ...token, language: current.language })
        continue
      }
    }

    runs.push({ language: spokenLanguage, tokens: [token] })
  }

  return runs
}

/** Joins a run's tokens back into speakable text. */
function renderRun(run: Run): string {
  return run.tokens
    .map((token) => token.spoken)
    .filter((spoken) => spoken.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Runs the full pipeline: clean, detect, classify, normalise, then group into
 * language segments ready for the engine.
 *
 * Pure and local: the same input always produces the same output, nothing
 * leaves the device, and no text is retained after the caller drops the result.
 */
export function prepareForSpeech(
  input: string,
  options: BuildSegmentsOptions = {},
): SpeechSegment[] {
  const maxChars = Math.max(20, Math.floor(options.maxChars ?? CHUNK_MAX_CHARS))
  const cleaned = stripEmoji(input).replace(/\s+/g, ' ').trim()
  if (!cleaned) return []

  const pieces = splitPieces(cleaned)
  const tokens: Token[] = []
  for (const piece of pieces) {
    if (piece.glue) continue
    const token = classifyToken(piece.raw)
    if (token.spoken.trim()) tokens.push(token)
  }

  const runs = buildRuns(mergeClockTimes(tokens))
  const segments: SpeechSegment[] = []

  for (const run of runs) {
    const text = renderRun(run)
    if (!text) continue

    // Keep a run whole when it fits, otherwise split it into engine-sized
    // pieces. Splitting never reorders or drops anything.
    if (text.length <= maxChars) {
      segments.push({ text, language: run.language })
      continue
    }

    const words = text.split(' ')
    let buffer = ''
    for (const word of words) {
      const candidate = buffer ? `${buffer} ${word}` : word
      if (candidate.length > maxChars && buffer) {
        segments.push({ text: buffer, language: run.language })
        buffer = word
      } else {
        buffer = candidate
      }
    }
    if (buffer) segments.push({ text: buffer, language: run.language })
  }

  return segments
}
