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
  ;(supportsBetterSqlite ? test : test.skip)('initializes a fresh database with the reward schema', async () => {
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
      'coin_transactions',
    ]))

    const transactionColumns = db.prepare(`PRAGMA table_info(coin_transactions)`).all() as Array<{ name: string }>
    expect(transactionColumns.map((column) => column.name)).toContain('related_sub_item_id')
  })

  ;(supportsBetterSqlite ? test : test.skip)('rejects old prerelease databases with a clear reset message', async () => {
    const db = await createDatabase()
    db.pragma('user_version = 4')

    expect(() => migrateDatabase(db)).toThrow(UNSUPPORTED_DB_ERROR)
  })
})
