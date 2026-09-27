import { describe, expect, it } from 'vitest'

import { getTextValidationError } from './validation'
import { MAX_TEXT_LENGTH } from './constants'

describe('getTextValidationError', () => {
  it('asks for text when the input is empty', () => {
    expect(getTextValidationError('', MAX_TEXT_LENGTH)).toBe('Please enter some text first.')
  })

  it('asks for text when the input is only whitespace', () => {
    expect(getTextValidationError('   \n\t ', MAX_TEXT_LENGTH)).toBe(
      'Please enter some text first.',
    )
  })

  it('accepts normal text', () => {
    expect(getTextValidationError('Hello world', MAX_TEXT_LENGTH)).toBeNull()
  })

  it('accepts text exactly at the limit', () => {
    expect(getTextValidationError('a'.repeat(MAX_TEXT_LENGTH), MAX_TEXT_LENGTH)).toBeNull()
  })

  it('reports an explicit message instead of truncating oversized text', () => {
    const message = getTextValidationError('a'.repeat(MAX_TEXT_LENGTH + 1), MAX_TEXT_LENGTH)
    expect(message).toBe(
      'This text is too long to read. Please shorten it or split it into smaller parts.',
    )
  })
})
