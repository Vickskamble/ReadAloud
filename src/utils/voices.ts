export interface VoiceGroup {
  languageTag: string
  languageName: string
  voices: SpeechSynthesisVoice[]
}

function displayNames(): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' })
  } catch {
    return null
  }
}

function resolveLanguageName(names: Intl.DisplayNames, tag: string): string | null {
  try {
    const value = names.of(tag)
    if (!value) return null
    // Reject placeholders ("zz (Unknown Region)") and values that simply echo
    // the tag back, so the UI falls back to the full original tag instead.
    if (/unknown/i.test(value)) return null
    if (value.toLowerCase() === tag.toLowerCase()) return null
    return value
  } catch {
    return null
  }
}

/**
 * Turns a BCP-47 tag such as `hi-IN` into a readable name.
 * Falls back to the raw tag when the runtime cannot resolve it, so the UI never
 * shows a placeholder such as "zz (Unknown Region)".
 */
export function getLanguageName(tag: string): string {
  if (!tag) return 'Unknown'
  const names = displayNames()
  if (!names) return tag

  const exact = resolveLanguageName(names, tag)
  if (exact) return exact

  const base = tag.split('-')[0]
  if (base && base !== tag) {
    const resolved = resolveLanguageName(names, base)
    if (resolved) return resolved
  }

  return tag
}

/**
 * Human-readable label for a voice, using only what the device reports.
 */
export function formatVoiceLabel(voice: SpeechSynthesisVoice): string {
  const language = getLanguageName(voice.lang)
  const name = voice.name.trim()
  return voice.lang && language !== voice.lang ? `${language} - ${name}` : name
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base' })
}

/**
 * Groups device voices by language for the language filter. The list is derived
 * entirely from the voices the device actually exposes.
 */
export function groupVoicesByLanguage(voices: SpeechSynthesisVoice[]): VoiceGroup[] {
  const groups = new Map<string, VoiceGroup>()

  for (const voice of voices) {
    const tag = voice.lang || 'unknown'
    const existing = groups.get(tag)
    if (existing) {
      existing.voices.push(voice)
    } else {
      groups.set(tag, {
        languageTag: tag,
        languageName: getLanguageName(tag),
        voices: [voice],
      })
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      // The best-sounding voice in a language is the first one offered, so a
      // user who never touches the picker still gets the most natural option.
      voices: [...group.voices].sort(compareVoices),
    }))
    .sort((a, b) => {
      if (a.languageTag === 'unknown') return 1
      if (b.languageTag === 'unknown') return -1
      return compareStrings(a.languageName, b.languageName)
    })
}

export const ALL_LANGUAGES = 'all'

/**
 * Voice choice meaning "no preference yet": the best-sounding Hindi or Marathi
 * voice is used. It is distinct from the device default, which the user can
 * also choose on purpose.
 */
export const AUTO_VOICE = 'auto'

/**
 * The languages ReadAloud speaks out of the box. The app is built for Hindi
 * and Marathi, so the language filter leads with these and the voice picker
 * starts on the best one the device has.
 */
export const PREFERRED_LANGUAGES = ['hi-IN', 'mr-IN'] as const

/** Matches `hi`, `hi-IN`, `hi-Latn` and friends. */
export function baseLanguage(tag: string): string {
  return (tag || '').toLowerCase().split(/[-_]/)[0]
}

export function isPreferredLanguage(tag: string): boolean {
  return PREFERRED_LANGUAGES.some((preferred) => baseLanguage(preferred) === baseLanguage(tag))
}

/**
 * How human a voice sounds, judged from the name the device reports. A neural
 * or "online" voice is speech-synthesised and sounds like a person; a compact
 * or eSpeak voice is a formant synthesiser and sounds robotic. There is no API
 * for this, so the name is the only signal available.
 */
export type VoiceQuality = 'natural' | 'standard' | 'basic'

const NATURAL_HINTS = ['natural', 'neural', 'premium', 'enhanced', 'expressive', 'online', 'google', 'siri']

const BASIC_HINTS = ['compact', 'espeak', 'eloquence', 'pico', 'legacy', 'robotic', 'samuel']

const QUALITY_RANK: Record<VoiceQuality, number> = { natural: 0, standard: 1, basic: 2 }

export function classifyVoiceQuality(voice: SpeechSynthesisVoice): VoiceQuality {
  const name = (voice.name || '').toLowerCase()
  // Checked before the basic list, because "Microsoft Swara Online (Natural)"
  // contains both "online" and nothing harmful, while some packs do mix words.
  if (NATURAL_HINTS.some((hint) => name.includes(hint))) return 'natural'
  if (BASIC_HINTS.some((hint) => name.includes(hint))) return 'basic'
  return 'standard'
}

/**
 * A remote voice (Chrome's and Edge's "Google" voices) synthesises on a
 * server, which would send the text off the device. Those are always ranked
 * last, whatever their quality, so the app keeps its no-server promise.
 */
export function isRemoteVoice(voice: SpeechSynthesisVoice): boolean {
  return voice.localService === false
}

/** Best-sounding voice first, used for the default pick and the picker order. */
export function compareVoices(a: SpeechSynthesisVoice, b: SpeechSynthesisVoice): number {
  if (isRemoteVoice(a) !== isRemoteVoice(b)) return isRemoteVoice(a) ? 1 : -1

  const quality = QUALITY_RANK[classifyVoiceQuality(a)] - QUALITY_RANK[classifyVoiceQuality(b)]
  if (quality !== 0) return quality

  return compareStrings(a.name, b.name)
}

/**
 * Picks the voice that will sound most human for the given languages, falling
 * back to any voice when the device has none in those languages.
 */
export function pickBestVoice(
  voices: SpeechSynthesisVoice[],
  preferred: readonly string[] = PREFERRED_LANGUAGES,
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null

  const wanted = preferred.map(baseLanguage)
  const matching = voices.filter((voice) => wanted.includes(baseLanguage(voice.lang)))
  const pool = matching.length > 0 ? matching : voices

  return [...pool].sort(compareVoices)[0]
}
