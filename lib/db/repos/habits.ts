import { randomUUID } from 'crypto'
import { getDatabase, withTransaction } from '@/lib/db/client'
import { Habit, HabitCompletion, HabitsData } from '@/lib/types'

type HabitRow = {
  id: string
  name: string
  description: string
  frequency: string
  coin_reward: number
  tracking_mode: 'standard' | 'quantity'
  quantity_unit: string | null
  base_rate: number | null
  base_unit: number | null
  bonus_threshold: number | null
  scale_factor: number | null
  target_completions: number | null
  is_task: number
  archived: number
  pinned: number
  drawing: string | null
}

type CompletionRow = {
  id: string
  habit_id: string
  completed_at: string
  quantity: number | null
  coins_awarded: number | null
}

function getCompletionMap(habitIds: string[]) {
  const map = new Map<string, HabitCompletion[]>()

  if (habitIds.length === 0) {
    return map
  }

  const db = getDatabase()
  const placeholders = habitIds.map(() => '?').join(', ')
  const rows = db.prepare(`
    SELECT id, habit_id, completed_at, quantity, coins_awarded
    FROM habit_completions
    WHERE habit_id IN (${placeholders})
    ORDER BY completed_at ASC
  `).all(...habitIds) as CompletionRow[]

  for (const row of rows) {
    const current = map.get(row.habit_id) ?? []
    current.push({
      id: row.id,
      completedAt: row.completed_at,
      quantity: row.quantity ?? undefined,
      coinsAwarded: row.coins_awarded ?? undefined,
    })
    map.set(row.habit_id, current)
  }

  return map
}

function hydrateHabits(rows: HabitRow[]): Habit[] {
  const completionMap = getCompletionMap(rows.map((row) => row.id))

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    frequency: row.frequency,
    coinReward: row.coin_reward,
    trackingMode: row.tracking_mode,
    quantityUnit: row.quantity_unit ?? undefined,
    baseRate: row.base_rate ?? undefined,
    baseUnit: row.base_unit ?? undefined,
    bonusThreshold: row.bonus_threshold ?? undefined,
    scaleFactor: row.scale_factor ?? undefined,
    targetCompletions: row.target_completions ?? undefined,
    completions: completionMap.get(row.id) ?? [],
    isTask: row.is_task === 1,
    archived: row.archived === 1,
    pinned: row.pinned === 1,
    drawing: row.drawing ?? undefined,
  }))
}

function replaceCompletions(habitId: string, completions: HabitCompletion[]) {
  const db = getDatabase()
  db.prepare('DELETE FROM habit_completions WHERE habit_id = ?').run(habitId)
  const insert = db.prepare(`
    INSERT INTO habit_completions (id, habit_id, completed_at, quantity, coins_awarded)
    VALUES (?, ?, ?, ?, ?)
  `)

  for (const completion of completions) {
    insert.run(
      completion.id || randomUUID(),
      habitId,
      completion.completedAt,
      completion.quantity ?? null,
      completion.coinsAwarded ?? null
    )
  }
}

export function getHabits(): HabitsData {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT
      id,
      name,
      description,
      frequency,
      coin_reward,
      tracking_mode,
      quantity_unit,
      base_rate,
      base_unit,
      bonus_threshold,
      scale_factor,
      target_completions,
      is_task,
      archived,
      pinned,
      drawing
    FROM habits
    ORDER BY pinned DESC, created_at DESC
  `).all() as HabitRow[]

  return {
    habits: hydrateHabits(rows),
  }
}

export function saveHabits(data: HabitsData) {
  return withTransaction((db) => {
    const incomingIds = new Set(data.habits.map((habit) => habit.id))

    for (const habit of data.habits) {
      const createdAt = db
        .prepare('SELECT created_at FROM habits WHERE id = ?')
        .get(habit.id) as { created_at: string } | undefined

      db.prepare(`
        INSERT INTO habits (
          id,
          name,
          description,
          frequency,
          coin_reward,
          tracking_mode,
          quantity_unit,
          base_rate,
          base_unit,
          bonus_threshold,
          scale_factor,
          target_completions,
          is_task,
          archived,
          pinned,
          drawing,
          created_at
        ) VALUES (
          @id,
          @name,
          @description,
          @frequency,
          @coin_reward,
          @tracking_mode,
          @quantity_unit,
          @base_rate,
          @base_unit,
          @bonus_threshold,
          @scale_factor,
          @target_completions,
          @is_task,
          @archived,
          @pinned,
          @drawing,
          @created_at
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          frequency = excluded.frequency,
          coin_reward = excluded.coin_reward,
          tracking_mode = excluded.tracking_mode,
          quantity_unit = excluded.quantity_unit,
          base_rate = excluded.base_rate,
          base_unit = excluded.base_unit,
          bonus_threshold = excluded.bonus_threshold,
          scale_factor = excluded.scale_factor,
          target_completions = excluded.target_completions,
          is_task = excluded.is_task,
          archived = excluded.archived,
          pinned = excluded.pinned,
          drawing = excluded.drawing
      `).run({
        id: habit.id,
        name: habit.name,
        description: habit.description,
        frequency: habit.frequency,
        coin_reward: habit.coinReward,
        tracking_mode: habit.trackingMode ?? 'standard',
        quantity_unit: habit.quantityUnit ?? null,
        base_rate: habit.baseRate ?? null,
        base_unit: habit.baseUnit ?? null,
        bonus_threshold: habit.bonusThreshold ?? null,
        scale_factor: habit.scaleFactor ?? null,
        target_completions: habit.targetCompletions ?? null,
        is_task: habit.isTask ? 1 : 0,
        archived: habit.archived ? 1 : 0,
        pinned: habit.pinned ? 1 : 0,
        drawing: habit.drawing ?? null,
        created_at: createdAt?.created_at ?? new Date().toISOString(),
      })

      replaceCompletions(habit.id, habit.completions)
    }

    const existingIds = db.prepare('SELECT id FROM habits').all().map((row) => (row as { id: string }).id)
    for (const existingId of existingIds) {
      if (!incomingIds.has(existingId)) {
        db.prepare('DELETE FROM habits WHERE id = ?').run(existingId)
      }
    }
  })
}
