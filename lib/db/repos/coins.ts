import { getDatabase, withTransaction } from '@/lib/db/client'
import { CoinTransaction, CoinsData, TransactionType } from '@/lib/types'

type TransactionRow = {
  id: string
  amount: number
  type: TransactionType
  description: string
  timestamp: string
  related_item_id: string | null
  note: string | null
}

function mapTransactions(rows: TransactionRow[]): CoinTransaction[] {
  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    type: row.type,
    description: row.description,
    timestamp: row.timestamp,
    relatedItemId: row.related_item_id ?? undefined,
    note: row.note ?? undefined,
  }))
}

function calculateBalance(transactions: CoinTransaction[]) {
  return transactions.reduce((sum, transaction) => sum + transaction.amount, 0)
}

export function getCoins(): CoinsData {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT id, amount, type, description, timestamp, related_item_id, note
    FROM coin_transactions
    ORDER BY timestamp DESC, id DESC
  `).all() as TransactionRow[]

  const transactions = mapTransactions(rows)

  return {
    balance: calculateBalance(transactions),
    transactions,
  }
}

export function saveCoinSnapshot(data: CoinsData) {
  return withTransaction((db) => {
    const incomingIds = new Set(data.transactions.map((transaction) => transaction.id))

    for (const transaction of data.transactions) {
      db.prepare(`
        INSERT INTO coin_transactions (
          id,
          amount,
          type,
          description,
          timestamp,
          related_item_id,
          note
        ) VALUES (
          @id,
          @amount,
          @type,
          @description,
          @timestamp,
          @related_item_id,
          @note
        )
        ON CONFLICT(id) DO UPDATE SET
          amount = excluded.amount,
          type = excluded.type,
          description = excluded.description,
          timestamp = excluded.timestamp,
          related_item_id = excluded.related_item_id,
          note = excluded.note
      `).run({
        id: transaction.id,
        amount: transaction.amount,
        type: transaction.type,
        description: transaction.description,
        timestamp: transaction.timestamp,
        related_item_id: transaction.relatedItemId ?? null,
        note: transaction.note ?? null,
      })
    }

    const existingIds = db.prepare('SELECT id FROM coin_transactions').all().map((row) => (row as { id: string }).id)
    for (const existingId of existingIds) {
      if (!incomingIds.has(existingId)) {
        db.prepare('DELETE FROM coin_transactions WHERE id = ?').run(existingId)
      }
    }
  })
}

export function insertCoinTransaction(transaction: CoinTransaction) {
  const db = getDatabase()
  db.prepare(`
    INSERT INTO coin_transactions (
      id,
      amount,
      type,
      description,
      timestamp,
      related_item_id,
      note
    ) VALUES (
      @id,
      @amount,
      @type,
      @description,
      @timestamp,
      @related_item_id,
      @note
    )
  `).run({
    id: transaction.id,
    amount: transaction.amount,
    type: transaction.type,
    description: transaction.description,
    timestamp: transaction.timestamp,
    related_item_id: transaction.relatedItemId ?? null,
    note: transaction.note ?? null,
  })
}

export function updateTransactionNoteRecord(transactionId: string, note?: string) {
  const db = getDatabase()
  const existing = db
    .prepare('SELECT id FROM coin_transactions WHERE id = ?')
    .get(transactionId) as { id: string } | undefined

  if (!existing) {
    throw new Error('Transaction not found')
  }

  db.prepare(`
    UPDATE coin_transactions
    SET note = ?
    WHERE id = ?
  `).run(note || null, transactionId)
}
