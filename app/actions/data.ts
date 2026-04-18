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
import { d2t, getNow } from '@/lib/utils'
import { ALLOWED_AVATAR_EXTENSIONS, ALLOWED_AVATAR_MIME_TYPES } from '@/lib/avatar'
import { getCoins, insertCoinTransaction, saveCoinSnapshot, updateTransactionNoteRecord } from '@/lib/db/repos/coins'
import { getHabits, saveHabits } from '@/lib/db/repos/habits'
import { getSettings, saveSettingsRecord } from '@/lib/db/repos/settings'
import { getWishlist, saveWishlist } from '@/lib/db/repos/wishlist'

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
