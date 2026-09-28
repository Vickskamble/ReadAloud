/** How a single piece of text should be spoken. */
export type SpeechLanguage = 'hi-IN' | 'mr-IN' | 'en-IN' | 'en-US'

/**
 * Local, deterministic token classes. Nothing here is guessed by a model: every
 * decision comes from Unicode ranges and the dictionaries in `dictionaries.ts`.
 */
export type TokenKind =
  | 'HINDI_DEVANAGARI'
  | 'MARATHI_DEVANAGARI'
  | 'HINDI_ROMAN'
  | 'ENGLISH'
  | 'NUMBER'
  | 'DATE'
  | 'TIME'
  | 'CURRENCY'
  | 'EMAIL'
  | 'URL'
  | 'ACRONYM'
  | 'EMOJI'
  | 'PUNCTUATION'
  | 'PROPER_NAME'
  | 'TECHNICAL_WORD'
  | 'UNKNOWN'

export interface Token {
  /** Exactly as it appeared in the input. */
  readonly text: string
  readonly kind: TokenKind
  /** Language this token should be spoken in. */
  readonly language: SpeechLanguage
  /** How the token should be spoken, after normalisation and dictionaries. */
  readonly spoken: string
}

export interface SpeechSegment {
  /** Text handed to the engine, ready to be read aloud. */
  readonly text: string
  readonly language: SpeechLanguage
}
