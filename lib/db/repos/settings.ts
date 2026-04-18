import { getDatabase } from '@/lib/db/client'
import { getDefaultSettings, Settings } from '@/lib/types'

type SettingsRow = {
  use_number_formatting: number
  use_grouping: number
  timezone: string
  week_start_day: number
  auto_backup_enabled: number
  language: string
}

function mapSettings(row?: SettingsRow): Settings {
  const defaults = getDefaultSettings()

  if (!row) {
    return defaults
  }

  return {
    ui: {
      useNumberFormatting: row.use_number_formatting === 1,
      useGrouping: row.use_grouping === 1,
    },
    system: {
      timezone: row.timezone || defaults.system.timezone,
      weekStartDay: row.week_start_day as Settings['system']['weekStartDay'],
      autoBackupEnabled: false,
      language: row.language || defaults.system.language,
    },
    profile: defaults.profile,
  }
}

export function getSettings(): Settings {
  const db = getDatabase()
  const row = db.prepare(`
    SELECT
      use_number_formatting,
      use_grouping,
      timezone,
      week_start_day,
      auto_backup_enabled,
      language
    FROM app_settings
    WHERE singleton = 1
  `).get() as SettingsRow | undefined

  return mapSettings(row)
}

export function saveSettingsRecord(settings: Settings) {
  const db = getDatabase()
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
      0,
      @language
    )
    ON CONFLICT(singleton) DO UPDATE SET
      use_number_formatting = excluded.use_number_formatting,
      use_grouping = excluded.use_grouping,
      timezone = excluded.timezone,
      week_start_day = excluded.week_start_day,
      auto_backup_enabled = 0,
      language = excluded.language
  `).run({
    use_number_formatting: settings.ui.useNumberFormatting ? 1 : 0,
    use_grouping: settings.ui.useGrouping ? 1 : 0,
    timezone: settings.system.timezone,
    week_start_day: settings.system.weekStartDay,
    language: settings.system.language,
  })
}

export function isAutoBackupEnabled() {
  return false
}
