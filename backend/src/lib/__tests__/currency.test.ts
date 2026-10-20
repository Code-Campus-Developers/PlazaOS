import { describe, it, expect } from 'vitest'
import {
  CURRENCY,
  CURRENCY_SYMBOL,
  formatAmount,
  fromMinorUnits,
  minorUnits,
  toMinorUnits,
} from '@/lib/currency'

describe('currency', () => {
  it('is naira by default', () => {
    expect(CURRENCY).toBe('NGN')
    expect(CURRENCY_SYMBOL).toBe('₦')
  })

  describe('minorUnits', () => {
    it('returns 100 for naira', () => {
      expect(minorUnits('NGN')).toBe(100)
    })

    it('defaults to the application currency', () => {
      expect(minorUnits()).toBe(100)
    })

    it('throws for a currency with no known minor-unit factor', () => {
      // A misconfigured PAYSTACK_CURRENCY must fail loudly rather than
      // silently charging 100x the intended amount.
      expect(() => minorUnits('JPY')).toThrow('Unsupported currency: JPY')
    })
  })

  describe('toMinorUnits', () => {
    it('converts naira to kobo', () => {
      expect(toMinorUnits(1200)).toBe(120_000)
      expect(toMinorUnits(1200.5)).toBe(120_050)
    })

    it('rounds to the nearest minor unit', () => {
      expect(toMinorUnits(0.005)).toBe(1)
      expect(toMinorUnits(0.004)).toBe(0)
    })

    it('handles zero', () => {
      expect(toMinorUnits(0)).toBe(0)
    })
  })

  describe('fromMinorUnits', () => {
    it('converts kobo back to naira', () => {
      expect(fromMinorUnits(120_000)).toBe(1200)
    })

    it('round-trips with toMinorUnits', () => {
      expect(fromMinorUnits(toMinorUnits(48250.25))).toBe(48250.25)
    })
  })

  describe('formatAmount', () => {
    it('formats naira with the naira symbol and two decimals', () => {
      expect(formatAmount(1200)).toBe('₦1,200.00')
      expect(formatAmount(48250)).toBe('₦48,250.00')
    })

    it('keeps kobo amounts', () => {
      expect(formatAmount(1200.5)).toBe('₦1,200.50')
    })

    it('formats zero without losing the currency', () => {
      expect(formatAmount(0)).toBe('₦0.00')
    })

    it('groups millions correctly', () => {
      expect(formatAmount(1_250_000)).toBe('₦1,250,000.00')
    })

    it('never emits a dollar sign for naira', () => {
      expect(formatAmount(1200)).not.toContain('$')
    })
  })
})
