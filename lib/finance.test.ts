import { describe, expect, test } from 'bun:test'
import { DateTime } from 'luxon'
import {
  calculateBreakTaxPenalty,
  calculateProjectedMaturityAmount,
  clampInvestmentTermWeeks,
  getClosedWeekStartBoundaries,
  getWeeklyInterestRateBps,
} from '@/lib/finance'

describe('finance helpers', () => {
  test('clamps investment terms into supported window', () => {
    expect(clampInvestmentTermWeeks(0)).toBe(1)
    expect(clampInvestmentTermWeeks(8.9)).toBe(8)
    expect(clampInvestmentTermWeeks(999)).toBe(52)
  })

  test('longer terms earn higher weekly rates', () => {
    expect(getWeeklyInterestRateBps(1)).toBeLessThan(getWeeklyInterestRateBps(12))
    expect(getWeeklyInterestRateBps(12)).toBeLessThanOrEqual(getWeeklyInterestRateBps(24))
  })

  test('projects maturity with weekly compounding', () => {
    expect(calculateProjectedMaturityAmount(100, 4, 100)).toBe(104.06)
    expect(calculateProjectedMaturityAmount(250, 12, 180)).toBeGreaterThan(250)
  })

  test('builds weekly tax boundaries from configured week start', () => {
    const boundaries = getClosedWeekStartBoundaries({
      timezone: 'America/Toronto',
      weekStartDay: 1,
      startAt: '2026-04-14T10:00:00.000Z',
      now: DateTime.fromISO('2026-04-29T12:00:00.000Z', { zone: 'utc' }),
    })

    expect(boundaries).toEqual([
      '2026-04-20T04:00:00.000Z',
    ])
  })

  test('calculates break tax penalty for missed weeks', () => {
    const penalty = calculateBreakTaxPenalty({
      principal: 100,
      startedAt: '2026-04-14T10:00:00.000Z',
      timezone: 'America/Toronto',
      weekStartDay: 1,
      now: DateTime.fromISO('2026-04-29T12:00:00.000Z', { zone: 'utc' }),
    })

    expect(penalty).toBe(30)
  })

  test('returns zero penalty when no weeks have closed', () => {
    const penalty = calculateBreakTaxPenalty({
      principal: 100,
      startedAt: '2026-04-16T10:00:00.000Z',
      timezone: 'America/Toronto',
      weekStartDay: 1,
      now: DateTime.fromISO('2026-04-18T12:00:00.000Z', { zone: 'utc' }),
    })

    expect(penalty).toBe(0)
  })
})
