import { useEffect, useMemo, useState } from 'react'

import { createSpeechEngine } from '../services/createSpeechEngine'
import type { SpeakCallbacks } from '../services/speechService'
import { CHUNK_MAX_CHARS, MAX_TEXT_LENGTH } from '../utils/constants'
import { prepareForSpeech } from '../pronunciation/segments'
import { validateSegments, type MissingVoice } from '../pronunciation/availability'
import { AUTO_VOICE, isPreferredLanguage, pickBestVoice } from '../utils/voices'
import {
  EMPTY_TEXT_MESSAGE,
  getTextValidationError,
  TTS_UNAVAILABLE_MESSAGE,
  VOICE_UNAVAILABLE_MESSAGE,
} from '../utils/validation'

export type SpeechStatus = 'idle' | 'reading' | 'paused' | 'completed'

export interface UseSpeechSynthesisOptions {
  text: string
  /** Selected voice identity. Empty string means "use the device default". */
  voiceURI: string
  rate: number
  pitch: number
  /**
   * Off by default. When off, text in a language the device has no voice for is
   * never read with a voice of a different language, because that is a wrong
   * pronunciation rather than a degraded one.
   */
  allowFallbackVoice?: boolean
}

export interface UseSpeechSynthesisResult {
  status: SpeechStatus
  isReading: boolean
  isPaused: boolean
  supported: boolean
  voices: SpeechSynthesisVoice[]
  voicesLoading: boolean
  hasNoVoices: boolean
  /**
   * The device has speech engines, but none of them can read Hindi or Marathi.
   * Reading this text anyway means an English voice pronouncing Devanagari,
   * which is the usual cause of "the pronunciation is wrong".
   */
  hasNoPreferredVoice: boolean
  /** Voice the engine will actually speak with, including the automatic pick. */
  activeVoiceURI: string
  selectedVoice: SpeechSynthesisVoice | null
  message: string | null
  /**
   * Set when playback was blocked because a required language voice is not
   * installed. Carries the wording for the dialog and the language to name.
   */
  missingVoice: MissingVoice | null
  /** True when the user allowed reading with a voice of a different language. */
  usingFallbackVoice: boolean
  /** Attempts to open the system voice settings. Resolves false if impossible. */
  openVoiceSettings: () => Promise<boolean>
  /** Dismiss the missing-voice dialog. */
  dismissMissingVoice: () => void
  chunkIndex: number
  totalChunks: number
  /** Text of the chunk being spoken right now, for the live caption. */
  currentChunkText: string
  /** Where the spoken word sits inside `currentChunkText`, from the engine. */
  activeWord: { start: number; length: number } | null
  /** Increments on every real word boundary, so visuals can pulse to speech. */
  speechTick: number
  /** 0..1 through the whole text, or null when nothing has been read yet. */
  progress: number | null
  play: () => void
  pause: () => void
  resume: () => void
  stop: () => void
  clear: () => void
  dismissMessage: () => void
}

/**
 * Owns all speech state for the app: engine lifecycle, voice discovery, the
 * chunk queue and user-facing status. The UI never talks to the TTS engine
 * directly.
 *
 * Nothing here is persisted - closing or refreshing the page discards
 * everything, as required by the privacy model.
 */
export function useSpeechSynthesis({
  text,
  voiceURI,
  rate,
  pitch,
  allowFallbackVoice = false,
}: UseSpeechSynthesisOptions): UseSpeechSynthesisResult {
  // The engine is created once per component and reused across StrictMode
  // remounts. On Android this is the platform text engine, elsewhere the
  // browser's own; neither choice has side effects at construction time.
  const [service] = useState(() => createSpeechEngine())
  const [supported] = useState(() => service.isSupported())

  const [status, setStatus] = useState<SpeechStatus>('idle')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voicesLoading, setVoicesLoading] = useState(supported)
  const [message, setMessage] = useState<string | null>(() =>
    supported ? null : TTS_UNAVAILABLE_MESSAGE,
  )
  const [chunkIndex, setChunkIndex] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const [currentChunkText, setCurrentChunkText] = useState('')
  const [activeWord, setActiveWord] = useState<{ start: number; length: number } | null>(null)
  const [missingVoice, setMissingVoice] = useState<MissingVoice | null>(null)
  const [usingFallbackVoice, setUsingFallbackVoice] = useState(false)
  const allowFallback = allowFallbackVoice
  const [speechTick, setSpeechTick] = useState(0)

  // The UI only deals in voice identifiers; the engine object is resolved here
  // so a voice that the device drops mid-session is handled in one place.
  // `AUTO_VOICE` means "no preference yet" and picks the best-sounding Hindi or
  // Marathi voice, which is what makes the reading sound like a person rather
  // than a robot. An empty `voiceURI` is the device default the user asked for.
  const activeVoiceURI = useMemo(() => {
    if (voiceURI === AUTO_VOICE) return pickBestVoice(voices)?.voiceURI ?? ''
    return voices.some((voice) => voice.voiceURI === voiceURI) ? voiceURI : ''
  }, [voices, voiceURI])

  const selectedVoice = useMemo(
    () => voices.find((voice) => voice.voiceURI === activeVoiceURI) ?? null,
    [voices, activeVoiceURI],
  )

  useEffect(() => {
    if (!supported) return

    const unsubscribe = service.subscribeVoices(setVoices)
    void service.loadVoices().finally(() => setVoicesLoading(false))

    return () => {
      unsubscribe()
      service.release()
    }
  }, [service, supported])

  // Voice, rate and pitch changes apply to the chunks that have not started.
  useEffect(() => {
    service.updateSettings({ voice: selectedVoice, rate, pitch })
  }, [service, selectedVoice, rate, pitch])

  // 0..1 through the whole text, weighted by segment length so a long paragraph
  // does not advance the bar as fast as a short one. Null until something has
  // actually been spoken. Measured over the spoken segments, so the bar and the
  // caption always agree with what the engine is saying out loud.
  const progress = useMemo(() => {
    if (totalChunks === 0 || status === 'idle') return null
    if (status === 'completed') return 1

    const chunks = prepareForSpeech(text, { maxChars: CHUNK_MAX_CHARS })
    const totalChars = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0)
    if (totalChars === 0) return null

    const doneChars = chunks
      .slice(0, chunkIndex)
      .reduce((sum, chunk) => sum + chunk.text.length, 0)
    const inChunk = activeWord
      ? Math.min(activeWord.start + activeWord.length, currentChunkText.length)
      : 0

    return Math.min(1, (doneChars + inChunk) / totalChars)
  }, [text, totalChunks, status, chunkIndex, activeWord, currentChunkText])

  const reset = () => {
    setStatus('idle')
    setChunkIndex(0)
    setTotalChunks(0)
    setCurrentChunkText('')
    setActiveWord(null)
  }

  const play = () => {
    if (status === 'paused') {
      if (service.resume()) setStatus('reading')
      return
    }
    if (status === 'reading') return

    if (!service.isSupported()) {
      setMessage(TTS_UNAVAILABLE_MESSAGE)
      return
    }

    const validationError = getTextValidationError(text, MAX_TEXT_LENGTH)
    if (validationError) {
      setMessage(validationError)
      return
    }

    if (voiceURI !== AUTO_VOICE && voiceURI && !selectedVoice) {
      setMessage(VOICE_UNAVAILABLE_MESSAGE)
      return
    }

    const segments = prepareForSpeech(text, { maxChars: CHUNK_MAX_CHARS })
    if (segments.length === 0) {
      setMessage(EMPTY_TEXT_MESSAGE)
      return
    }

    // The gate the app must not do without: every language this text needs is
    // checked against the device's real voice list before a single word is
    // spoken. Reading Hindi with an English voice is a wrong pronunciation, so
    // it is blocked unless the user has explicitly allowed a fallback.
    const check = validateSegments(segments, voices, { allowFallback })
    if (!check.ok) {
      setStatus('idle')
      setMissingVoice(check.missing[0])
      setUsingFallbackVoice(false)
      return
    }

    setTotalChunks(segments.length)
    setChunkIndex(0)
    setMessage(null)
    setMissingVoice(null)
    setUsingFallbackVoice(check.substituted.length > 0)
    setActiveWord(null)

    const callbacks: SpeakCallbacks = {
      onChunkStart: (index, chunkTextValue) => {
        setChunkIndex(index)
        setCurrentChunkText(chunkTextValue)
      },
      // The engine reports where it is in the text as it speaks. This is a real
      // signal, not a timer, so the visuals move in time with the voice.
      onBoundary: (charIndex, charLength) => {
        setActiveWord({ start: charIndex, length: charLength })
        setSpeechTick((tick) => tick + 1)
      },
      onComplete: () => setStatus('completed'),
      onError: (errorMessage) => {
        setStatus('idle')
        setMessage(errorMessage)
      },
    }

    const started = service.speak(
      { text, voice: selectedVoice, rate, pitch, chunkMaxChars: CHUNK_MAX_CHARS, segments },
      callbacks,
    )

    setStatus(started ? 'reading' : 'idle')
  }

  const pause = () => {
    if (service.pause()) setStatus('paused')
  }

  const resume = () => {
    if (service.resume()) setStatus('reading')
  }

  const stop = () => {
    service.stop()
    reset()
  }

  const clear = () => {
    service.stop()
    reset()
    setMessage(null)
    setMissingVoice(null)
    setUsingFallbackVoice(false)
  }

  const openVoiceSettings = () => service.openVoiceSettings()

  return {
    status,
    isReading: status === 'reading',
    isPaused: status === 'paused',
    supported,
    voices,
    voicesLoading,
    hasNoVoices: !voicesLoading && voices.length === 0,
    hasNoPreferredVoice:
      !voicesLoading &&
      voices.length > 0 &&
      !voices.some((voice) => isPreferredLanguage(voice.lang)),
    activeVoiceURI,
    selectedVoice,
    message,
    missingVoice,
    usingFallbackVoice,
    openVoiceSettings,
    dismissMissingVoice: () => setMissingVoice(null),
    chunkIndex,
    totalChunks,
    currentChunkText,
    activeWord,
    speechTick,
    progress,
    play,
    pause,
    resume,
    stop,
    clear,
    dismissMessage: () => setMessage(null),
  }
}
