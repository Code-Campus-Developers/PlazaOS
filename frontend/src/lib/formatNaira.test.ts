import { describe, expect, it } from 'vitest'
import { formatNaira } from './formatNaira'

describe('formatNaira', () => {
  it('formats a whole amount with the naira symbol and thousands grouping', () => {
    expect(formatNaira(1200)).toBe('₦1,200.00')
    expect(formatNaira(48250)).toBe('₦48,250.00')
  })

  it('keeps two decimal places for amounts with kobo', () => {
    expect(formatNaira(1200.5)).toBe('₦1,200.50')
    expect(formatNaira(0.05)).toBe('₦0.05')
  })

  it('formats zero without losing the currency', () => {
    expect(formatNaira(0)).toBe('₦0.00')
  })

  it('never emits a dollar sign', () => {
    expect(formatNaira(1200)).not.toContain('$')
  })

  it('groups millions correctly', () => {
    expect(formatNaira(1_250_000)).toBe('₦1,250,000.00')
  })
})
