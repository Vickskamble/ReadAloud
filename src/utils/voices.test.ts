import { describe, expect, it } from 'vitest'

import {
  ALL_LANGUAGES,
  baseLanguage,
  classifyVoiceQuality,
  compareVoices,
  formatVoiceLabel,
  getLanguageName,
  groupVoicesByLanguage,
  isPreferredLanguage,
  isRemoteVoice,
  pickBestVoice,
  PREFERRED_LANGUAGES,
} from './voices'
import { createVoice } from '../test/fakeSpeech'

describe('getLanguageName', () => {
  it('resolves common language tags to English names', () => {
    expect(getLanguageName('fr')).toBe('French')
    expect(getLanguageName('de')).toBe('German')
    expect(getLanguageName('en-US')).toMatch(/English/)
    expect(getLanguageName('hi-IN')).toMatch(/Hindi/)
  })

  it('falls back to the base language when the region is unknown', () => {
    expect(getLanguageName('fr-ZZ')).toBe('French')
  })

  it('returns the raw tag when it cannot be resolved', () => {
    expect(getLanguageName('zz-ZZ')).toBe('zz-ZZ')
  })

  it('handles an empty tag', () => {
    expect(getLanguageName('')).toBe('Unknown')
  })
})

describe('formatVoiceLabel', () => {
  it('prefixes the voice name with its language', () => {
    const label = formatVoiceLabel(createVoice({ name: 'Google UK English Female', lang: 'en-GB' }))
    expect(label).toContain('Google UK English Female')
    expect(label).toContain('British English')
  })

  it('falls back to the voice name alone', () => {
    expect(formatVoiceLabel(createVoice({ name: 'Test', lang: '' }))).toBe('Test')
  })
})

describe('groupVoicesByLanguage', () => {
  const voices = [
    createVoice({ voiceURI: 'a', name: 'Zeta', lang: 'en-US' }),
    createVoice({ voiceURI: 'b', name: 'Alpha', lang: 'en-US' }),
    createVoice({ voiceURI: 'c', name: 'Swara', lang: 'hi-IN' }),
    createVoice({ voiceURI: 'd', name: 'Lohe', lang: 'mr-IN' }),
  ]

  it('groups voices by their language tag', () => {
    const groups = groupVoicesByLanguage(voices)
    expect(groups.map((group) => group.languageTag)).toEqual(['en-US', 'hi-IN', 'mr-IN'])
  })

  it('sorts voices alphabetically inside a group', () => {
    const groups = groupVoicesByLanguage(voices)
    expect(groups[0].voices.map((voice) => voice.name)).toEqual(['Alpha', 'Zeta'])
  })

  it('groups an untagged voice under unknown', () => {
    const groups = groupVoicesByLanguage([createVoice({ lang: '' })])
    expect(groups).toHaveLength(1)
    expect(groups[0].languageTag).toBe('unknown')
  })

  it('returns an empty array when the device exposes no voices', () => {
    expect(groupVoicesByLanguage([])).toEqual([])
  })

  it('exposes a sentinel for the "All languages" filter', () => {
    expect(ALL_LANGUAGES).toBe('all')
  })

  it('puts the best-sounding voice first inside a group', () => {
    const groups = groupVoicesByLanguage([
      createVoice({ voiceURI: 'compact', name: 'Microsoft Swara - Hindi (India) Compact', lang: 'hi-IN' }),
      createVoice({
        voiceURI: 'natural',
        name: 'Microsoft Swara Online (Natural) - Hindi (India)',
        lang: 'hi-IN',
      }),
    ])
    expect(groups[0].voices.map((voice) => voice.voiceURI)).toEqual(['natural', 'compact'])
  })
})

describe('preferred languages', () => {
  it('covers Hindi and Marathi only', () => {
    expect(PREFERRED_LANGUAGES.map(baseLanguage)).toEqual(['hi', 'mr'])
  })

  it('recognises the preferred languages whatever the region suffix', () => {
    expect(isPreferredLanguage('hi-IN')).toBe(true)
    expect(isPreferredLanguage('hi')).toBe(true)
    expect(isPreferredLanguage('mr-IN')).toBe(true)
    expect(isPreferredLanguage('en-US')).toBe(false)
  })
})

describe('classifyVoiceQuality', () => {
  it('calls a neural or online voice natural', () => {
    expect(classifyVoiceQuality(createVoice({ name: 'Google Hindi' }))).toBe('natural')
    expect(classifyVoiceQuality(createVoice({ name: 'Swara Online (Natural) - Hindi (India)' }))).toBe(
      'natural',
    )
  })

  it('cannot judge a voice whose name carries no quality hint', () => {
    // "Microsoft Neerja" is in fact a neural voice, but nothing in the name
    // says so, and the API exposes no quality field. The picker stays neutral
    // rather than guessing.
    expect(classifyVoiceQuality(createVoice({ name: 'Microsoft Neerja - English (India)' }))).toBe(
      'standard',
    )
  })

  it('calls a compact or eSpeak voice basic', () => {
    expect(classifyVoiceQuality(createVoice({ name: 'Microsoft Swara - Hindi (India) Compact' }))).toBe(
      'basic',
    )
    expect(classifyVoiceQuality(createVoice({ name: 'eSpeak' }))).toBe('basic')
  })

  it('treats anything else as standard', () => {
    expect(classifyVoiceQuality(createVoice({ name: 'Heera' }))).toBe('standard')
  })

  it('prefers natural over basic when a name mentions both', () => {
    expect(classifyVoiceQuality(createVoice({ name: 'Swara Online (Natural) Compact' }))).toBe('natural')
  })
})

describe('isRemoteVoice', () => {
  it('treats a voice the device flags as non-local as remote', () => {
    expect(isRemoteVoice(createVoice({ localService: false }))).toBe(true)
    expect(isRemoteVoice(createVoice({ localService: true }))).toBe(false)
  })
})

describe('compareVoices', () => {
  it('ranks a local voice above a remote one, whatever the quality', () => {
    const local = createVoice({ name: 'Swara Compact', localService: true })
    const remote = createVoice({ name: 'Google Hindi', localService: false })

    expect(compareVoices(local, remote)).toBeLessThan(0)
    expect(compareVoices(remote, local)).toBeGreaterThan(0)
  })

  it('ranks a natural local voice above a compact local voice', () => {
    const natural = createVoice({ name: 'Google Hindi', localService: true })
    const compact = createVoice({ name: 'Swara Compact', localService: true })

    expect(compareVoices(natural, compact)).toBeLessThan(0)
  })
})

describe('pickBestVoice', () => {
  it('prefers Hindi and Marathi over any other language', () => {
    const best = pickBestVoice([
      createVoice({ voiceURI: 'en', name: 'Google US English', lang: 'en-US' }),
      createVoice({ voiceURI: 'hi', name: 'Google Hindi', lang: 'hi-IN' }),
    ])
    expect(best?.voiceURI).toBe('hi')
  })

  it('picks the most natural local Hindi voice', () => {
    const best = pickBestVoice([
      createVoice({ voiceURI: 'compact', name: 'Microsoft Swara - Hindi (India) Compact', lang: 'hi-IN' }),
      createVoice({ voiceURI: 'natural', name: 'Google Hindi', lang: 'hi-IN' }),
      createVoice({ voiceURI: 'remote', name: 'Hindi Enhanced', lang: 'hi-IN', localService: false }),
    ])
    expect(best?.voiceURI).toBe('natural')
  })

  it('falls back to Marathi when no Hindi voice exists', () => {
    const best = pickBestVoice([
      createVoice({ voiceURI: 'en', name: 'Zeta', lang: 'en-US' }),
      createVoice({ voiceURI: 'mr', name: 'Google Marathi', lang: 'mr-IN' }),
    ])
    expect(best?.voiceURI).toBe('mr')
  })

  it('falls back to any voice when the device has no Hindi or Marathi', () => {
    const best = pickBestVoice([createVoice({ voiceURI: 'en', name: 'Zeta', lang: 'en-US' })])
    expect(best?.voiceURI).toBe('en')
  })

  it('returns null when there are no voices at all', () => {
    expect(pickBestVoice([])).toBeNull()
  })
})
