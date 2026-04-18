export const SCHEMA_VERSION = 3

export const SCHEMA_SQL = `
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
    drawing TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS habit_completions (
    id TEXT PRIMARY KEY,
    habit_id TEXT NOT NULL,
    completed_at TEXT NOT NULL,
    quantity REAL,
    coins_awarded INTEGER,
    FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS wishlist_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    coin_cost INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    target_completions INTEGER,
    link TEXT,
    drawing TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS coin_transactions (
    id TEXT PRIMARY KEY,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    related_item_id TEXT,
    note TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_habit_completions_habit_id
    ON habit_completions(habit_id);
  CREATE INDEX IF NOT EXISTS idx_coin_transactions_timestamp
    ON coin_transactions(timestamp DESC);
`
