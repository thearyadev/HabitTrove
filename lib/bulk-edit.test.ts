import { describe, expect, test } from 'bun:test'
import {
  createBulkEditPayload,
  parseBulkEditJson,
  reconcileBulkEditPayloadWithCurrentCatalog,
} from '@/lib/bulk-edit'

describe('bulk edit payload', () => {
  test('splits habits and tasks during export', () => {
    const payload = createBulkEditPayload({
      habits: [
        {
          id: 'habit-1',
          name: 'Read',
          description: '',
          frequency: 'FREQ=DAILY',
          coinReward: 5,
          completions: [],
        },
        {
          id: 'task-1',
          name: 'Ship feature',
          description: '',
          frequency: '2026-04-18T10:00:00.000Z',
          coinReward: 15,
          completions: [],
          isTask: true,
        },
      ],
      rewards: [
        {
          id: 'reward-1',
          name: 'Coffee',
          description: '',
          coinCost: 25,
        },
      ],
    })

    expect(payload.habits).toHaveLength(1)
    expect(payload.tasks).toHaveLength(1)
    expect(payload.rewards).toHaveLength(1)
    expect(payload.tasks[0]?.id).toBe('task-1')
  })

  test('rejects duplicate ids across habits and tasks', () => {
    expect(() => parseBulkEditJson(JSON.stringify({
      schemaVersion: 1,
      habits: [
        {
          id: 'shared',
          name: 'Read',
          description: '',
          frequency: 'FREQ=DAILY',
          coinReward: 5,
        },
      ],
      tasks: [
        {
          id: 'shared',
          name: 'Ship feature',
          description: '',
          frequency: '2026-04-18T10:00:00.000Z',
          coinReward: 15,
        },
      ],
      rewards: [],
    }))).toThrow(/Duplicate id/)
  })

  test('rejects incomplete quantity habits', () => {
    expect(() => parseBulkEditJson(JSON.stringify({
      schemaVersion: 1,
      habits: [
        {
          name: 'Run',
          description: '',
          frequency: 'FREQ=DAILY',
          coinReward: 5,
          trackingMode: 'quantity',
        },
      ],
      tasks: [],
      rewards: [],
    }))).toThrow(/quantityUnit/)
  })

  test('maps quantity habit coinReward edits onto the live base rate when the formula is otherwise unchanged', () => {
    const payload = parseBulkEditJson(JSON.stringify({
      schemaVersion: 1,
      habits: [
        {
          id: 'habit-1',
          name: 'Bike',
          description: '',
          frequency: 'FREQ=DAILY',
          coinReward: 10,
          trackingMode: 'quantity',
          quantityUnit: 'km',
          baseRate: 1,
          baseUnit: 1,
          bonusThreshold: 10,
          scaleFactor: 1.5,
        },
      ],
      tasks: [],
      rewards: [],
    }))

    const reconciled = reconcileBulkEditPayloadWithCurrentCatalog(payload, [
      {
        id: 'habit-1',
        name: 'Bike',
        description: '',
        frequency: 'FREQ=DAILY',
        coinReward: 20,
        trackingMode: 'quantity',
        quantityUnit: 'km',
        baseRate: 1,
        baseUnit: 1,
        bonusThreshold: 10,
        scaleFactor: 1.5,
        completions: [],
      },
    ])

    expect(reconciled.habits[0]?.baseRate).toBe(10)
  })
})
