import { useEffect, useRef } from 'react'

interface VoiceWaveProps {
  /** True while the engine is speaking. */
  active: boolean
  /** True while paused: the wave holds still instead of moving. */
  paused: boolean
  /** Increments on every real word boundary reported by the engine. */
  tick: number
}

const BAR_COUNT = 32

/** Older browsers and test environments have no matchMedia at all. */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * A sound wave that moves in time with the voice.
 *
 * The Web Speech API exposes no audio stream, so the true amplitude cannot be
 * read. Instead the engine's own `boundary` events - which fire once per spoken
 * word - feed the animation, so the wave genuinely pulses with the speech
 * instead of running off an unrelated timer.
 *
 * Frames are written straight to the DOM node, so a 60fps animation costs no
 * React re-renders.
 */
export function VoiceWave({ active, paused, tick }: VoiceWaveProps) {
  const groupRef = useRef<SVGGElement | null>(null)
  const energyRef = useRef(0)
  const lastTickRef = useRef(tick)

  useEffect(() => {
    if (tick === lastTickRef.current) return
    lastTickRef.current = tick
    // Each spoken word kicks the wave, then it decays on its own.
    energyRef.current = 1
  }, [tick])

  useEffect(() => {
    const group = groupRef.current
    if (!group) return

    const bars = Array.from(group.querySelectorAll<SVGRectElement>('rect'))

    if (!active) {
      // Settle flat when idle, and keep it flat if motion is not welcome.
      for (const bar of bars) bar.setAttribute('height', '2')
      return
    }

    if (paused) return

    let frame = 0
    if (prefersReducedMotion()) {
      for (const bar of bars) bar.setAttribute('height', '6')
      return
    }

    const step = () => {
      // Energy falls off between words, so gaps in speech look quiet.
      energyRef.current *= 0.9

      for (let i = 0; i < bars.length; i += 1) {
        const bar = bars[i]
        // A travelling shape plus a per-bar offset reads as a wave.
        const wave = Math.sin((i / bars.length) * Math.PI * 2 + frame / 9) * 0.5 + 0.5
        const height = 3 + energyRef.current * (10 + wave * 30)
        bar.setAttribute('height', height.toFixed(1))
        bar.setAttribute('y', (-height / 2).toFixed(1))
      }

      frame += 1
      animationFrame = requestAnimationFrame(step)
    }

    let animationFrame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(animationFrame)
  }, [active, paused])

  return (
    <div className={`voice-wave${active ? ' voice-wave--active' : ''}${paused ? ' voice-wave--paused' : ''}`}>
      <svg
        className="voice-wave__svg"
        viewBox={`0 0 ${BAR_COUNT * 6} 48`}
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <g ref={groupRef}>
          {Array.from({ length: BAR_COUNT }, (_, index) => (
            <rect
              key={index}
              x={index * 6 + 1}
              y={23}
              width={4}
              height={2}
              rx={2}
              style={{ transition: 'none' }}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}
