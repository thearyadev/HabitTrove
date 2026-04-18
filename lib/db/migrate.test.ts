import { afterEach, describe, expect, test } from 'bun:test'
import { migrateDatabase } from './migrate'

const supportsBetterSqlite = !('bun' in process.versions)
const databases: Array<{ close: () => void }> = []

async function createLegacyDatabase() {
  const betterSqliteModule = (await import('better-sqlite3')) as unknown as {
    default: new (filename: string) => any
  }
  const Database = betterSqliteModule.default
  const db = new Database(':memory:')
  databases.push(db)

  db.exec(`
    CREATE TABLE app_settings (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      use_number_formatting INTEGER NOT NULL DEFAULT 1,
      use_grouping INTEGER NOT NULL DEFAULT 1,
      timezone TEXT NOT NULL,
      week_start_day INTEGER NOT NULL DEFAULT 1,
      auto_backup_enabled INTEGER NOT NULL DEFAULT 0,
      language TEXT NOT NULL DEFAULT 'en'
    );

    CREATE TABLE habits (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      frequency TEXT NOT NULL,
      coin_reward INTEGER NOT NULL,
      target_completions INTEGER,
      is_task INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      drawing TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE habit_completions (
      id TEXT PRIMARY KEY,
      habit_id TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    );
  `)

  db.prepare(`
    INSERT INTO app_settings (
      singleton,
      use_number_formatting,
      use_grouping,
      timezone,
      week_start_day,
      auto_backup_enabled,
      language
    ) VALUES (1, 1, 1, 'America/Toronto', 1, 0, 'en')
  `).run()

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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'habit-1',
    'Bike Ride',
    '',
    'RRULE:FREQ=DAILY',
    3,
    1,
    0,
    0,
    0,
    null,
    '2026-04-18T12:00:00.000Z'
  )

  db.prepare(`
    INSERT INTO habit_completions (id, habit_id, completed_at)
    VALUES (?, ?, ?)
  `).run('completion-1', 'habit-1', '2026-04-18T12:00:00.000Z')

  db.pragma('user_version = 2')

  return db
}

afterEach(() => {
  while (databases.length > 0) {
    databases.pop()?.close()
  }
})

describe('migrateDatabase', () => {
  ;(supportsBetterSqlite ? test : test.skip)('adds quantity-tracking columns without losing existing data', async () => {
    const db = await createLegacyDatabase()

    migrateDatabase(db)

    const habitColumns = db.prepare(`PRAGMA table_info(habits)`).all() as Array<{ name: string }>
    const completionColumns = db.prepare(`PRAGMA table_info(habit_completions)`).all() as Array<{ name: string }>

    expect(habitColumns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'tracking_mode',
      'quantity_unit',
      'base_rate',
      'base_unit',
      'bonus_threshold',
      'scale_factor',
    ]))
    expect(completionColumns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'quantity',
      'coins_awarded',
    ]))

    const migratedHabit = db.prepare(`
      SELECT id, name, coin_reward, tracking_mode
      FROM habits
      WHERE id = ?
    `).get('habit-1') as {
      id: string
      name: string
      coin_reward: number
      tracking_mode: string
    }

    const migratedCompletion = db.prepare(`
      SELECT id, habit_id, completed_at, quantity, coins_awarded
      FROM habit_completions
      WHERE id = ?
    `).get('completion-1') as {
      id: string
      habit_id: string
      completed_at: string
      quantity: number | null
      coins_awarded: number | null
    }

    expect(migratedHabit).toEqual({
      id: 'habit-1',
      name: 'Bike Ride',
      coin_reward: 3,
      tracking_mode: 'standard',
    })
    expect(migratedCompletion).toEqual({
      id: 'completion-1',
      habit_id: 'habit-1',
      completed_at: '2026-04-18T12:00:00.000Z',
      quantity: null,
      coins_awarded: null,
    })
    expect(db.pragma('user_version', { simple: true })).toBe(3)
  })
})
