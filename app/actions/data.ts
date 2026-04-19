'use server'

import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import {
  CoinsData,
  HabitsData,
  RewardDefinition,
  ServerSettings,
  Settings,
  TransactionType,
  WishlistData,
} from '@/lib/types'
import { clampInvestmentTermWeeks, calculateBreakTaxPenalty } from '@/lib/finance'
import {
  BulkEditPayload,
  createBulkEditPayload,
  parseBulkEditJson,
  reconcileBulkEditPayloadWithCurrentCatalog,
} from '@/lib/bulk-edit'
import { d2t, getNow } from '@/lib/utils'
import { ALLOWED_AVATAR_EXTENSIONS, ALLOWED_AVATAR_MIME_TYPES } from '@/lib/avatar'
import { withTransaction } from '@/lib/db/client'
import {
  breakInvestmentAccount,
  createInvestmentAccount,
  getCoins,
  postPrimaryTransaction,
  runDueFinancialEvents,
  withdrawInvestmentAccount,
} from '@/lib/db/repos/coins'
import { getHabits, saveHabits, syncHabitDefinitions } from '@/lib/db/repos/habits'
import { getSettings, saveSettingsRecord } from '@/lib/db/repos/settings'
import { getWishlist, saveWishlist, syncWishlistDefinitions } from '@/lib/db/repos/wishlist'
import { getRewardWindowBounds } from '@/lib/rewards'

export async function triggerManualBackup(): Promise<{ success: boolean; message: string }> {
  return { success: false, message: 'Backups are disabled in the single-user build.' }
}

export async function loadWishlistData(): Promise<WishlistData> {
  return getWishlist()
}

export async function loadWishlistItems(): Promise<RewardDefinition[]> {
  const data = await loadWishlistData()
  return data.rewards
}

export async function saveWishlistItems(data: WishlistData): Promise<void> {
  saveWishlist(data)
}

export async function loadHabitsData(): Promise<HabitsData> {
  return getHabits()
}

export async function saveHabitsData(data: HabitsData): Promise<void> {
  saveHabits(data)
}

export async function exportBulkEditData(): Promise<BulkEditPayload> {
  const [habits, wishlist] = await Promise.all([
    loadHabitsData(),
    loadWishlistData(),
  ])

  return createBulkEditPayload({
    habits: habits.habits,
    rewards: wishlist.rewards,
  })
}

export async function syncBulkEditData(jsonInput: string): Promise<{
  habits: HabitsData
  wishlist: WishlistData
  summary: {
    habitsCreated: number
    habitsUpdated: number
    habitsDeleted: number
    tasksCreated: number
    tasksUpdated: number
    tasksDeleted: number
    rewardsCreated: number
    rewardsUpdated: number
    rewardsDeleted: number
  }
}> {
  const currentHabits = getHabits().habits
  const currentRewards = getWishlist().rewards
  const payload = reconcileBulkEditPayloadWithCurrentCatalog(
    parseBulkEditJson(jsonInput),
    currentHabits
  )

  const incomingHabitIds = new Set(payload.habits.flatMap((habit) => habit.id ? [habit.id] : []))
  const incomingTaskIds = new Set(payload.tasks.flatMap((task) => task.id ? [task.id] : []))
  const incomingRewardIds = new Set(payload.rewards.flatMap((reward) => reward.id ? [reward.id] : []))

  const currentHabitIds = new Set(currentHabits.filter((habit) => !habit.isTask).map((habit) => habit.id))
  const currentTaskIds = new Set(currentHabits.filter((habit) => habit.isTask).map((habit) => habit.id))
  const currentRewardIds = new Set(currentRewards.map((reward) => reward.id))

  const habitDefinitions = [
    ...payload.habits.map((habit) => ({
      ...habit,
      id: habit.id ?? randomUUID(),
      isTask: false,
    })),
    ...payload.tasks.map((task) => ({
      ...task,
      id: task.id ?? randomUUID(),
      isTask: true,
    })),
  ]

  const rewardDefinitions = payload.rewards.map((reward) => ({
    ...reward,
    id: reward.id ?? randomUUID(),
    tiers: reward.tiers.map((tier, index) => ({
      ...tier,
      id: tier.id ?? randomUUID(),
      position: tier.position ?? index,
    })),
  }))

  withTransaction((db) => {
    syncHabitDefinitions(db, habitDefinitions)
    syncWishlistDefinitions(db, rewardDefinitions)
  })

  return {
    habits: getHabits(),
    wishlist: getWishlist(),
    summary: {
      habitsCreated: payload.habits.filter((habit) => !habit.id || !currentHabitIds.has(habit.id)).length,
      habitsUpdated: payload.habits.filter((habit) => !!habit.id && currentHabitIds.has(habit.id)).length,
      habitsDeleted: currentHabits.filter((habit) => !habit.isTask && !incomingHabitIds.has(habit.id)).length,
      tasksCreated: payload.tasks.filter((task) => !task.id || !currentTaskIds.has(task.id)).length,
      tasksUpdated: payload.tasks.filter((task) => !!task.id && currentTaskIds.has(task.id)).length,
      tasksDeleted: currentHabits.filter((habit) => habit.isTask && !incomingTaskIds.has(habit.id)).length,
      rewardsCreated: rewardDefinitions.filter((reward) => !currentRewardIds.has(reward.id)).length,
      rewardsUpdated: rewardDefinitions.filter((reward) => currentRewardIds.has(reward.id)).length,
      rewardsDeleted: currentRewards.filter((reward) => !incomingRewardIds.has(reward.id)).length,
    },
  }
}

export async function loadCoinsData(): Promise<CoinsData> {
  return getCoins()
}

export async function addCoins({
  amount,
  description,
  type = 'MANUAL_ADJUSTMENT',
  relatedItemId,
  relatedSubItemId,
  note,
}: {
  amount: number
  description: string
  type?: TransactionType
  relatedItemId?: string
  relatedSubItemId?: string
  note?: string
}): Promise<CoinsData> {
  return postPrimaryTransaction({
    amount,
    type,
    description: note?.trim() ? `${description} (${note.trim()})` : description,
    relatedItemId,
    relatedSubItemId,
    effectiveAt: d2t({ dateTime: getNow({}) }),
  })
}

export async function loadSettings(): Promise<Settings> {
  return getSettings()
}

export async function saveSettings(settings: Settings): Promise<void> {
  saveSettingsRecord(settings)
}

export async function removeCoins({
  amount,
  description,
  type = 'MANUAL_ADJUSTMENT',
  relatedItemId,
  relatedSubItemId,
  note,
}: {
  amount: number
  description: string
  type?: TransactionType
  relatedItemId?: string
  relatedSubItemId?: string
  note?: string
}): Promise<CoinsData> {
  return postPrimaryTransaction({
    amount: -Math.abs(amount),
    type,
    description: note?.trim() ? `${description} (${note.trim()})` : description,
    relatedItemId,
    relatedSubItemId,
    effectiveAt: d2t({ dateTime: getNow({}) }),
  })
}

export async function redeemRewardTier({
  rewardId,
  tierId,
}: {
  rewardId: string
  tierId: string
}): Promise<
  | {
      success: true
      coins: CoinsData
      wishlist: WishlistData
    }
  | {
      success: false
      reason: 'NOT_FOUND' | 'ARCHIVED' | 'INSUFFICIENT_COINS' | 'LIMIT_REACHED'
      coinsNeeded?: number
    }
> {
  const settings = getSettings()
  runDueFinancialEvents()

  const result = withTransaction((db) => {
    const reward = db.prepare(`
      SELECT id, name, archived, limit_window, max_redemptions
      FROM rewards
      WHERE id = ? AND deleted_at IS NULL
    `).get(rewardId) as {
      id: string
      name: string
      archived: number
      limit_window: RewardDefinition['redemptionRule']['window']
      max_redemptions: number | null
    } | undefined

    if (!reward) {
      return { success: false as const, reason: 'NOT_FOUND' as const }
    }

    if (reward.archived === 1) {
      return { success: false as const, reason: 'ARCHIVED' as const }
    }

    const tier = db.prepare(`
      SELECT id, name, coin_cost
      FROM reward_tiers
      WHERE id = ? AND reward_id = ? AND deleted_at IS NULL
    `).get(tierId, rewardId) as {
      id: string
      name: string
      coin_cost: number
    } | undefined

    if (!tier) {
      return { success: false as const, reason: 'NOT_FOUND' as const }
    }

    const balanceRow = db.prepare(`
      SELECT COALESCE(SUM(ledger_entries.amount), 0) AS balance
      FROM ledger_entries
      INNER JOIN accounts ON accounts.id = ledger_entries.account_id
      WHERE accounts.kind = 'PRIMARY'
    `).get() as { balance: number }

    if (balanceRow.balance < tier.coin_cost) {
      return {
        success: false as const,
        reason: 'INSUFFICIENT_COINS' as const,
        coinsNeeded: tier.coin_cost - balanceRow.balance,
      }
    }

    if (reward.limit_window !== 'unlimited') {
      const bounds = getRewardWindowBounds({
        rule: {
          window: reward.limit_window,
          maxRedemptions: reward.max_redemptions ?? undefined,
        },
        timezone: settings.system.timezone,
        weekStartDay: settings.system.weekStartDay,
      })

      const countRow = db.prepare(`
        SELECT COUNT(*) AS count
        FROM ledger_entries
        INNER JOIN accounts ON accounts.id = ledger_entries.account_id
        WHERE accounts.kind = 'PRIMARY'
          AND ledger_entries.type = 'WISH_REDEMPTION'
          AND ledger_entries.related_item_id = ?
          AND ledger_entries.effective_at >= ?
          AND ledger_entries.effective_at < ?
      `).get(reward.id, bounds.startsAt, bounds.endsAt) as { count: number }

      const maxRedemptions = reward.max_redemptions ?? 1
      if (countRow.count >= maxRedemptions) {
        return { success: false as const, reason: 'LIMIT_REACHED' as const }
      }
    }

    const primaryAccount = db.prepare(`
      SELECT id
      FROM accounts
      WHERE kind = 'PRIMARY'
      LIMIT 1
    `).get() as { id: string } | undefined

    if (!primaryAccount) {
      throw new Error('Primary account not found')
    }

    const timestamp = d2t({ dateTime: getNow({}) })
    db.prepare(`
      INSERT INTO ledger_entries (
        id,
        account_id,
        amount,
        type,
        description,
        posted_at,
        effective_at,
        related_item_id,
        related_sub_item_id,
        metadata_json
      ) VALUES (?, ?, ?, 'WISH_REDEMPTION', ?, ?, ?, ?, ?, NULL)
    `).run(
      randomUUID(),
      primaryAccount.id,
      -Math.abs(tier.coin_cost),
      `Redeemed reward: ${reward.name} - ${tier.name}`,
      timestamp,
      timestamp,
      reward.id,
      tier.id,
    )

    return { success: true as const }
  })

  if (!result.success) {
    return result
  }

  return {
    success: true,
    coins: getCoins(),
    wishlist: getWishlist(),
  }
}

export async function openInvestmentAccount({
  amount,
  termWeeks,
}: {
  amount: number
  termWeeks: number
}) {
  return createInvestmentAccount({
    amount,
    termWeeks: clampInvestmentTermWeeks(termWeeks),
  })
}

export async function breakInvestment(accountId: string) {
  return breakInvestmentAccount(accountId)
}

export async function getBreakPreview(accountId: string) {
  const settings = getSettings()
  const coins = getCoins()
  const account = coins.accounts.find((a) => a.id === accountId)

  if (!account || account.kind !== 'INVESTMENT_TERM' || account.status !== 'ACTIVE') {
    return null
  }

  const principal = account.principalAmount ?? 0
  const currentBalance = account.currentBalance
  const forfeitedInterest = Math.max(0, currentBalance - principal)
  const taxPenalty = account.startedAt
    ? calculateBreakTaxPenalty({
        principal,
        startedAt: account.startedAt,
        timezone: settings.system.timezone,
        weekStartDay: settings.system.weekStartDay,
      })
    : 0

  return {
    principal,
    forfeitedInterest,
    taxPenalty,
    totalLoss: forfeitedInterest + taxPenalty,
    netReturned: Math.max(0, principal - taxPenalty),
  }
}

export async function withdrawInvestment(accountId: string) {
  return withdrawInvestmentAccount(accountId)
}

export async function uploadAvatar(formData: FormData): Promise<string> {
  const file = formData.get('avatar') as File
  if (!file) {
    throw new Error('No file provided')
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('File size must be less than 5MB')
  }

  const mimeType = file.type.toLowerCase()
  if (!ALLOWED_AVATAR_MIME_TYPES.has(mimeType)) {
    throw new Error('Unsupported avatar MIME type')
  }

  const ext = path.extname(file.name).toLowerCase()
  if (!ALLOWED_AVATAR_EXTENSIONS.has(ext)) {
    throw new Error('Unsupported avatar file extension')
  }

  const avatarsDir = path.join(process.cwd(), 'data', 'avatars')
  await fs.mkdir(avatarsDir, { recursive: true })

  const filename = `${Date.now()}-${randomUUID()}${ext}`
  const filePath = path.join(avatarsDir, filename)

  const buffer = await file.arrayBuffer()
  await fs.writeFile(filePath, Buffer.from(buffer))

  return `/data/avatars/${filename}`
}

export async function getChangelog(): Promise<string> {
  try {
    const changelogPath = path.join(process.cwd(), 'CHANGELOG.md')
    return await fs.readFile(changelogPath, 'utf8')
  } catch {
    return '# Changelog\n\nNo changelog available.'
  }
}

export async function loadServerSettings(): Promise<ServerSettings> {
  return {
    isDemo: !!process.env.DEMO,
  }
}

export async function checkDataFreshness(): Promise<{ isFresh: boolean }> {
  return { isFresh: true }
}
