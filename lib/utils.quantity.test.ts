import { describe, expect, test } from 'bun:test'
import { DateTime } from 'luxon'
import { Habit } from '@/lib/types'
import {
  calculateQuantityHabitCoins,
  getCompletionCountForDate,
  getCompletionRecordsForDate,
  getTotalQuantityForDate,
  normalizeHabitCompletion,
} from '@/lib/utils'

const quantityHabit: Habit = {
  id: 'habit-1',
  name: 'Bike Ride',
  description: '',
  frequency: 'RRULE:FREQ=DAILY',
  coinReward: 3,
  trackingMode: 'quantity',
  quantityUnit: 'km',
  baseRate: 3,
  baseUnit: 1,
  bonusThreshold: 10,
  scaleFactor: 1.5,
  completions: [
    {
      id: 'completion-1',
      completedAt: '2026-04-18T12:00:00.000Z',
      quantity: 10,
      coinsAwarded: 30,
    },
    {
      id: 'completion-2',
      completedAt: '2026-04-18T18:00:00.000Z',
      quantity: 20,
      coinsAwarded: 90,
    },
  ],
}

describe('quantity habit utilities', () => {
  test('calculates threshold payout without bonus', () => {
    expect(calculateQuantityHabitCoins(quantityHabit, 10)).toBe(30)
  })

  test('calculates above-threshold payout with multiplier', () => {
    expect(calculateQuantityHabitCoins(quantityHabit, 20)).toBe(90)
  })

  test('preserves decimal precision in quantity payouts', () => {
    const walkingHabit: Habit = {
      ...quantityHabit,
      id: 'habit-2',
      name: 'Walk',
      baseRate: 1,
      baseUnit: 2,
      bonusThreshold: 4,
      scaleFactor: 1.5,
    }

    expect(calculateQuantityHabitCoins(walkingHabit, 3)).toBe(1.5)
  })

  test('returns completion records and totals for a given date', () => {
    const date = DateTime.fromISO('2026-04-18T09:00:00.000-04:00')

    expect(getCompletionCountForDate({
      habit: quantityHabit,
      date,
      timezone: 'America/Toronto',
    })).toBe(2)

    expect(getCompletionRecordsForDate({
      habit: quantityHabit,
      date,
      timezone: 'America/Toronto',
    }).map((completion) => completion.id)).toEqual(['completion-1', 'completion-2'])

    expect(getTotalQuantityForDate({
      habit: quantityHabit,
      date,
      timezone: 'America/Toronto',
    })).toBe(30)
  })

  test('normalizes legacy completion strings', () => {
    expect(normalizeHabitCompletion('2026-04-18T12:00:00.000Z', 0)).toEqual({
      id: 'legacy-2026-04-18T12:00:00.000Z-0',
      completedAt: '2026-04-18T12:00:00.000Z',
    })
  })
})
