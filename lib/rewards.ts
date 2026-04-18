import { DateTime } from 'luxon'
import {
  CoinTransaction,
  RewardDefinition,
  RewardLimitWindow,
  RewardRedemptionRule,
  RewardTier,
  WeekDay,
} from '@/lib/types'
import { d2t, getNow, t2d } from '@/lib/utils'

export type RewardWindowBounds = {
  startsAt?: string
  endsAt?: string
}

export type RewardUsageSummary = {
  used: number
  remaining: number | null
  isExhausted: boolean
  window: RewardLimitWindow
  maxRedemptions?: number
  startsAt?: string
  endsAt?: string
}

export function sortRewardTiers(tiers: RewardTier[]): RewardTier[] {
  return [...tiers].sort((a, b) => {
    if (a.position !== b.position) {
      return a.position - b.position
    }

    if (a.coinCost !== b.coinCost) {
      return a.coinCost - b.coinCost
    }

    return a.name.localeCompare(b.name)
  })
}

export function getCheapestRewardTier(reward: RewardDefinition): RewardTier | undefined {
  return sortRewardTiers(reward.tiers)[0]
}

export function getRewardWindowBounds({
  rule,
  timezone,
  weekStartDay,
  now = getNow({ timezone }),
}: {
  rule: RewardRedemptionRule
  timezone: string
  weekStartDay: WeekDay
  now?: DateTime
}): RewardWindowBounds {
  const current = now.setZone(timezone)

  switch (rule.window) {
    case 'unlimited':
      return {}
    case 'daily': {
      const start = current.startOf('day')
      return {
        startsAt: d2t({ dateTime: start }),
        endsAt: d2t({ dateTime: start.plus({ days: 1 }) }),
      }
    }
    case 'weekly': {
      const offset = (current.weekday % 7 - weekStartDay + 7) % 7
      const start = current.startOf('day').minus({ days: offset })
      return {
        startsAt: d2t({ dateTime: start }),
        endsAt: d2t({ dateTime: start.plus({ days: 7 }) }),
      }
    }
    case 'monthly': {
      const start = current.startOf('month')
      return {
        startsAt: d2t({ dateTime: start }),
        endsAt: d2t({ dateTime: start.plus({ months: 1 }) }),
      }
    }
  }
}

export function getRewardUsageSummary({
  reward,
  transactions,
  timezone,
  weekStartDay,
  now = getNow({ timezone }),
}: {
  reward: RewardDefinition
  transactions: CoinTransaction[]
  timezone: string
  weekStartDay: WeekDay
  now?: DateTime
}): RewardUsageSummary {
  const maxRedemptions =
    reward.redemptionRule.window === 'unlimited' ? undefined : reward.redemptionRule.maxRedemptions ?? 1

  if (reward.redemptionRule.window === 'unlimited') {
    return {
      used: transactions.filter((transaction) =>
        transaction.type === 'WISH_REDEMPTION' && transaction.relatedItemId === reward.id
      ).length,
      remaining: null,
      isExhausted: false,
      window: reward.redemptionRule.window,
    }
  }

  const bounds = getRewardWindowBounds({
    rule: reward.redemptionRule,
    timezone,
    weekStartDay,
    now,
  })

  const used = transactions.filter((transaction) => {
    if (transaction.type !== 'WISH_REDEMPTION' || transaction.relatedItemId !== reward.id) {
      return false
    }

    const timestamp = t2d({ timestamp: transaction.timestamp, timezone: 'utc' })
    return timestamp >= DateTime.fromISO(bounds.startsAt!) && timestamp < DateTime.fromISO(bounds.endsAt!)
  }).length

  const effectiveMaxRedemptions = maxRedemptions ?? 1
  const remaining = Math.max(0, effectiveMaxRedemptions - used)

  return {
    used,
    remaining,
    isExhausted: remaining === 0,
    window: reward.redemptionRule.window,
    maxRedemptions: effectiveMaxRedemptions,
    startsAt: bounds.startsAt,
    endsAt: bounds.endsAt,
  }
}

export function canAffordAnyRewardTier(reward: RewardDefinition, balance: number): boolean {
  return reward.tiers.some((tier) => tier.coinCost <= balance)
}

export function getAffordableRewardTiers(reward: RewardDefinition, balance: number): RewardTier[] {
  return sortRewardTiers(reward.tiers).filter((tier) => tier.coinCost <= balance)
}
