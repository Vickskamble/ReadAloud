import { describe, expect, it } from 'vitest'

import { countWords, formatNumber, getTextStats } from './textStats'

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('one two three')).toBe(3)
  })

  it('handles newlines and tabs as separators', () => {
    expect(countWords('one\ntwo\tthree')).toBe(3)
  })

  it('returns 0 for empty or whitespace-only text', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   \n ')).toBe(0)
  })

  it('ignores extra internal whitespace', () => {
    expect(countWords('  one   two  ')).toBe(2)
  })
})

describe('getTextStats', () => {
  it('reports characters and words together', () => {
    expect(getTextStats('Hello world')).toEqual({ characters: 11, words: 2 })
  })

  it('reports zeroes for empty text', () => {
    expect(getTextStats('')).toEqual({ characters: 0, words: 0 })
  })
})

describe('formatNumber', () => {
  it('adds thousands separators', () => {
    expect(formatNumber(1250)).toBe('1,250')
    expect(formatNumber(999)).toBe('999')
  })
})
