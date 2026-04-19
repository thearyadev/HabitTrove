import { afterEach, describe, expect, test } from 'bun:test'
import { migrateDatabase, UNSUPPORTED_DB_ERROR } from './migrate'

const supportsBetterSqlite = !('bun' in process.versions)
const databases: Array<{ close: () => void }> = []

async function createDatabase() {
  const betterSqliteModule = (await import('better-sqlite3')) as unknown as {
    default: new (filename: string) => any
  }
  const Database = betterSqliteModule.default
  const db = new Database(':memory:')
  databases.push(db)
  return db
}

afterEach(() => {
  while (databases.length > 0) {
    databases.pop()?.close()
  }
})

describe('migrateDatabase', () => {
  ;(supportsBetterSqlite ? test : test.skip)('initializes a fresh database with finance tables', async () => {
    const db = await createDatabase()

    migrateDatabase(db)

    const tables = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
    `).all() as Array<{ name: string }>

    expect(tables.map((table) => table.name)).toEqual(expect.arrayContaining([
      'rewards',
      'reward_tiers',
      'accounts',
      'ledger_entries',
      'scheduled_events',
    ]))

    const accountKinds = db.prepare(`SELECT kind FROM accounts`).all() as Array<{ kind: string }>
    expect(accountKinds).toEqual([{ kind: 'PRIMARY' }])
  })

  ;(supportsBetterSqlite ? test : test.skip)('migrates v5 coin transactions into immutable primary ledger', async () => {
    const db = await createDatabase()

    db.exec(`
      CREATE TABLE coin_transactions (
        id TEXT PRIMARY KEY,
        amount INTEGER NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        related_item_id TEXT,
        related_sub_item_id TEXT,
        note TEXT
      );
    `)
    db.pragma('user_version = 5')
    db.prepare(`
      INSERT INTO coin_transactions (
        id,
        amount,
        type,
        description,
        timestamp,
        related_item_id,
        related_sub_item_id,
        note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'txn-1',
      120,
      'HABIT_COMPLETION',
      'Completed deep work',
      '2026-04-14T10:00:00.000Z',
      'habit-1',
      null,
      null,
    )

    migrateDatabase(db)

    const primary = db.prepare(`SELECT id FROM accounts WHERE kind = 'PRIMARY'`).get() as { id: string }
    const ledgerRows = db.prepare(`
      SELECT id, account_id, amount, type, effective_at
      FROM ledger_entries
    `).all() as Array<{
      id: string
      account_id: string
      amount: number
      type: string
      effective_at: string
    }>

    expect(ledgerRows).toEqual([
      {
        id: 'txn-1',
        account_id: primary.id,
        amount: 120,
        type: 'HABIT_COMPLETION',
        effective_at: '2026-04-14T10:00:00.000Z',
      },
    ])

    const balance = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger_entries`).get() as { balance: number }
    expect(balance.balance).toBe(120)
  })

  ;(supportsBetterSqlite ? test : test.skip)('migrates v6 integer columns to REAL for decimal support', async () => {
    const db = await createDatabase()

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
      INSERT INTO app_settings (singleton, timezone) VALUES (1, 'UTC');

      CREATE TABLE habits (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        frequency TEXT NOT NULL,
        coin_reward INTEGER NOT NULL,
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
      INSERT INTO habits (id, name, frequency, coin_reward, created_at) VALUES ('h1', 'Test', 'FREQ=DAILY', 10, '2026-01-01T00:00:00.000Z');

      CREATE TABLE habit_completions (
        id TEXT PRIMARY KEY,
        habit_id TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        quantity REAL,
        coins_awarded INTEGER,
        FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
      );
      INSERT INTO habit_completions (id, habit_id, completed_at, coins_awarded) VALUES ('c1', 'h1', '2026-01-01T10:00:00.000Z', 10);

      CREATE TABLE rewards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        archived INTEGER NOT NULL DEFAULT 0,
        link TEXT,
        limit_window TEXT NOT NULL DEFAULT 'unlimited',
        max_redemptions INTEGER,
        created_at TEXT NOT NULL,
        deleted_at TEXT
      );

      CREATE TABLE reward_tiers (
        id TEXT PRIMARY KEY,
        reward_id TEXT NOT NULL,
        name TEXT NOT NULL,
        coin_cost INTEGER NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE CASCADE
      );

      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        term_weeks INTEGER,
        weekly_interest_rate_bps INTEGER,
        principal_amount INTEGER,
        started_at TEXT,
        matures_at TEXT,
        closed_at TEXT,
        tax_start_at TEXT
      );
      INSERT INTO accounts (id, name, kind, status, created_at, updated_at, tax_start_at) VALUES ('acc1', 'Primary account', 'PRIMARY', 'ACTIVE', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

      CREATE TABLE ledger_entries (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        posted_at TEXT NOT NULL,
        effective_at TEXT NOT NULL,
        related_item_id TEXT,
        related_sub_item_id TEXT,
        metadata_json TEXT,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT
      );
      INSERT INTO ledger_entries (id, account_id, amount, type, description, posted_at, effective_at) VALUES ('le1', 'acc1', 50, 'MANUAL_ADJUSTMENT', 'Test', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

      CREATE TABLE scheduled_events (
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
    `)
    db.pragma('user_version = 6')

    migrateDatabase(db)

    const habitReward = db.prepare(`SELECT coin_reward FROM habits WHERE id = 'h1'`).get() as { coin_reward: number }
    expect(habitReward.coin_reward).toBe(10)

    const completionCoins = db.prepare(`SELECT coins_awarded FROM habit_completions WHERE id = 'c1'`).get() as { coins_awarded: number }
    expect(completionCoins.coins_awarded).toBe(10)

    const ledgerAmount = db.prepare(`SELECT amount FROM ledger_entries WHERE id = 'le1'`).get() as { amount: number }
    expect(ledgerAmount.amount).toBe(50)

    const version = db.pragma('user_version', { simple: true }) as number
    expect(version).toBe(7)
  })

  ;(supportsBetterSqlite ? test : test.skip)('rejects old prerelease databases with a clear reset message', async () => {
    const db = await createDatabase()
    db.pragma('user_version = 4')

    expect(() => migrateDatabase(db)).toThrow(UNSUPPORTED_DB_ERROR)
  })
})
