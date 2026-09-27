export const CHUNK_MAX_CHARS = 200

export const MAX_TEXT_LENGTH = 100_000

export const RATE_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

export const PITCH_OPTIONS = [
  { value: 0.7, label: 'Low' },
  { value: 1, label: 'Normal' },
  { value: 1.4, label: 'High' },
] as const

export const DEFAULT_RATE = 1
export const DEFAULT_PITCH = 1

export const MIN_NATIVE_RATE = 0.1
export const MAX_NATIVE_RATE = 10
export const MIN_NATIVE_PITCH = 0
export const MAX_NATIVE_PITCH = 2
