/**
 * ReadAloud's pronunciation engine.
 *
 * Text is cleaned, its script is detected, every token is classified against
 * local dictionaries, pronunciations are normalised, and the result is grouped
 * into per-language segments that the device engine can read in sequence.
 *
 * Everything here is local, offline and deterministic. No text is stored, no
 * network call is made, and no generative AI is involved: every decision comes
 * from Unicode ranges and the dictionaries in `dictionaries.ts`.
 */
export { prepareForSpeech, type BuildSegmentsOptions } from './segments'
export { classifyToken, detectScript, romanHindiToDevanagari } from './classify'
export { classifyVoiceQuality, pickBestVoice } from '../utils/voices'
export type { SpeechLanguage, SpeechSegment, Token, TokenKind } from './types'
export {
  clearUserPronunciations,
  getUserPronunciation,
  setUserPronunciation,
} from './dictionaries'
