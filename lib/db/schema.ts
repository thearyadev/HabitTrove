export const SCHEMA_VERSION = 7

export const BASE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS app_settings (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    use_number_formatting INTEGER NOT NULL DEFAULT 1,
    use_grouping INTEGER NOT NULL DEFAULT 1,
    timezone TEXT NOT NULL,
    week_start_day INTEGER NOT NULL DEFAULT 1,
    auto_backup_enabled INTEGER NOT NULL DEFAULT 0,
    language TEXT NOT NULL DEFAULT 'en'
  );

  CREATE TABLE IF NOT EXISTS habits (
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

  CREATE TABLE IF NOT EXISTS habit_completions (
    id TEXT PRIMARY KEY,
    habit_id TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    quantity REAL,
    coins_awarded REAL,
    FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rewards (
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

  CREATE TABLE IF NOT EXISTS reward_tiers (
    id TEXT PRIMARY KEY,
    reward_id TEXT NOT NULL,
    name TEXT NOT NULL,
    coin_cost REAL NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE CASCADE
  );

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

  CREATE INDEX IF NOT EXISTS idx_habit_completions_habit_id
    ON habit_completions(habit_id);
  CREATE INDEX IF NOT EXISTS idx_habits_deleted_at
    ON habits(deleted_at);
  CREATE INDEX IF NOT EXISTS idx_rewards_deleted_at
    ON rewards(deleted_at);
  CREATE INDEX IF NOT EXISTS idx_reward_tiers_reward_id
    ON reward_tiers(reward_id);
  CREATE INDEX IF NOT EXISTS idx_reward_tiers_deleted_at
    ON reward_tiers(deleted_at);
  CREATE INDEX IF NOT EXISTS idx_accounts_kind_status
    ON accounts(kind, status);
  CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_effective_at
    ON ledger_entries(account_id, effective_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_ledger_entries_effective_at
    ON ledger_entries(effective_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_scheduled_events_status_date
    ON scheduled_events(status, scheduled_for ASC);
`
