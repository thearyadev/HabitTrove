import { getDatabase, withTransaction } from '@/lib/db/client'
import { WishlistData, WishlistItemType } from '@/lib/types'

type WishlistRow = {
  id: string
  name: string
  description: string
  coin_cost: number
  archived: number
  target_completions: number | null
  link: string | null
  drawing: string | null
}

function hydrateItems(rows: WishlistRow[]): WishlistItemType[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    coinCost: row.coin_cost,
    archived: row.archived === 1,
    targetCompletions: row.target_completions ?? undefined,
    link: row.link ?? undefined,
    drawing: row.drawing ?? undefined,
  }))
}

export function getWishlist(): WishlistData {
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT id, name, description, coin_cost, archived, target_completions, link, drawing
    FROM wishlist_items
    ORDER BY archived ASC, created_at DESC
  `).all() as WishlistRow[]

  return {
    items: hydrateItems(rows),
  }
}

export function saveWishlist(data: WishlistData) {
  return withTransaction((db) => {
    const incomingIds = new Set(data.items.map((item) => item.id))

    for (const item of data.items) {
      const createdAt = db
        .prepare('SELECT created_at FROM wishlist_items WHERE id = ?')
        .get(item.id) as { created_at: string } | undefined

      db.prepare(`
        INSERT INTO wishlist_items (
          id,
          name,
          description,
          coin_cost,
          archived,
          target_completions,
          link,
          drawing,
          created_at
        ) VALUES (
          @id,
          @name,
          @description,
          @coin_cost,
          @archived,
          @target_completions,
          @link,
          @drawing,
          @created_at
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          coin_cost = excluded.coin_cost,
          archived = excluded.archived,
          target_completions = excluded.target_completions,
          link = excluded.link,
          drawing = excluded.drawing
      `).run({
        id: item.id,
        name: item.name,
        description: item.description,
        coin_cost: item.coinCost,
        archived: item.archived ? 1 : 0,
        target_completions: item.targetCompletions ?? null,
        link: item.link ?? null,
        drawing: item.drawing ?? null,
        created_at: createdAt?.created_at ?? new Date().toISOString(),
      })
    }

    const existingIds = db.prepare('SELECT id FROM wishlist_items').all().map((row) => (row as { id: string }).id)
    for (const existingId of existingIds) {
      if (!incomingIds.has(existingId)) {
        db.prepare('DELETE FROM wishlist_items WHERE id = ?').run(existingId)
      }
    }
  })
}
