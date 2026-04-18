import type Database from 'better-sqlite3'
import { getDefaultSettings } from '@/lib/types'
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema'

function tableExists(db: Database.Database, tableName: string) {
  const row = db
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `)
    .get(tableName) as { name: string } | undefined

  return !!row
}

function columnExists(db: Database.Database, tableName: string, columnName: string) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  return columns.some((column) => column.name === columnName)
}

function addColumnIfMissing(db: Database.Database, tableName: string, columnName: string, definition: string) {
  if (!tableExists(db, tableName) || columnExists(db, tableName, columnName)) {
    return
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
}

function migrateToVersion3(db: Database.Database) {
  addColumnIfMissing(db, 'habits', 'tracking_mode', `TEXT NOT NULL DEFAULT 'standard'`)
  addColumnIfMissing(db, 'habits', 'quantity_unit', 'TEXT')
  addColumnIfMissing(db, 'habits', 'base_rate', 'REAL')
  addColumnIfMissing(db, 'habits', 'base_unit', 'REAL')
  addColumnIfMissing(db, 'habits', 'bonus_threshold', 'REAL')
  addColumnIfMissing(db, 'habits', 'scale_factor', 'REAL')

  addColumnIfMissing(db, 'habit_completions', 'quantity', 'REAL')
  addColumnIfMissing(db, 'habit_completions', 'coins_awarded', 'INTEGER')
}

function seedSettings(db: Database.Database) {
  const existing = db.prepare('SELECT singleton FROM app_settings WHERE singleton = 1').get()
  if (existing) {
    return
  }

  const defaults = getDefaultSettings()
  db.prepare(`
    INSERT INTO app_settings (
      singleton,
      use_number_formatting,
      use_grouping,
      timezone,
      week_start_day,
      auto_backup_enabled,
      language
    ) VALUES (
      1,
      @use_number_formatting,
      @use_grouping,
      @timezone,
      @week_start_day,
      @auto_backup_enabled,
      @language
    )
  `).run({
    use_number_formatting: defaults.ui.useNumberFormatting ? 1 : 0,
    use_grouping: defaults.ui.useGrouping ? 1 : 0,
    timezone: defaults.system.timezone,
    week_start_day: defaults.system.weekStartDay,
    auto_backup_enabled: 0,
    language: defaults.system.language,
  })
}

export function migrateDatabase(db: Database.Database) {
  const currentVersion = db.pragma('user_version', { simple: true }) as number

  db.exec(SCHEMA_SQL)

  if (currentVersion < 3) {
    migrateToVersion3(db)
  }

  db.pragma(`user_version = ${SCHEMA_VERSION}`)
  seedSettings(db)
}
