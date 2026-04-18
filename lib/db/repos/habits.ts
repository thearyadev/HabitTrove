import { randomUUID } from 'crypto'
import { getDatabase, withTransaction } from '@/lib/db/client'
import { Habit, HabitsData } from '@/lib/types'

type HabitRow = {
  id: string
  name: string
  description: string
  frequency: string
  coin_reward: number
  target_completions: number | null
  is_task: number
  archived: number
  pinned: number
  drawing: string | null
}

type CompletionRow = {
  habit_id: string
  completed_at: string
}

function getCompletionMap(habitIds: string[]) {
  const map = new Map<string, string[]>()

  if (habitIds.length === 0) {
    return map
  }

  const db = getDatabase()
  const placeholders = habitIds.map(() => '?').join(', ')
  const rows = db.prepare(`
    SELECT habit_id, completed_at
    FROM habit_completions
    WHERE habit_id IN (${placeholders})
    ORDER BY completed_at ASC
  `).all(...habitIds) as CompletionRow[]

  for (const row of rows) {
    const current = map.get(row.habit_id) ?? []
    current.push(row.completed_at)
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
    targetCompletions: row.target_completions ?? undefined,
    completions: completionMap.get(row.id) ?? [],
    isTask: row.is_task === 1,
    archived: row.archived === 1,
    pinned: row.pinned === 1,
    drawing: row.drawing ?? undefined,
  }))
}

function replaceCompletions(habitId: string, completions: string[]) {
  const db = getDatabase()
  db.prepare('DELETE FROM habit_completions WHERE habit_id = ?').run(habitId)
  const insert = db.prepare(`
    INSERT INTO habit_completions (id, habit_id, completed_at)
    VALUES (?, ?, ?)
  `)

  for (const completion of completions) {
    insert.run(randomUUID(), habitId, completion)
  }
}

export function getHabits(): HabitsData {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT id, name, description, frequency, coin_reward, target_completions, is_task, archived, pinned, drawing
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
