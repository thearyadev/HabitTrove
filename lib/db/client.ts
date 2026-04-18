import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { migrateDatabase } from './migrate'

export const DATA_DIR = path.join(process.cwd(), 'data')
export const DB_PATH = path.join(DATA_DIR, 'habittrove.sqlite')

let database: Database.Database | null = null

function initializeDatabase() {
  fs.mkdirSync(DATA_DIR, { recursive: true })

  const db = new Database(DB_PATH)
  db.pragma('foreign_keys = ON')
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  migrateDatabase(db)

  return db
}

export function getDatabase() {
  if (!database) {
    database = initializeDatabase()
  }

  return database
}

export function withTransaction<T>(fn: (db: Database.Database) => T) {
  const db = getDatabase()
  const transaction = db.transaction(() => fn(db))
  return transaction()
}
