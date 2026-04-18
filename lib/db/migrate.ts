import type Database from 'better-sqlite3'
import { getDefaultSettings } from '@/lib/types'
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema'

function resetDatabase(db: Database.Database) {
  db.exec(`
    DROP TABLE IF EXISTS user_permissions;
    DROP TABLE IF EXISTS user_settings;
    DROP TABLE IF EXISTS habit_assignments;
    DROP TABLE IF EXISTS wishlist_assignments;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS habit_completions;
    DROP TABLE IF EXISTS habits;
    DROP TABLE IF EXISTS wishlist_items;
    DROP TABLE IF EXISTS coin_transactions;
    DROP TABLE IF EXISTS app_settings;
  `)
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

  if (currentVersion !== SCHEMA_VERSION) {
    resetDatabase(db)
    db.exec(SCHEMA_SQL)
    db.pragma(`user_version = ${SCHEMA_VERSION}`)
  }

  seedSettings(db)
}
