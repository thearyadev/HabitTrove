import { z } from 'zod'
import { MAX_COIN_LIMIT } from '@/lib/constants'
import { Habit, RewardDefinition } from '@/lib/types'

export const BULK_EDIT_SCHEMA_VERSION = 2

const optionalTrimmedString = z.string().trim().min(1).optional()
const optionalUrlString = z.string().trim().optional().refine((value) => {
  if (!value) {
    return true
  }

  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}, 'Link must be a valid URL.')

const bulkEditHabitSchema = z.object({
  id: optionalTrimmedString,
  name: z.string().trim().min(1, 'Name is required.'),
  description: z.string().default(''),
  frequency: z.string().trim().min(1, 'Frequency is required.'),
  coinReward: z.number().int().min(1).max(MAX_COIN_LIMIT),
  trackingMode: z.enum(['standard', 'quantity']).default('standard'),
  quantityUnit: optionalTrimmedString,
  baseRate: z.number().positive().optional(),
  baseUnit: z.number().positive().optional(),
  bonusThreshold: z.number().positive().optional(),
  scaleFactor: z.number().gt(1).optional(),
  targetCompletions: z.number().int().min(1).optional(),
  archived: z.boolean().optional(),
  pinned: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.trackingMode !== 'quantity') {
    return
  }

  if (!value.quantityUnit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Quantity habits require `quantityUnit`.',
      path: ['quantityUnit'],
    })
  }

  if (value.baseRate === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Quantity habits require `baseRate`.',
      path: ['baseRate'],
    })
  }

  if (value.baseUnit === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Quantity habits require `baseUnit`.',
      path: ['baseUnit'],
    })
  }

  if (value.bonusThreshold === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Quantity habits require `bonusThreshold`.',
      path: ['bonusThreshold'],
    })
  }

  if (value.scaleFactor === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Quantity habits require `scaleFactor`.',
      path: ['scaleFactor'],
    })
  }
})

const bulkEditRewardTierSchema = z.object({
  id: optionalTrimmedString,
  name: z.string().trim().min(1, 'Tier name is required.'),
  coinCost: z.number().int().min(1).max(MAX_COIN_LIMIT),
  position: z.number().int().min(0).optional(),
})

const bulkEditRewardRedemptionRuleSchema = z.object({
  window: z.enum(['unlimited', 'daily', 'weekly', 'monthly']),
  maxRedemptions: z.number().int().min(1).optional(),
}).superRefine((value, ctx) => {
  if (value.window === 'unlimited') {
    return
  }

  if (value.maxRedemptions === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Limited rewards require `maxRedemptions`.',
      path: ['maxRedemptions'],
    })
  }
})

const bulkEditRewardSchema = z.object({
  id: optionalTrimmedString,
  name: z.string().trim().min(1, 'Name is required.'),
  description: z.string().default(''),
  archived: z.boolean().optional(),
  link: optionalUrlString,
  redemptionRule: bulkEditRewardRedemptionRuleSchema,
  tiers: z.array(bulkEditRewardTierSchema).min(1, 'Rewards require at least one tier.'),
}).superRefine((value, ctx) => {
  const tierIds = new Set<string>()

  value.tiers.forEach((tier, index) => {
    if (!tier.id) {
      return
    }

    if (tierIds.has(tier.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate tier id \`${tier.id}\`.`,
        path: ['tiers', index, 'id'],
      })
      return
    }

    tierIds.add(tier.id)
  })
})

export const bulkEditPayloadSchema = z.object({
  schemaVersion: z.literal(BULK_EDIT_SCHEMA_VERSION),
  exportedAt: z.string().datetime().optional(),
  habits: z.array(bulkEditHabitSchema),
  tasks: z.array(bulkEditHabitSchema),
  rewards: z.array(bulkEditRewardSchema),
}).superRefine((value, ctx) => {
  const activeHabitIds = new Set<string>()
  const rewardIds = new Set<string>()

  for (const [section, records] of [
    ['habits', value.habits],
    ['tasks', value.tasks],
  ] as const) {
    records.forEach((record, index) => {
      if (!record.id) {
        return
      }

      if (activeHabitIds.has(record.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate id \`${record.id}\` found across habits/tasks.`,
          path: [section, index, 'id'],
        })
        return
      }

      activeHabitIds.add(record.id)
    })
  }

  value.rewards.forEach((record, index) => {
    if (!record.id) {
      return
    }

    if (rewardIds.has(record.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate reward id \`${record.id}\`.`,
        path: ['rewards', index, 'id'],
      })
      return
    }

    rewardIds.add(record.id)
  })
})

export type BulkEditHabitRecord = z.infer<typeof bulkEditHabitSchema>
export type BulkEditRewardRecord = z.infer<typeof bulkEditRewardSchema>
export type BulkEditPayload = z.infer<typeof bulkEditPayloadSchema>

function matchesCurrentQuantityFormula(record: BulkEditHabitRecord, habit: Habit) {
  return record.quantityUnit === habit.quantityUnit
    && record.baseRate === habit.baseRate
    && record.baseUnit === habit.baseUnit
    && record.bonusThreshold === habit.bonusThreshold
    && record.scaleFactor === habit.scaleFactor
}

function reconcileQuantityHabitReward(record: BulkEditHabitRecord, currentHabit?: Habit): BulkEditHabitRecord {
  if (record.trackingMode !== 'quantity' || !currentHabit || currentHabit.trackingMode !== 'quantity') {
    return record
  }

  if (!matchesCurrentQuantityFormula(record, currentHabit) || record.coinReward === currentHabit.coinReward) {
    return record
  }

  const baseUnit = record.baseUnit ?? currentHabit.baseUnit ?? 1

  return {
    ...record,
    baseRate: record.coinReward * baseUnit,
  }
}

export function reconcileBulkEditPayloadWithCurrentCatalog(payload: BulkEditPayload, habits: Habit[]): BulkEditPayload {
  const currentHabitsById = new Map(habits.map((habit) => [habit.id, habit] as const))

  return {
    ...payload,
    habits: payload.habits.map((habit) => reconcileQuantityHabitReward(habit, habit.id ? currentHabitsById.get(habit.id) : undefined)),
    tasks: payload.tasks.map((task) => reconcileQuantityHabitReward(task, task.id ? currentHabitsById.get(task.id) : undefined)),
  }
}

export function createBulkEditPayload({
  habits,
  rewards,
}: {
  habits: Habit[]
  rewards: RewardDefinition[]
}): BulkEditPayload {
  return {
    schemaVersion: BULK_EDIT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    habits: habits
      .filter((habit) => !habit.isTask)
      .map((habit) => mapHabitToBulkRecord(habit)),
    tasks: habits
      .filter((habit) => habit.isTask)
      .map((habit) => mapHabitToBulkRecord(habit)),
    rewards: rewards.map((reward) => ({
      id: reward.id,
      name: reward.name,
      description: reward.description,
      archived: reward.archived ?? false,
      link: reward.link,
      redemptionRule: {
        window: reward.redemptionRule.window,
        maxRedemptions: reward.redemptionRule.maxRedemptions,
      },
      tiers: reward.tiers.map((tier, index) => ({
        id: tier.id,
        name: tier.name,
        coinCost: tier.coinCost,
        position: tier.position ?? index,
      })),
    })),
  }
}

function mapHabitToBulkRecord(habit: Habit): BulkEditHabitRecord {
  return {
    id: habit.id,
    name: habit.name,
    description: habit.description,
    frequency: habit.frequency,
    coinReward: habit.coinReward,
    trackingMode: habit.trackingMode ?? 'standard',
    quantityUnit: habit.quantityUnit,
    baseRate: habit.baseRate,
    baseUnit: habit.baseUnit,
    bonusThreshold: habit.bonusThreshold,
    scaleFactor: habit.scaleFactor,
    targetCompletions: habit.targetCompletions,
    archived: habit.archived ?? false,
    pinned: habit.pinned ?? false,
  }
}

export function parseBulkEditJson(input: string) {
  const parsed = JSON.parse(input)
  return bulkEditPayloadSchema.parse(parsed)
}

export function formatBulkEditValidationError(error: unknown): string[] {
  if (!(error instanceof z.ZodError)) {
    if (error instanceof SyntaxError) {
      return [error.message]
    }

    return ['Unable to validate the JSON payload.']
  }

  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'payload'
    return `${path}: ${issue.message}`
  })
}
