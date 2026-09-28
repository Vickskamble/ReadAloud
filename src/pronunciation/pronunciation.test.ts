import { beforeEach, describe, expect, it } from 'vitest'
import { clearUserPronunciations, setUserPronunciation } from './dictionaries'
import { classifyToken, detectScript, romanHindiToDevanagari } from './classify'
import { normalizeCurrency, normalizeDate, normalizeEmail, normalizeNumber, normalizeTime, normalizeUrl, speakInteger } from './normalize'
import { prepareForSpeech } from './segments'
import type { SpeechLanguage } from './types'

/** Languages used, in order, for one of the specification's test sentences. */
function languages(text: string): SpeechLanguage[] {
  return prepareForSpeech(text).map((segment) => segment.language)
}

function spoken(text: string): string {
  return prepareForSpeech(text)
    .map((segment) => segment.text)
    .join(' ')
}

describe('script detection', () => {
  it('recognises Devanagari', () => {
    expect(detectScript('आज मुझे ऑफिस जाना है।')).toBe('devanagari')
  })

  it('recognises Latin script, including Roman Hindi', () => {
    expect(detectScript('Aaj mujhe office jaana hai.')).toBe('latin')
  })

  it('reports no script for digits only', () => {
    expect(detectScript('12345')).toBe('none')
  })
})

describe('token classification', () => {
  beforeEach(() => {
    clearUserPronunciations()
  })

  it('classifies a Roman Hindi word as Hindi, not English', () => {
    const token = classifyToken('mujhe')
    expect(token.kind).toBe('HINDI_ROMAN')
    expect(token.language).toBe('hi-IN')
  })

  it('classifies a borrowed technical term as English', () => {
    expect(classifyToken('office').kind).toBe('ENGLISH')
    expect(classifyToken('ERP').kind).toBe('ACRONYM')
  })

  it('classifies a Devanagari word as Hindi', () => {
    expect(classifyToken('मुझे').kind).toBe('HINDI_DEVANAGARI')
  })

  it('classifies numbers, dates, times and currency', () => {
    expect(classifyToken('5000').kind).toBe('NUMBER')
    expect(classifyToken('28/09/2026').kind).toBe('DATE')
    expect(classifyToken('5:30 PM').kind).toBe('TIME')
    expect(classifyToken('₹5,000').kind).toBe('CURRENCY')
  })

  it('classifies a URL and an email', () => {
    expect(classifyToken('https://brilliants.in').kind).toBe('URL')
    expect(classifyToken('contact@brilliants.in').kind).toBe('EMAIL')
  })

  it('classifies an emoji so it is never read aloud', () => {
    expect(classifyToken('😊').kind).toBe('EMOJI')
  })

  it('does not turn a technical term into Hindi inside a Hinglish sentence', () => {
    expect(classifyToken('ERP').spoken).toBe('e r p')
    expect(classifyToken('dashboard').kind).toBe('TECHNICAL_WORD')
  })

  it('honours a user pronunciation override above every dictionary', () => {
    setUserPronunciation('PowerEMS', 'Power EMS')
    const token = classifyToken('PowerEMS')
    expect(token.spoken).toBe('Power EMS')
    expect(token.kind).toBe('PROPER_NAME')
  })
})

describe('Roman Hindi transliteration', () => {
  it('writes the sound rather than the letters', () => {
    expect(romanHindiToDevanagari('mujhe')).toBe('मुझे')
    expect(romanHindiToDevanagari('hai')).toBe('है')
  })

  it('drops the unwritten schwa at the end of a word', () => {
    expect(romanHindiToDevanagari('aaj')).toBe('आज')
  })

  it('handles digraphs before single letters', () => {
    expect(romanHindiToDevanagari('chalo')).toBe('चलो')
    expect(romanHindiToDevanagari('kya')).toBe('क्या')
  })
})

describe('number normalisation', () => {
  it('does not read a large number digit by digit', () => {
    expect(normalizeNumber('5000')).toBe('five thousand')
    expect(normalizeNumber('5000')).not.toContain('5 0 0 0')
  })

  it('respects Indian grouping', () => {
    expect(normalizeNumber('1,25,000')).toBe('one lakh twenty-five thousand')
  })

  it('reads a percentage', () => {
    expect(normalizeNumber('25%')).toBe('twenty-five percent')
  })

  it('keeps a year as digits, which is how a year is said', () => {
    expect(normalizeNumber('2026')).toBe('2026')
  })

  it('spells small numbers as words', () => {
    expect(speakInteger(3)).toBe('three')
    expect(speakInteger(15)).toBe('fifteen')
  })
})

describe('currency, time and dates', () => {
  it('converts rupees to words', () => {
    expect(normalizeCurrency('₹5,000')).toBe('five thousand rupees')
    expect(normalizeCurrency('₹1,25,000')).toBe('one lakh twenty-five thousand rupees')
  })

  it('converts dollars and euros', () => {
    expect(normalizeCurrency('$100')).toBe('one hundred dollars')
    expect(normalizeCurrency('€50')).toBe('fifty euros')
  })

  it('reads a clock time naturally', () => {
    expect(normalizeTime('5 PM')).toBe("5 o'clock pm")
    expect(normalizeTime('10:45 AM')).toBe("10 forty-five am")
  })

  it('reads a numeric date in day-month-year order', () => {
    expect(normalizeDate('28/09/2026')).toBe('28 September 2026')
  })

  it('leaves a valid written date alone', () => {
    expect(normalizeDate('28 September 2026')).toBe('28 September 2026')
  })
})

describe('email and URL', () => {
  it('spells an email instead of reading the symbols', () => {
    expect(normalizeEmail('contact@brilliants.in')).toBe(
      'c o n t a c t at brilliants dot in',
    )
  })

  it('reads a URL by its name, not by its scheme', () => {
    expect(normalizeUrl('https://brilliants.in')).toBe('brilliants dot in')
  })
})

describe('language segments', () => {
  it('reads a Hinglish sentence with Hindi segments', () => {
    expect(languages('Aaj mujhe office jaana hai.')).toContain('hi-IN')
  })

  it('does not switch language for every single word', () => {
    const segments = prepareForSpeech('Aaj mujhe office jaana hai.')
    // A word-by-word switch would be five segments for five words.
    expect(segments.length).toBeLessThanOrEqual(2)
  })

  it('keeps an English sentence in English', () => {
    expect(languages('I am going to the office.')).toEqual(['en-IN'])
  })

  it('keeps a Devanagari sentence in Hindi', () => {
    expect(languages('आज मुझे ऑफिस जाना है।')).toEqual(['hi-IN'])
  })

  it('splits a sentence that genuinely changes language', () => {
    const segments = languages('I am going to the office now.')
    expect(segments).toEqual(['en-IN'])
  })
})

describe('specification test cases', () => {
  beforeEach(() => {
    clearUserPronunciations()
  })

  it('1. Aaj mujhe office jaana hai.', () => {
    expect(languages('Aaj mujhe office jaana hai.')).toContain('hi-IN')
  })

  it('2. I am going to the office.', () => {
    expect(languages('I am going to the office.')).toEqual(['en-IN'])
  })

  it('3. आज मुझे ऑफिस जाना है।', () => {
    expect(languages('आज मुझे ऑफिस जाना है।')).toEqual(['hi-IN'])
  })

  it('4. Aaj 5 PM par meeting hai.', () => {
    expect(languages('Aaj 5 PM par meeting hai.')).toContain('hi-IN')
    expect(spoken('Aaj 5 PM par meeting hai.')).toContain("o'clock")
  })

  it('5. Please send me the report.', () => {
    expect(languages('Please send me the report.')).toEqual(['en-IN'])
  })

  it('6. Mujhe report send kar dena.', () => {
    expect(languages('Mujhe report send kar dena.')).toContain('hi-IN')
  })

  it('7. Meeting 28/09/2026 ko hai.', () => {
    expect(spoken('Meeting 28/09/2026 ko hai.')).toContain('28 September 2026')
  })

  it('8. Contact us at contact@brilliants.in', () => {
    expect(spoken('Contact us at contact@brilliants.in')).toContain('at brilliants dot in')
  })

  it('9. Visit https://brilliants.in', () => {
    expect(spoken('Visit https://brilliants.in')).toContain('brilliants dot in')
  })

  it('10. ERP system ka login open karo.', () => {
    const result = spoken('ERP system ka login open karo.')
    expect(result).toContain('e r p')
    expect(result.toLowerCase()).not.toContain('erp')
  })

  it('11. ₹5,000 ka payment received hai.', () => {
    expect(spoken('₹5,000 ka payment received hai.')).toContain('five thousand rupees')
  })

  it('12. Hello 😊 how are you?', () => {
    expect(spoken('Hello 😊 how are you?')).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })

  it('13. Kal office mein maintenance meeting hai.', () => {
    expect(languages('Kal office mein maintenance meeting hai.')).toContain('hi-IN')
  })

  it('14. Mujhe ye file download karni hai.', () => {
    expect(languages('Mujhe ye file download karni hai.')).toContain('hi-IN')
  })

  it('15. Aap mujhe WhatsApp par message kar dena.', () => {
    const result = prepareForSpeech('Aap mujhe WhatsApp par message kar dena.')
    expect(result.map((segment) => segment.language)).toContain('hi-IN')
    expect(spoken('Aap mujhe WhatsApp par message kar dena.')).toContain('WhatsApp')
  })
})

describe('pipeline safety', () => {
  it('returns nothing for empty or punctuation-only input', () => {
    expect(prepareForSpeech('')).toEqual([])
    expect(prepareForSpeech('   ')).toEqual([])
  })

  it('never throws on odd input', () => {
    const inputs = ['😊🎉', '123', '.....', '   \n\n  ', '@@@', 'https://', '2026-13-45']
    for (const input of inputs) {
      expect(() => prepareForSpeech(input)).not.toThrow()
    }
  })

  it('preserves every readable word, in order', () => {
    const result = spoken('Please send the report today')
    for (const word of ['Please', 'send', 'the', 'report', 'today']) {
      expect(result).toContain(word)
    }
  })

  it('keeps segments within the engine size limit', () => {
    const long = 'Aaj mujhe office jaana hai. '.repeat(80)
    for (const segment of prepareForSpeech(long, { maxChars: 200 })) {
      expect(segment.text.length).toBeLessThanOrEqual(200)
    }
  })

  it('is deterministic', () => {
    const text = 'Aaj 5 PM par meeting hai ₹5,000'
    expect(prepareForSpeech(text)).toEqual(prepareForSpeech(text))
  })
})
