import { DateTime } from 'luxon'
import { AccountStatus, FinanceAccount, WeekDay } from '@/lib/types'

export const MIN_INVESTMENT_TERM_WEEKS = 1
export const MAX_INVESTMENT_TERM_WEEKS = 52

export function clampInvestmentTermWeeks(termWeeks: number) {
  return Math.max(MIN_INVESTMENT_TERM_WEEKS, Math.min(MAX_INVESTMENT_TERM_WEEKS, Math.floor(termWeeks)))
}

export function getWeeklyInterestRateBps(termWeeks: number) {
  const clamped = clampInvestmentTermWeeks(termWeeks)

  if (clamped >= 24) return 240
  if (clamped >= 12) return 180
  if (clamped >= 8) return 140
  if (clamped >= 4) return 100
  return 60
}

export function formatRatePercent(bps: number) {
  return (bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)
}

export function startOfWeek(dateTime: DateTime, weekStartDay: WeekDay) {
  const currentDay = dateTime.weekday % 7
  const offset = (currentDay - weekStartDay + 7) % 7
  return dateTime.startOf('day').minus({ days: offset })
}

export function getCurrentWeekStart(timezone: string, weekStartDay: WeekDay, now = DateTime.now()) {
  return startOfWeek(now.setZone(timezone), weekStartDay)
}

export function getClosedWeekStartBoundaries({
  timezone,
  weekStartDay,
  startAt,
  now = DateTime.now(),
}: {
  timezone: string
  weekStartDay: WeekDay
  startAt: string
  now?: DateTime
}) {
  const rangeStart = DateTime.fromISO(startAt, { zone: timezone })
  if (!rangeStart.isValid) {
    return []
  }

  const firstBoundary = startOfWeek(rangeStart, weekStartDay).plus({ weeks: 1 })
  const currentWeekStart = getCurrentWeekStart(timezone, weekStartDay, now)
  const boundaries: string[] = []

  for (let cursor = firstBoundary; cursor < currentWeekStart; cursor = cursor.plus({ weeks: 1 })) {
    boundaries.push(cursor.toUTC().toISO()!)
  }

  return boundaries
}

export function getInterestCheckpointDates(startedAt: string, termWeeks: number) {
  const start = DateTime.fromISO(startedAt, { zone: 'utc' })
  if (!start.isValid) {
    return []
  }

  return Array.from({ length: clampInvestmentTermWeeks(termWeeks) }, (_, index) => (
    start.plus({ weeks: index + 1 }).toUTC().toISO()!
  ))
}

export function isInvestmentOpen(status: AccountStatus) {
  return status === 'ACTIVE' || status === 'MATURED'
}

export const WEEKLY_TAX_RATE = 0.3

export function calculateBreakTaxPenalty({
  principal,
  startedAt,
  timezone,
  weekStartDay,
  now = DateTime.now(),
}: {
  principal: number
  startedAt: string
  timezone: string
  weekStartDay: WeekDay
  now?: DateTime
}) {
  const closedWeeks = getClosedWeekStartBoundaries({
    timezone,
    weekStartDay,
    startAt: startedAt,
    now,
  })

  return Math.round(principal * WEEKLY_TAX_RATE * closedWeeks.length * 100) / 100
}

export function calculateProjectedMaturityAmount(principal: number, termWeeks: number, weeklyInterestRateBps: number) {
  let balance = Math.max(0, principal)
  const checkpoints = clampInvestmentTermWeeks(termWeeks)

  for (let week = 0; week < checkpoints; week += 1) {
    balance += (balance * weeklyInterestRateBps) / 10_000
  }

  return Math.round(balance * 100) / 100
}

export function sortAccountsForDisplay(accounts: FinanceAccount[]) {
  return [...accounts].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'PRIMARY' ? -1 : 1
    }

    if (left.kind === 'INVESTMENT_TERM' && right.kind === 'INVESTMENT_TERM') {
      const leftMaturesAt = left.maturesAt ?? left.createdAt
      const rightMaturesAt = right.maturesAt ?? right.createdAt
      return leftMaturesAt.localeCompare(rightMaturesAt)
    }

    return left.createdAt.localeCompare(right.createdAt)
  })
}
