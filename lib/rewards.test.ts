import { describe, expect, test } from 'bun:test'
import { DateTime } from 'luxon'
import { getRewardUsageSummary, getRewardWindowBounds } from '@/lib/rewards'
import { RewardDefinition } from '@/lib/types'

const baseReward: RewardDefinition = {
  id: 'reward-1',
  name: 'Pizza',
  description: '',
  redemptionRule: {
    window: 'weekly',
    maxRedemptions: 1,
  },
  tiers: [
    {
      id: 'tier-1',
      name: 'Slice',
      coinCost: 10,
      position: 0,
    },
  ],
}

describe('reward utilities', () => {
  test('computes daily reset window in the configured timezone', () => {
    const bounds = getRewardWindowBounds({
      rule: {
        window: 'daily',
        maxRedemptions: 1,
      },
      timezone: 'America/Toronto',
      weekStartDay: 1,
      now: DateTime.fromISO('2026-04-18T16:45:00', { zone: 'America/Toronto' }),
    })

    expect(bounds.startsAt).toBe('2026-04-18T04:00:00.000Z')
    expect(bounds.endsAt).toBe('2026-04-19T04:00:00.000Z')
  })

  test('uses configured week start when calculating weekly windows', () => {
    const bounds = getRewardWindowBounds({
      rule: {
        window: 'weekly',
        maxRedemptions: 1,
      },
      timezone: 'America/Toronto',
      weekStartDay: 1,
      now: DateTime.fromISO('2026-04-18T16:45:00', { zone: 'America/Toronto' }),
    })

    expect(bounds.startsAt).toBe('2026-04-13T04:00:00.000Z')
    expect(bounds.endsAt).toBe('2026-04-20T04:00:00.000Z')
  })

  test('marks a weekly reward exhausted after the limit is reached across tiers', () => {
    const usage = getRewardUsageSummary({
      reward: baseReward,
      transactions: [
        {
          id: 'txn-1',
          amount: -10,
          type: 'WISH_REDEMPTION',
          description: 'Redeemed reward: Pizza - Slice',
          timestamp: '2026-04-15T12:00:00.000Z',
          relatedItemId: 'reward-1',
          relatedSubItemId: 'tier-1',
        },
      ],
      timezone: 'America/Toronto',
      weekStartDay: 1,
      now: DateTime.fromISO('2026-04-18T16:45:00', { zone: 'America/Toronto' }),
    })

    expect(usage.used).toBe(1)
    expect(usage.remaining).toBe(0)
    expect(usage.isExhausted).toBe(true)
  })

  test('never exhausts unlimited rewards', () => {
    const usage = getRewardUsageSummary({
      reward: {
        ...baseReward,
        redemptionRule: {
          window: 'unlimited',
        },
      },
      transactions: [
        {
          id: 'txn-1',
          amount: -10,
          type: 'WISH_REDEMPTION',
          description: 'Redeemed reward: Pizza - Slice',
          timestamp: '2026-04-15T12:00:00.000Z',
          relatedItemId: 'reward-1',
          relatedSubItemId: 'tier-1',
        },
      ],
      timezone: 'America/Toronto',
      weekStartDay: 1,
    })

    expect(usage.remaining).toBeNull()
    expect(usage.isExhausted).toBe(false)
  })
})
