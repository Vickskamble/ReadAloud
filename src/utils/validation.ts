export const EMPTY_TEXT_MESSAGE = 'Please enter some text first.'

export const TTS_UNAVAILABLE_MESSAGE =
  'Text-to-Speech is not available on this device/browser. Please try another browser or install a supported voice.'

export const VOICE_UNAVAILABLE_MESSAGE =
  'The selected voice is no longer available. Please choose another voice.'

export const SPEECH_FAILED_MESSAGE =
  'Something went wrong while reading the text. Please try again.'

export const AUDIO_BLOCKED_MESSAGE =
  'Audio playback was blocked. Please allow speech playback and try again.'

export const NETWORK_VOICE_MESSAGE =
  'This voice needs an internet connection. Please choose an offline voice.'

export const TEXT_TOO_LONG_MESSAGE =
  'This text is too long to read. Please shorten it or split it into smaller parts.'

/**
 * Returns a user-facing message when the text cannot be read, otherwise null.
 * Used instead of silently truncating (see the "very long input" requirement).
 */
export function getTextValidationError(text: string, maxLength: number): string | null {
  if (!text.trim()) return EMPTY_TEXT_MESSAGE
  if (text.length > maxLength) return TEXT_TOO_LONG_MESSAGE
  return null
}
