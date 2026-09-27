import { Capacitor } from '@capacitor/core'
import { NativeSpeechService } from './nativeTts'
import { SpeechService } from './speechService'
import type { SpeechEngine } from './speechEngine'

/**
 * Picks the speech engine for the current platform.
 *
 * In the Android app the native engine is used, because the WebView's speech
 * implementation drops its voice list and cannot pause. In a browser there is
 * no native engine to talk to, so the Web Speech engine is used instead.
 */
export function createSpeechEngine(): SpeechEngine {
  if (Capacitor.isNativePlatform()) {
    return new NativeSpeechService()
  }
  return new SpeechService()
}
