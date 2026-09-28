import {
  ABBREVIATIONS,
  ENGLISH_WORDS,
  HINGLISH_WORDS,
  MARATHI_LETTERS,
  MARATHI_WORDS,
  TECHNICAL_WORDS,
  WORD_ABBREVIATIONS,
  getUserPronunciation,
} from './dictionaries'
import {
  normalizeCurrency,
  normalizeDate,
  normalizeEmail,
  normalizeNumber,
  normalizeTime,
  normalizeUrl,
} from './normalize'
import type { SpeechLanguage, Token, TokenKind } from './types'

/**
 * Local script detection. Uses Unicode block ranges only, so it works the same
 * on every device with no model and no network call.
 */
const DEVANAGARI = /[\u0900-\u097F]/
const LATIN = /[A-Za-z]/

export type Script = 'devanagari' | 'latin' | 'none'

export function detectScript(text: string): Script {
  if (DEVANAGARI.test(text)) return 'devanagari'
  if (LATIN.test(text)) return 'latin'
  return 'none'
}

const URL = /^(?:https?:\/\/|www\.)[^\s]+/i
const EMAIL = /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+$/
const CURRENCY = /^(?:[₹$€£¥]|\b(?:rs\.?|usd|eur|gbp|jpy)\b)\s*[\d.,]+$/i
const TIME = /^\d{1,2}(?::\d{2})?\s*[ap]\.?\s*m\.?$/i
const NUMBER = /^[\d.,]+%?$/
const DATE = /^(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+[a-z]{3,9}\.?\s+\d{4}|[a-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})$/i
// Unicode punctuation and symbol classes rather than `\w`, which is
// ASCII-only and would swallow every Devanagari word as punctuation.
const PUNCTUATION = /^[\p{P}\p{S}]+$/u

// The modifier and joiner ranges are part of a grapheme cluster, so they belong
// in the class deliberately; matching them separately would break sequences.
// eslint-disable-next-line no-misleading-character-class
const EMOJI_ONLY = /^[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]+$/u

/**
 * Roman Hindi written with English letters. The sound is produced by rewriting
 * the word into Devanagari, because a Hindi voice reads Devanagari correctly
 * while an English voice reads "mujhe" as "muj he".
 *
 * Transliteration follows Hindustani spelling: a consonant plus its vowel is
 * one syllable, an unwritten vowel becomes the inherent schwa, and a word
 * ending on a bare consonant drops that schwa ("aaj" is "आज", not "आजअ").
 */
const CONSONANT_3: Readonly<Record<string, string>> = { chh: 'छ' }

const CONSONANT_2: Readonly<Record<string, string>> = {
  kh: 'ख', gh: 'घ', ng: 'ङ', ch: 'च', jh: 'झ', th: 'थ', dh: 'ध', ph: 'फ',
  bh: 'भ', sh: 'श', ss: 'ष',
  // Conjuncts, so "kya" is "क्या" rather than "कय".
  ky: 'क्य', gy: 'ग्य', tr: 'त्र', pr: 'प्र', br: 'ब्र', kr: 'क्र', gr: 'ग्र',
  vr: 'व्र', shr: 'श्र', ty: 'त्य', ny: 'न्य', hy: 'ह्य', thy: 'थ्य',
  dhy: 'ध्य', phy: 'फ्य', shy: 'श्य', chy: 'च्य', jhy: 'झ्य', bhy: 'भ्य',
  khy: 'ख्य', ghy: 'घ्य', my: 'म्य', py: 'प्य', by: 'ब्य', fy: 'फ़्य',
}

const CONSONANT_1: Readonly<Record<string, string>> = {
  k: 'क', g: 'ग', c: 'च', j: 'ज', t: 'ट', d: 'द', n: 'न', p: 'प',
  b: 'ब', m: 'म', y: 'य', r: 'र', l: 'ल', v: 'व', w: 'व', f: 'फ़',
  s: 'स', h: 'ह', z: 'ज़', q: 'क',
}

/** A vowel written on its own, with no consonant in front of it. */
const INDEPENDENT_VOWEL: Readonly<Record<string, string>> = {
  a: 'अ', aa: 'आ', i: 'इ', ee: 'ई', u: 'उ', uu: 'ऊ',
  e: 'ए', ei: 'ए', ai: 'ऐ', o: 'ओ', au: 'औ',
}

/**
 * The same vowel written after a consonant, as a matra.
 *
 * Every entry here is a *vowel sign*, not a standalone letter: `ा` and not
 * `आ`. Using the independent vowel produces "जआन" instead of "जाना".
 */
const MATRA: Readonly<Record<string, string>> = {
  // A bare "a" is the inherent schwa, which Devanagari already carries, so it
  // adds nothing. Spelling it out would produce "चअलो" instead of "चलो".
  '': '', a: '', aa: 'ा', i: 'ि', ee: 'ी', u: 'ु', uu: 'ू',
  e: 'े', ei: 'े', ai: 'ै', o: 'ो', au: 'ौ',
}

/**
 * Conjuncts ending in य, where Roman "a" is the long आ rather than a schwa:
 * "kya" is "क्या", not "क्य".
 */
const YA_CONJUNCT = /य$/u

function matchAt(source: string, table: Readonly<Record<string, string>>, length: number): string | null {
  const slice = source.slice(0, length)
  return table[slice] ?? null
}

/**
 * Rewrites a Roman Hindi word into Devanagari so a Hindi voice pronounces it
 * properly. Only ever called for words already known to be Hinglish, so
 * English words cannot be turned into Hindi by accident.
 */
export function romanHindiToDevanagari(word: string): string {
  const src = word.toLowerCase()
  let out = ''
  let index = 0
  let pendingConsonant = ''

  const flush = (vowel: string, bare: boolean, atEnd = false) => {
    if (!pendingConsonant) {
      out += INDEPENDENT_VOWEL[vowel] ?? vowel
      return
    }
    if (bare) {
      // Word ends on a bare consonant: Hindi leaves the schwa unsaid.
      out += pendingConsonant
    } else if (vowel === 'a' && (atEnd || YA_CONJUNCT.test(pendingConsonant))) {
      // A word-final schwa is written out ("karna" is करना), and a य-conjunct
      // always takes the long form ("kya" is क्या).
      out += pendingConsonant + MATRA.aa
    } else {
      out += pendingConsonant + (MATRA[vowel] ?? MATRA[''])
    }
    pendingConsonant = ''
  }

  while (index < src.length) {
    const rest = src.slice(index)

    const consonant3 = matchAt(rest, CONSONANT_3, 3)
    const consonant2 = matchAt(rest, CONSONANT_2, 2)
    const consonant1 = matchAt(rest, CONSONANT_1, 1)

    if (consonant3 || consonant2 || consonant1) {
      if (pendingConsonant) flush('', true)
      pendingConsonant = consonant3 ?? consonant2 ?? consonant1 ?? ''
      index += consonant3 ? 3 : consonant2 ? 2 : 1
      continue
    }

    const vowel3 = matchAt(rest, INDEPENDENT_VOWEL, 3)
    const vowel2 = matchAt(rest, INDEPENDENT_VOWEL, 2)
    const vowel1 = matchAt(rest, INDEPENDENT_VOWEL, 1)
    const vowel = vowel3 ?? vowel2 ?? vowel1
    if (vowel) {
      const key = vowel3 ? rest.slice(0, 3) : vowel2 ? rest.slice(0, 2) : rest.slice(0, 1)
      index += key.length
      flush(key, false, index >= src.length)
      continue
    }

    // Not a letter we know: keep it so nothing is silently dropped.
    if (pendingConsonant) flush('', true)
    out += rest[0]
    index += 1
  }

  if (pendingConsonant) flush('', true)
  return out
}

function isAcronym(word: string): boolean {
  if (word.length < 2 || word.length > 5) return false
  return /^[A-Z]{2,5}$/.test(word)
}

function isProperName(word: string): boolean {
  // Capitalised, not a sentence-initial word we cannot tell apart, and not an
  // acronym. Kept deliberately conservative: a wrong guess here changes the
  // language, so it only fires on a clear pattern.
  if (!/^[A-Z][a-z]{2,}$/.test(word)) return false
  return !ENGLISH_WORDS.has(word.toLowerCase()) && !TECHNICAL_WORDS.has(word.toLowerCase())
}

/**
 * Hindi and Marathi share the Devanagari script, so the language is decided by
 * vocabulary: a Marathi-only word or a Marathi-only letter settles it, and
 * anything else is read as Hindi.
 */
function isMarathi(text: string): boolean {
  if (MARATHI_LETTERS.test(text)) return true
  return MARATHI_WORDS.has(text)
}

/**
 * The language a token is spoken in.
 *
 * Numbers, dates and addresses are marked English here on purpose: they are
 * borrowed into whichever sentence they appear in, and the segment builder
 * folds them into the surrounding run so they are read in that language.
 */
function languageForToken(kind: TokenKind, text: string): SpeechLanguage {
  switch (kind) {
    case 'HINDI_DEVANAGARI':
    case 'MARATHI_DEVANAGARI':
    case 'HINDI_ROMAN':
      return isMarathi(text) ? 'mr-IN' : 'hi-IN'
    case 'ACRONYM':
      return ABBREVIATIONS.has(text.toLowerCase()) ? 'en-IN' : 'en-US'
    default:
      return 'en-IN'
  }
}

/**
 * Classifies one token and decides how it should be spoken.
 *
 * Priority follows the specification: user override, then technical and
 * abbreviation dictionaries, then English, then Hinglish, then script, then
 * rules, then the engine's own default.
 */
export function classifyToken(raw: string): Token {
  const text = raw.trim()
  if (!text) {
    return { text: raw, kind: 'PUNCTUATION', language: 'en-IN', spoken: '' }
  }

  const override = getUserPronunciation(text)
  if (override) {
    return { text, kind: 'PROPER_NAME', language: 'en-IN', spoken: override }
  }

  if (EMOJI_ONLY.test(text)) {
    return { text, kind: 'EMOJI', language: 'en-IN', spoken: '' }
  }

  if (URL.test(text)) {
    return { text, kind: 'URL', language: languageForToken('URL', text), spoken: normalizeUrl(text) }
  }
  if (EMAIL.test(text)) {
    return { text, kind: 'EMAIL', language: languageForToken('EMAIL', text), spoken: normalizeEmail(text) }
  }

  if (CURRENCY.test(text)) {
    return { text, kind: 'CURRENCY', language: languageForToken('CURRENCY', text), spoken: normalizeCurrency(text) }
  }

  if (TIME.test(text)) {
    return { text, kind: 'TIME', language: languageForToken('TIME', text), spoken: normalizeTime(text) }
  }

  if (NUMBER.test(text)) {
    return { text, kind: 'NUMBER', language: languageForToken('NUMBER', text), spoken: normalizeNumber(text) }
  }

  if (DATE.test(text)) {
    return { text, kind: 'DATE', language: languageForToken('DATE', text), spoken: normalizeDate(text) }
  }

  if (PUNCTUATION.test(text)) {
    return { text, kind: 'PUNCTUATION', language: 'en-IN', spoken: text }
  }

  if (detectScript(text) === 'devanagari') {
    const kind: TokenKind = isMarathi(text) ? 'MARATHI_DEVANAGARI' : 'HINDI_DEVANAGARI'
    return { text, kind, language: languageForToken(kind, text), spoken: text }
  }

  const lower = text.toLowerCase()

  if (ABBREVIATIONS.has(lower)) {
    const spoken = ABBREVIATIONS.get(lower) ?? lower
    return {
      text,
      kind: WORD_ABBREVIATIONS.has(lower) ? 'TECHNICAL_WORD' : 'ACRONYM',
      language: 'en-IN',
      spoken,
    }
  }

  if (TECHNICAL_WORDS.has(lower)) {
    return { text, kind: 'TECHNICAL_WORD', language: 'en-IN', spoken: text }
  }

  if (isAcronym(text)) {
    return {
      text,
      kind: 'ACRONYM',
      language: 'en-US',
      spoken: `${text.split('').join(' ')}`,
    }
  }

  if (ENGLISH_WORDS.has(lower)) {
    return { text, kind: 'ENGLISH', language: 'en-IN', spoken: text }
  }

  if (HINGLISH_WORDS.has(lower)) {
    return { text, kind: 'HINDI_ROMAN', language: 'hi-IN', spoken: romanHindiToDevanagari(lower) }
  }

  if (isProperName(text)) {
    return { text, kind: 'PROPER_NAME', language: 'en-IN', spoken: text }
  }

  // An unknown word. Read as written; the engine's own default is the safest
  // available pronunciation and never crashes.
  return { text, kind: 'UNKNOWN', language: 'en-IN', spoken: text }
}
