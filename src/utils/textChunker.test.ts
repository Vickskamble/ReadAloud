import { describe, expect, it } from 'vitest'

import { chunkText, normalizeForSpeech, splitSentences } from './textChunker'

const MAX = 40

describe('normalizeForSpeech', () => {
  it('strips markdown heading markers so they are not spoken', () => {
    expect(normalizeForSpeech('## Introduction')).toBe('Introduction')
    expect(normalizeForSpeech('###### Deep heading')).toBe('Deep heading')
  })

  it('strips bold, italic, strikethrough and code markers', () => {
    expect(normalizeForSpeech('This is **bold** text')).toBe('This is bold text')
    expect(normalizeForSpeech('This is __bold__ text')).toBe('This is bold text')
    expect(normalizeForSpeech('This is ~~gone~~ text')).toBe('This is gone text')
    expect(normalizeForSpeech('Use `npm run dev` now')).toBe('Use npm run dev now')
  })

  it('keeps single asterisks and underscores that may be real content', () => {
    expect(normalizeForSpeech('2 * 3 = 6')).toBe('2 * 3 = 6')
    expect(normalizeForSpeech('call read_aloud()')).toBe('call read_aloud()')
  })

  it('removes list and blockquote markers', () => {
    expect(normalizeForSpeech('- first item\n- second item')).toBe('first item\nsecond item')
    expect(normalizeForSpeech('1. first\n2. second')).toBe('first\nsecond')
    expect(normalizeForSpeech('> quoted line')).toBe('quoted line')
  })

  it('does not strip a lone dash that is not a bullet', () => {
    expect(normalizeForSpeech('a - b')).toBe('a - b')
  })

  it('removes zero-width characters and normalizes line endings', () => {
    expect(normalizeForSpeech('hi\u200B there')).toBe('hi there')
    expect(normalizeForSpeech('a\r\nb\rc')).toBe('a\nb\nc')
  })

  it('collapses runs of blank lines and horizontal whitespace', () => {
    expect(normalizeForSpeech('a\n\n\n\nb')).toBe('a\n\nb')
    expect(normalizeForSpeech('a     b')).toBe('a b')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeForSpeech('   hello   ')).toBe('hello')
  })
})

describe('splitSentences', () => {
  it('splits on English punctuation', () => {
    expect(splitSentences('Hello. This is a test! Is it working?')).toEqual([
      'Hello.',
      'This is a test!',
      'Is it working?',
    ])
  })

  it('splits on Devanagari danda for Hindi and Marathi text', () => {
    expect(splitSentences('नमस्ते। आप कैसे हैं? ठीक हूँ।')).toEqual([
      'नमस्ते।',
      'आप कैसे हैं?',
      'ठीक हूँ।',
    ])
  })

  it('keeps repeated terminators together', () => {
    expect(splitSentences('Really?! Yes.')).toEqual(['Really?!', 'Yes.'])
  })

  it('does not split on abbreviations', () => {
    expect(splitSentences('Dr. Sharma is here. He is late.')).toEqual([
      'Dr. Sharma is here.',
      'He is late.',
    ])
    expect(splitSentences('I saw it, e.g. yesterday. Then I left.')).toEqual([
      'I saw it, e.g. yesterday.',
      'Then I left.',
    ])
  })

  it('does not split on initials', () => {
    expect(splitSentences('J. R. R. Tolkien wrote it. Truly.')).toEqual([
      'J. R. R. Tolkien wrote it.',
      'Truly.',
    ])
  })

  it('does not split inside decimals, domains or version numbers', () => {
    expect(splitSentences('Pi is 3.14 exactly.')).toEqual(['Pi is 3.14 exactly.'])
    expect(splitSentences('Visit example.com today.')).toEqual(['Visit example.com today.'])
  })

  it('returns the trailing fragment when there is no terminator', () => {
    expect(splitSentences('no terminator here')).toEqual(['no terminator here'])
  })

  it('returns an empty array for empty input', () => {
    expect(splitSentences('   ')).toEqual([])
  })
})

describe('chunkText', () => {
  it('returns an empty array for empty or whitespace-only text', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   \n\n  ')).toEqual([])
  })

  it('keeps short text as a single chunk', () => {
    expect(chunkText('Hello world.')).toEqual(['Hello world.'])
  })

  it('packs multiple short sentences into one chunk', () => {
    const text = 'One. Two. Three. Four.'
    expect(chunkText(text, { maxChars: MAX })).toEqual(['One. Two. Three. Four.'])
  })

  it('splits into multiple chunks when the limit is exceeded', () => {
    const text = 'One. Two. Three. Four. Five. Six.'
    const chunks = chunkText(text, { maxChars: 20 })
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join(' ')).toBe(text)
  })

  it('never exceeds maxChars except for a single oversized word', () => {
    const text = Array.from({ length: 200 }, (_, i) => `Sentence number ${i} here.`).join(' ')
    for (const chunk of chunkText(text, { maxChars: MAX })) {
      expect(chunk.length).toBeLessThanOrEqual(MAX)
    }
  })

  it('splits a very long single sentence at word boundaries', () => {
    const text = `${'alpha beta '.repeat(20)}end.`
    const chunks = chunkText(text, { maxChars: MAX })
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(MAX)
    }
    expect(chunks.join(' ')).toBe(text)
  })

  it('never loses text from an oversized single word', () => {
    const word = 'x'.repeat(100)
    const chunks = chunkText(word, { maxChars: MAX })
    expect(chunks.join('')).toBe(word)
  })

  it('preserves paragraph order and joins wrapped lines', () => {
    const text = 'First para line one\nline two.\n\nSecond para here.'
    expect(chunkText(text, { maxChars: 200 })).toEqual([
      'First para line one line two.',
      'Second para here.',
    ])
  })

  it('round-trips the meaningful content of long mixed text', () => {
    const text = [
      '## Notes',
      '',
      'Hello bhai, kya haal hai? Aaj office jaana hai.',
      '',
      'Visit https://example.com or mail test@example.com.',
      '',
      'आज का दिन बहुत अच्छा है। सब ठीक है।',
    ].join('\n')

    const joined = chunkText(text, { maxChars: MAX }).join(' ')
    expect(joined).toContain('Hello bhai, kya haal hai?')
    expect(joined).toContain('https://example.com')
    expect(joined).toContain('test@example.com')
    expect(joined).toContain('सब ठीक है।')
    expect(joined).not.toContain('##')
  })

  it('handles special characters, numbers and currency without crashing', () => {
    const text = 'Cost is $5 & 10% off (#1). Use {braces} [and] (parens) *stars*.'
    const chunks = chunkText(text, { maxChars: MAX })
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.join(' ')).toBe(text.replace(/\*\*|__|~~|`/g, ''))
  })

  it('handles emoji and non-Latin scripts', () => {
    const text = 'Hello 👋 — नमस्ते दुनिया — こんにちは'
    expect(chunkText(text, { maxChars: MAX }).join(' ')).toContain('👋')
  })

  it('treats a maxChars below 1 as 1 instead of looping forever', () => {
    const chunks = chunkText('a b c d', { maxChars: 0 })
    expect(chunks.join(' ')).toBe('a b c d')
  })

  it('handles a very large input quickly', () => {
    const text = 'This is a sentence about the weather today. '.repeat(5000)
    const started = performance.now()
    const chunks = chunkText(text, { maxChars: MAX })
    const elapsed = performance.now() - started

    expect(chunks.length).toBeGreaterThan(1000)
    expect(elapsed).toBeLessThan(2000)
  })
})
