import type { SpeechLanguage, SpeechSegment } from './types'
import { compareVoices } from '../utils/voices'

/**
 * Whether the device can actually speak a locale.
 *
 * `UNKNOWN` is used when the platform has not reported its voice list yet, so
 * the app can tell "no voice" apart from "we do not know yet" and never guess.
 */
export type VoiceAvailability = 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN'

/** Locales the app treats as English, best first. */
const ENGLISH_FALLBACKS: readonly SpeechLanguage[] = ['en-IN', 'en-US']

function normaliseLocale(locale: string): string {
  return locale.trim().toLowerCase()
}

/**
 * Reports whether any installed voice can read this locale.
 *
 * The check is on the voice's actual BCP-47 tag, not on the name shown in a
 * picker, because a device can label a voice "Hindi" while its locale is
 * something else entirely.
 */
export function checkVoiceAvailability(
  voices: readonly SpeechSynthesisVoice[],
  locale: string,
): VoiceAvailability {
  if (voices.length === 0) return 'UNKNOWN'

  const wanted = normaliseLocale(locale)
  // "hi" matches "hi-IN" and "hi-in-x-..." but not "xh-IN".
  const language = wanted.split('-')[0]

  const matches = voices.some((voice) => {
    const tag = normaliseLocale(voice.lang)
    return tag === wanted || tag === language || tag.startsWith(`${language}-`)
  })

  return matches ? 'AVAILABLE' : 'UNAVAILABLE'
}

/** Human-readable names used in the "voice not available" message. */
export const LANGUAGE_NAMES: Readonly<Record<SpeechLanguage, string>> = {
  'hi-IN': 'Hindi',
  'mr-IN': 'Marathi',
  'en-IN': 'English',
  'en-US': 'English',
}

export interface MissingVoice {
  readonly language: SpeechLanguage
  readonly name: string
  readonly title: string
  readonly message: string
}

export interface ValidationResult {
  readonly ok: boolean
  /** Locales that must be spoken but have no installed voice. */
  readonly missing: readonly MissingVoice[]
  /** Locales that will be read by a voice of a different language. */
  readonly substituted: readonly MissingVoice[]
}

/**
 * Why a locale cannot be spoken.
 *
 * `missing` and `unverified` are kept apart because they need different
 * wording and different fixes: one is fixed in system settings, the other by
 * reloading the voice list. Never describing them the same way, because
 * telling someone to install a voice they already have is a dead end.
 */
type UnavailableReason = 'missing' | 'unverified'

function describe(language: SpeechLanguage, reason: UnavailableReason): MissingVoice {
  const name = LANGUAGE_NAMES[language]
  if (reason === 'unverified') {
    return {
      language,
      name,
      title: `${name} Voice Could Not Be Checked`,
      message: `ReadAloud could not read this device's text-to-speech voice list, so it cannot confirm a ${name} voice is available. Install or enable a ${name} voice, then try again.`,
    }
  }
  return {
    language,
    name,
    title: `${name} Voice Not Available`,
    message: `${name} voice is not installed or enabled on this device. Install or enable a ${name} voice to get correct pronunciation.`,
  }
}

/**
 * Checks every segment before any speech starts.
 *
 * This is the guard the app must not do without: reading Devanagari with an
 * English voice is not a degraded experience, it is a wrong pronunciation. So
 * a missing Hindi or Marathi voice blocks playback, and `allowFallback` is the
 * only way to override that. English may fall back between English locales,
 * because that never changes the language being read.
 *
 * A voice list the platform has not reported yet (`UNKNOWN`) blocks as well,
 * for the same reason: an unchecked list must never be read as permission.
 */
export function validateSegments(
  segments: readonly SpeechSegment[],
  voices: readonly SpeechSynthesisVoice[],
  options: { allowFallback?: boolean } = {},
): ValidationResult {
  const allowFallback = options.allowFallback ?? false
  const missing: MissingVoice[] = []
  const substituted: MissingVoice[] = []
  const seen = new Set<SpeechLanguage>()

  for (const segment of segments) {
    if (seen.has(segment.language)) continue
    seen.add(segment.language)

    const status = checkVoiceAvailability(voices, segment.language)
    if (status === 'AVAILABLE') continue

    // English may move to another English voice; any other language may not.
    if (ENGLISH_FALLBACKS.includes(segment.language)) {
      const hasEnglish = ENGLISH_FALLBACKS.some(
        (locale) => locale !== segment.language && checkVoiceAvailability(voices, locale) === 'AVAILABLE',
      )
      if (hasEnglish) continue
    }

    const described = describe(segment.language, status === 'UNKNOWN' ? 'unverified' : 'missing')
    if (allowFallback) substituted.push(described)
    else missing.push(described)
  }

  return { ok: missing.length === 0, missing, substituted }
}

/**
 * Picks the best installed voice for a locale, never crossing languages.
 *
 * Exact regional matches are preferred, then any voice of the same language,
 * so `hi-IN` can be satisfied by a voice the device tags simply `hi`. Within a
 * locale the same ranking the picker uses decides, which keeps network voices
 * last and prefers the most natural-sounding voice.
 */
export function findVoiceForLocale(
  voices: readonly SpeechSynthesisVoice[],
  locale: SpeechLanguage,
): SpeechSynthesisVoice | null {
  const wanted = normaliseLocale(locale)
  const exact = voices.filter((voice) => normaliseLocale(voice.lang) === wanted)
  if (exact.length > 0) return [...exact].sort(compareVoices)[0]

  const language = wanted.split('-')[0]
  const sameLanguage = voices.filter((voice) => {
    const tag = normaliseLocale(voice.lang)
    return tag === language || tag.startsWith(`${language}-`)
  })
  if (sameLanguage.length > 0) return [...sameLanguage].sort(compareVoices)[0]

  return null
}
