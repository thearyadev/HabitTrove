'use server'

import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import {
  CoinsData,
  CoinTransaction,
  HabitsData,
  ServerSettings,
  Settings,
  TransactionType,
  WishlistData,
  WishlistItemType,
} from '@/lib/types'
import {
  BulkEditPayload,
  createBulkEditPayload,
  parseBulkEditJson,
  reconcileBulkEditPayloadWithCurrentCatalog,
} from '@/lib/bulk-edit'
import { d2t, getNow } from '@/lib/utils'
import { ALLOWED_AVATAR_EXTENSIONS, ALLOWED_AVATAR_MIME_TYPES } from '@/lib/avatar'
import { withTransaction } from '@/lib/db/client'
import { getCoins, insertCoinTransaction, saveCoinSnapshot, updateTransactionNoteRecord } from '@/lib/db/repos/coins'
import { getHabits, saveHabits, syncHabitDefinitions } from '@/lib/db/repos/habits'
import { getSettings, saveSettingsRecord } from '@/lib/db/repos/settings'
import { getWishlist, saveWishlist, syncWishlistDefinitions } from '@/lib/db/repos/wishlist'

export async function triggerManualBackup(): Promise<{ success: boolean; message: string }> {
  return { success: false, message: 'Backups are disabled in the single-user build.' }
}

export async function loadWishlistData(): Promise<WishlistData> {
  return getWishlist()
}

export async function loadWishlistItems(): Promise<WishlistItemType[]> {
  const data = await loadWishlistData()
  return data.items
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
    rewards: wishlist.items,
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
  const currentRewards = getWishlist().items
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

export async function saveCoinsData(data: CoinsData): Promise<void> {
  saveCoinSnapshot(data)
}

export async function addCoins({
  amount,
  description,
  type = 'MANUAL_ADJUSTMENT',
  relatedItemId,
  note,
}: {
  amount: number
  description: string
  type?: TransactionType
  relatedItemId?: string
  note?: string
}): Promise<CoinsData> {
  insertCoinTransaction({
    id: randomUUID(),
    amount,
    type,
    description,
    timestamp: d2t({ dateTime: getNow({}) }),
    relatedItemId,
    note: note?.trim() ? note : undefined,
  } satisfies CoinTransaction)

  return getCoins()
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
  note,
}: {
  amount: number
  description: string
  type?: TransactionType
  relatedItemId?: string
  note?: string
}): Promise<CoinsData> {
  insertCoinTransaction({
    id: randomUUID(),
    amount: -Math.abs(amount),
    type,
    description,
    timestamp: d2t({ dateTime: getNow({}) }),
    relatedItemId,
    note: note?.trim() ? note : undefined,
  } satisfies CoinTransaction)

  return getCoins()
}

export async function updateTransactionNote(transactionId: string, note: string): Promise<CoinsData> {
  updateTransactionNoteRecord(transactionId, note.trim() || undefined)
  return getCoins()
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
