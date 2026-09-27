import { useMemo, useState } from 'react'

import {
  ALL_LANGUAGES,
  classifyVoiceQuality,
  formatVoiceLabel,
  groupVoicesByLanguage,
  isPreferredLanguage,
  PREFERRED_LANGUAGES,
} from '../utils/voices'

interface VoiceSelectorProps {
  voices: SpeechSynthesisVoice[]
  voicesLoading: boolean
  selectedVoiceURI: string
  onSelect: (voiceURI: string) => void
  disabled: boolean
}

const DEVICE_DEFAULT = ''

/** The two languages the app is built for, in the order they are offered. */
const PREFERRED_ORDER = PREFERRED_LANGUAGES as readonly string[]

/**
 * Language filter and voice picker for Hindi and Marathi. The list is built from
 * the voices the device actually exposes - nothing is hardcoded or faked - and
 * each voice is marked with how human it sounds, because that is what decides
 * whether the reading feels natural.
 */
export function VoiceSelector({
  voices,
  voicesLoading,
  selectedVoiceURI,
  onSelect,
  disabled,
}: VoiceSelectorProps) {
  const groups = useMemo(() => groupVoicesByLanguage(voices), [voices])

  // Lead with Hindi and Marathi. A device that has neither still works, it
  // just falls back to offering every language it does have.
  const offeredGroups = useMemo(() => {
    const preferred = groups.filter((group) => isPreferredLanguage(group.languageTag))
    return preferred.length > 0 ? preferred : groups
  }, [groups])

  const fallbackTag = offeredGroups[0]?.languageTag ?? ALL_LANGUAGES

  // Hindi leads, then Marathi. Voices arrive after the first render, so the
  // default is derived rather than stored: a stale choice falls back by itself
  // and a fresh one is picked as soon as it is on offer.
  const preferredTag = useMemo(() => {
    const match = PREFERRED_ORDER.find((tag) => offeredGroups.some((group) => group.languageTag === tag))
    return match ?? fallbackTag
  }, [offeredGroups, fallbackTag])

  const [chosenLanguage, setChosenLanguage] = useState<string | null>(null)
  const language =
    chosenLanguage && offeredGroups.some((group) => group.languageTag === chosenLanguage)
      ? chosenLanguage
      : preferredTag

  const hasVoices = voices.length > 0
  const selectionIsValid = voices.some((voice) => voice.voiceURI === selectedVoiceURI)
  const selectValue = selectionIsValid ? selectedVoiceURI : DEVICE_DEFAULT
  const showGroups = language === ALL_LANGUAGES && groups.length > 1

  const handleLanguageChange = (nextLanguage: string) => {
    setChosenLanguage(nextLanguage)

    if (nextLanguage === ALL_LANGUAGES) return
    if (selectionIsValid && voices.some((voice) => voice.voiceURI === selectedVoiceURI && voice.lang === nextLanguage)) {
      return
    }

    const group = groups.find((candidate) => candidate.languageTag === nextLanguage)
    onSelect(group?.voices[0]?.voiceURI ?? DEVICE_DEFAULT)
  }

  const describe = (voice: SpeechSynthesisVoice): string => {
    const label = showGroups ? voice.name : formatVoiceLabel(voice)
    const quality = classifyVoiceQuality(voice)
    if (quality === 'natural') return `${label} \u2022 Natural`
    if (quality === 'basic') return `${label} \u2022 Robotic`
    return label
  }

  return (
    <div className="voice-selector">
      <div className="field">
        <label className="field__label" htmlFor="readaloud-language">
          Language
        </label>
        <select
          id="readaloud-language"
          className="field__control"
          value={language}
          onChange={(event) => handleLanguageChange(event.target.value)}
          disabled={disabled || !hasVoices}
        >
          {offeredGroups.map((group) => (
            <option key={group.languageTag} value={group.languageTag}>
              {group.languageName} ({group.voices.length})
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="readaloud-voice">
          Voice
        </label>
        <select
          id="readaloud-voice"
          className="field__control"
          value={selectValue}
          onChange={(event) => onSelect(event.target.value)}
          disabled={disabled || !hasVoices}
        >
          {/*
            Exactly one option carries the default value: while no device voice
            is known yet, the select explains why instead of duplicating it.
          */}
          {!hasVoices && voicesLoading && <option value={DEVICE_DEFAULT}>Loading voices...</option>}

          {!hasVoices && !voicesLoading && (
            <option value={DEVICE_DEFAULT}>No voices found on this device</option>
          )}

          {hasVoices && <option value={DEVICE_DEFAULT}>Device default voice</option>}

          {visibleGroupsFor(offeredGroups, language).map((group) =>
            showGroups ? (
              <optgroup key={group.languageTag} label={group.languageName}>
                {group.voices.map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI} title={voice.lang}>
                    {describe(voice)}
                  </option>
                ))}
              </optgroup>
            ) : (
              group.voices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI} title={voice.lang}>
                  {describe(voice)}
                </option>
              ))
            ),
          )}
        </select>
        <p className="field__hint">
          Voices marked <strong>Natural</strong> sound like a person. Install a natural Hindi or
          Marathi voice pack if every option here is marked Robotic.
        </p>
      </div>
    </div>
  )
}

function visibleGroupsFor(
  groups: ReturnType<typeof groupVoicesByLanguage>,
  language: string,
): ReturnType<typeof groupVoicesByLanguage> {
  if (language === ALL_LANGUAGES) return groups
  const exact = groups.find((group) => group.languageTag === language)
  if (exact) return [exact]

  // A base tag such as `hi` should still surface `hi-IN`.
  return groups.filter((group) => isPreferredLanguage(group.languageTag) && sameBase(group.languageTag, language))
}

function sameBase(a: string, b: string): boolean {
  return a.toLowerCase().split('-')[0] === b.toLowerCase().split('-')[0]
}
