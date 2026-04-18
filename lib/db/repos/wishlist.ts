import { getDatabase, withTransaction } from '@/lib/db/client'
import {
  RewardDefinition,
  RewardLimitWindow,
  RewardTier,
  WishlistData,
} from '@/lib/types'

type RewardRow = {
  id: string
  name: string
  description: string
  archived: number
  link: string | null
  drawing: string | null
  limit_window: RewardLimitWindow
  max_redemptions: number | null
}

type RewardTierRow = {
  id: string
  reward_id: string
  name: string
  coin_cost: number
  position: number
}

function hydrateRewards(rows: RewardRow[], tierRows: RewardTierRow[]): RewardDefinition[] {
  const tiersByRewardId = new Map<string, RewardTier[]>()

  for (const tierRow of tierRows) {
    const tiers = tiersByRewardId.get(tierRow.reward_id) ?? []
    tiers.push({
      id: tierRow.id,
      name: tierRow.name,
      coinCost: tierRow.coin_cost,
      position: tierRow.position,
    })
    tiersByRewardId.set(tierRow.reward_id, tiers)
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    archived: row.archived === 1,
    link: row.link ?? undefined,
    drawing: row.drawing ?? undefined,
    redemptionRule: {
      window: row.limit_window,
      maxRedemptions: row.max_redemptions ?? undefined,
    },
    tiers: (tiersByRewardId.get(row.id) ?? []).sort((a, b) => a.position - b.position),
  }))
}

function upsertRewards(
  db: ReturnType<typeof getDatabase>,
  rewards: RewardDefinition[],
  options: { softDeleteMissing: boolean }
) {
  const incomingRewardIds = new Set(rewards.map((reward) => reward.id))

  for (const reward of rewards) {
    const existing = db
      .prepare('SELECT created_at FROM rewards WHERE id = ?')
      .get(reward.id) as { created_at: string } | undefined

    db.prepare(`
      INSERT INTO rewards (
        id,
        name,
        description,
        archived,
        link,
        drawing,
        limit_window,
        max_redemptions,
        created_at,
        deleted_at
      ) VALUES (
        @id,
        @name,
        @description,
        @archived,
        @link,
        @drawing,
        @limit_window,
        @max_redemptions,
        @created_at,
        NULL
      )
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        archived = excluded.archived,
        link = excluded.link,
        drawing = excluded.drawing,
        limit_window = excluded.limit_window,
        max_redemptions = excluded.max_redemptions,
        deleted_at = NULL
    `).run({
      id: reward.id,
      name: reward.name,
      description: reward.description,
      archived: reward.archived ? 1 : 0,
      link: reward.link ?? null,
      drawing: reward.drawing ?? null,
      limit_window: reward.redemptionRule.window,
      max_redemptions:
        reward.redemptionRule.window === 'unlimited'
          ? null
          : reward.redemptionRule.maxRedemptions ?? 1,
      created_at: existing?.created_at ?? new Date().toISOString(),
    })

    const incomingTierIds = new Set(reward.tiers.map((tier) => tier.id))

    for (const tier of reward.tiers) {
      const existingTier = db
        .prepare('SELECT created_at FROM reward_tiers WHERE id = ?')
        .get(tier.id) as { created_at: string } | undefined

      db.prepare(`
        INSERT INTO reward_tiers (
          id,
          reward_id,
          name,
          coin_cost,
          position,
          created_at,
          deleted_at
        ) VALUES (
          @id,
          @reward_id,
          @name,
          @coin_cost,
          @position,
          @created_at,
          NULL
        )
        ON CONFLICT(id) DO UPDATE SET
          reward_id = excluded.reward_id,
          name = excluded.name,
          coin_cost = excluded.coin_cost,
          position = excluded.position,
          deleted_at = NULL
      `).run({
        id: tier.id,
        reward_id: reward.id,
        name: tier.name,
        coin_cost: tier.coinCost,
        position: tier.position,
        created_at: existingTier?.created_at ?? new Date().toISOString(),
      })
    }

    const existingTierIds = db.prepare(`
      SELECT id
      FROM reward_tiers
      WHERE reward_id = ? AND deleted_at IS NULL
    `).all(reward.id) as Array<{ id: string }>

    const deletedAt = new Date().toISOString()
    for (const existingTierId of existingTierIds) {
      if (!incomingTierIds.has(existingTierId.id)) {
        db.prepare(`
          UPDATE reward_tiers
          SET deleted_at = ?
          WHERE id = ?
        `).run(deletedAt, existingTierId.id)
      }
    }
  }

  if (!options.softDeleteMissing) {
    return
  }

  const existingRewardIds = db.prepare(`
    SELECT id
    FROM rewards
    WHERE deleted_at IS NULL
  `).all() as Array<{ id: string }>

  const deletedAt = new Date().toISOString()
  for (const existingRewardId of existingRewardIds) {
    if (!incomingRewardIds.has(existingRewardId.id)) {
      db.prepare(`
        UPDATE rewards
        SET deleted_at = ?, archived = 1
        WHERE id = ?
      `).run(deletedAt, existingRewardId.id)

      db.prepare(`
        UPDATE reward_tiers
        SET deleted_at = ?
        WHERE reward_id = ? AND deleted_at IS NULL
      `).run(deletedAt, existingRewardId.id)
    }
  }
}

export function getWishlist(): WishlistData {
  const db = getDatabase()
  const rewardRows = db.prepare(`
    SELECT id, name, description, archived, link, drawing, limit_window, max_redemptions
    FROM rewards
    WHERE deleted_at IS NULL
    ORDER BY archived ASC, created_at DESC
  `).all() as RewardRow[]

  const tierRows = db.prepare(`
    SELECT id, reward_id, name, coin_cost, position
    FROM reward_tiers
    WHERE deleted_at IS NULL
    ORDER BY position ASC, created_at ASC
  `).all() as RewardTierRow[]

  return {
    rewards: hydrateRewards(rewardRows, tierRows),
  }
}

export function saveWishlist(data: WishlistData) {
  return withTransaction((db) => {
    upsertRewards(db, data.rewards, { softDeleteMissing: true })
  })
}

export function syncWishlistDefinitions(
  db: ReturnType<typeof getDatabase>,
  rewards: RewardDefinition[]
) {
  upsertRewards(db, rewards, { softDeleteMissing: true })
}
