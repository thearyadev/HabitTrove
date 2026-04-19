import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'
import { getDefaultSettings } from '@/lib/types'
import { BASE_SCHEMA_SQL, SCHEMA_VERSION } from './schema'

const UNSUPPORTED_DB_ERROR =
  'Unsupported prerelease database schema detected. Delete data/habittrove.sqlite and restart.'

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

function seedPrimaryAccount(db: Database.Database, createdAt: string) {
  const existing = db.prepare(`
    SELECT id
    FROM accounts
    WHERE kind = 'PRIMARY'
    LIMIT 1
  `).get() as { id: string } | undefined

  if (existing) {
    return existing.id
  }

  const id = randomUUID()
  db.prepare(`
    INSERT INTO accounts (
      id,
      name,
      kind,
      status,
      created_at,
      updated_at,
      tax_start_at
    ) VALUES (?, 'Primary account', 'PRIMARY', 'ACTIVE', ?, ?, ?)
  `).run(id, createdAt, createdAt, createdAt)

  return id
}

function createFreshDatabase(db: Database.Database) {
  const now = new Date().toISOString()
  db.exec(BASE_SCHEMA_SQL)
  seedSettings(db)
  seedPrimaryAccount(db, now)
}

function migrateCoinsToLedger(db: Database.Database, primaryAccountId: string) {
  const hasLegacyTable = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = 'coin_transactions'
  `).get() as { name: string } | undefined

  if (!hasLegacyTable) {
    return
  }

  const rows = db.prepare(`
    SELECT id, amount, type, description, timestamp, related_item_id, related_sub_item_id
    FROM coin_transactions
    ORDER BY timestamp ASC, id ASC
  `).all() as Array<{
    id: string
    amount: number
    type: string
    description: string
    timestamp: string
    related_item_id: string | null
    related_sub_item_id: string | null
  }>

  const insert = db.prepare(`
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
    ) VALUES (
      @id,
      @account_id,
      @amount,
      @type,
      @description,
      @posted_at,
      @effective_at,
      @related_item_id,
      @related_sub_item_id,
      NULL
    )
    ON CONFLICT(id) DO NOTHING
  `)

  for (const row of rows) {
    const mappedType = row.type === 'HABIT_UNDO' || row.type === 'TASK_UNDO'
      ? 'LEGACY_UNDO'
      : row.type

    insert.run({
      id: row.id,
      account_id: primaryAccountId,
      amount: row.amount,
      type: mappedType,
      description: row.description,
      posted_at: row.timestamp,
      effective_at: row.timestamp,
      related_item_id: row.related_item_id,
      related_sub_item_id: row.related_sub_item_id,
    })
  }
}

function migrateFromVersion5(db: Database.Database) {
  const now = new Date().toISOString()
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      term_weeks INTEGER,
      weekly_interest_rate_bps INTEGER,
      principal_amount REAL,
      started_at TEXT,
      matures_at TEXT,
      closed_at TEXT,
      tax_start_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      posted_at TEXT NOT NULL,
      effective_at TEXT NOT NULL,
      related_item_id TEXT,
      related_sub_item_id TEXT,
      metadata_json TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS scheduled_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      account_id TEXT NOT NULL,
      scheduled_for TEXT NOT NULL,
      status TEXT NOT NULL,
      processed_at TEXT,
      dedupe_key TEXT NOT NULL UNIQUE,
      payload_json TEXT,
      error TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_accounts_kind_status
      ON accounts(kind, status);
    CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_effective_at
      ON ledger_entries(account_id, effective_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_ledger_entries_effective_at
      ON ledger_entries(effective_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_scheduled_events_status_date
      ON scheduled_events(status, scheduled_for ASC);
  `)

  migrateHabitsAndCompletionsToV7(db)
  migrateRewardTiersToV7(db)

  const primaryAccountId = seedPrimaryAccount(db, now)
  migrateCoinsToLedger(db, primaryAccountId)
}

function tableHasRealColumn(db: Database.Database, tableName: string, columnName: string): boolean {
  const rows = db.pragma(`table_info("${tableName}")`) as Array<{ name: string; type: string }>
  const col = rows.find((r) => r.name === columnName)
  return col?.type === 'REAL'
}

function migrateHabitsAndCompletionsToV7(db: Database.Database) {
  if (tableHasRealColumn(db, 'habits', 'coin_reward')) return

  db.exec(`DROP TABLE IF EXISTS habits_v6_tmp`)
  db.exec(`DROP TABLE IF EXISTS habit_completions_v6_tmp`)

  const fkWasOn = db.pragma('foreign_keys', { simple: true }) as number
  db.pragma('foreign_keys = OFF')

  db.exec(`
    ALTER TABLE habits RENAME TO habits_v6_tmp;
    CREATE TABLE habits (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      frequency TEXT NOT NULL,
      coin_reward REAL NOT NULL,
      tracking_mode TEXT NOT NULL DEFAULT 'standard',
      quantity_unit TEXT,
      base_rate REAL,
      base_unit REAL,
      bonus_threshold REAL,
      scale_factor REAL,
      target_completions INTEGER,
      is_task INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    );
    INSERT INTO habits SELECT * FROM habits_v6_tmp;
    DROP TABLE habits_v6_tmp;

    ALTER TABLE habit_completions RENAME TO habit_completions_v6_tmp;
    CREATE TABLE habit_completions (
      id TEXT PRIMARY KEY,
      habit_id TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      quantity REAL,
      coins_awarded REAL,
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    );
    INSERT INTO habit_completions SELECT * FROM habit_completions_v6_tmp;
    DROP TABLE habit_completions_v6_tmp;

    CREATE INDEX IF NOT EXISTS idx_habit_completions_habit_id
      ON habit_completions(habit_id);
    CREATE INDEX IF NOT EXISTS idx_habits_deleted_at
      ON habits(deleted_at);
  `)

  if (fkWasOn) db.pragma('foreign_keys = ON')
}

function migrateRewardTiersToV7(db: Database.Database) {
  if (tableHasRealColumn(db, 'reward_tiers', 'coin_cost')) return

  db.exec(`DROP TABLE IF EXISTS reward_tiers_v6_tmp`)

  const fkWasOn = db.pragma('foreign_keys', { simple: true }) as number
  db.pragma('foreign_keys = OFF')

  db.exec(`
    ALTER TABLE reward_tiers RENAME TO reward_tiers_v6_tmp;
    CREATE TABLE reward_tiers (
      id TEXT PRIMARY KEY,
      reward_id TEXT NOT NULL,
      name TEXT NOT NULL,
      coin_cost REAL NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE CASCADE
    );
    INSERT INTO reward_tiers SELECT * FROM reward_tiers_v6_tmp;
    DROP TABLE reward_tiers_v6_tmp;

    CREATE INDEX IF NOT EXISTS idx_reward_tiers_reward_id
      ON reward_tiers(reward_id);
    CREATE INDEX IF NOT EXISTS idx_reward_tiers_deleted_at
      ON reward_tiers(deleted_at);
  `)

  if (fkWasOn) db.pragma('foreign_keys = ON')
}

function migrateAccountsAndLedgerToV7(db: Database.Database) {
  if (tableHasRealColumn(db, 'accounts', 'principal_amount') && tableHasRealColumn(db, 'ledger_entries', 'amount')) return

  db.exec(`DROP TABLE IF EXISTS accounts_v6_tmp`)
  db.exec(`DROP TABLE IF EXISTS ledger_entries_v6_tmp`)

  const fkWasOn = db.pragma('foreign_keys', { simple: true }) as number
  db.pragma('foreign_keys = OFF')

  db.exec(`
    ALTER TABLE accounts RENAME TO accounts_v6_tmp;
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      term_weeks INTEGER,
      weekly_interest_rate_bps INTEGER,
      principal_amount REAL,
      started_at TEXT,
      matures_at TEXT,
      closed_at TEXT,
      tax_start_at TEXT
    );
    INSERT INTO accounts SELECT * FROM accounts_v6_tmp;
    DROP TABLE accounts_v6_tmp;

    ALTER TABLE ledger_entries RENAME TO ledger_entries_v6_tmp;
    CREATE TABLE ledger_entries (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      posted_at TEXT NOT NULL,
      effective_at TEXT NOT NULL,
      related_item_id TEXT,
      related_sub_item_id TEXT,
      metadata_json TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT
    );
    INSERT INTO ledger_entries SELECT * FROM ledger_entries_v6_tmp;
    DROP TABLE ledger_entries_v6_tmp;

    CREATE INDEX IF NOT EXISTS idx_accounts_kind_status
      ON accounts(kind, status);
    CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_effective_at
      ON ledger_entries(account_id, effective_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_ledger_entries_effective_at
      ON ledger_entries(effective_at DESC, id DESC);
  `)

  if (fkWasOn) db.pragma('foreign_keys = ON')
}

function migrateFromVersion6(db: Database.Database) {
  migrateHabitsAndCompletionsToV7(db)
  migrateRewardTiersToV7(db)
  migrateAccountsAndLedgerToV7(db)
}

function cleanupLeftoverTmpTables(db: Database.Database) {
  const tmpTables = db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%_v6_tmp'
  `).all() as Array<{ name: string }>

  if (tmpTables.length === 0) return

  const fkWasOn = db.pragma('foreign_keys', { simple: true }) as number
  db.pragma('foreign_keys = OFF')

  for (const { name } of tmpTables) {
    db.exec(`DROP TABLE IF EXISTS "${name}"`)
  }

  if (fkWasOn) db.pragma('foreign_keys = ON')
}

export function migrateDatabase(db: Database.Database) {
  const currentVersion = db.pragma('user_version', { simple: true }) as number

  if (currentVersion > SCHEMA_VERSION) {
    throw new Error(UNSUPPORTED_DB_ERROR)
  }

  if (currentVersion === 0) {
    createFreshDatabase(db)
    db.pragma(`user_version = ${SCHEMA_VERSION}`)
    return
  }

  if (currentVersion === 5) {
    migrateFromVersion5(db)
    db.pragma(`user_version = ${SCHEMA_VERSION}`)
    return
  }

  if (currentVersion === 6) {
    migrateFromVersion6(db)
    db.pragma(`user_version = ${SCHEMA_VERSION}`)
    return
  }

  if (currentVersion !== SCHEMA_VERSION) {
    throw new Error(UNSUPPORTED_DB_ERROR)
  }

  cleanupLeftoverTmpTables(db)
  db.exec(BASE_SCHEMA_SQL)
  seedSettings(db)
}

export { UNSUPPORTED_DB_ERROR }
