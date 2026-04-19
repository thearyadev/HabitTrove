import { useAtom } from 'jotai'
import { useTranslations } from 'next-intl'
import { habitsAtom, settingsAtom, habitFreqMapAtom } from '@/lib/atoms'
import { addCoins, saveHabitsData } from '@/app/actions/data'
import { Habit, HabitCompletion } from '@/lib/types'
import { toast } from '@/hooks/use-toast'
import { DateTime } from 'luxon'
import {
  calculateQuantityHabitCoins,
  d2s,
  d2t,
  getCompletionCountForDate,
  getISODate,
  getNow,
  getNowInMilliseconds,
  getTodayInTimezone,
  isQuantityHabit,
  normalizeHabitCompletion,
  playSound,
} from '@/lib/utils'

type CompleteHabitOptions = {
  quantity?: number
  completedAt?: string
}

function getCompletionId() {
  return globalThis.crypto?.randomUUID?.() ?? `${getNowInMilliseconds()}-${Math.random().toString(36).slice(2, 10)}`
}

function formatQuantityValue(quantity: number) {
  return Number.isInteger(quantity) ? quantity.toString() : quantity.toFixed(2).replace(/\.?0+$/, '')
}

function normalizeCompletions(completions: Habit['completions']): HabitCompletion[] {
  return completions.map((completion, index) => normalizeHabitCompletion(completion, index))
}

function sanitizeHabit(habit: Habit): Habit {
  const trackingMode = habit.trackingMode === 'quantity' ? 'quantity' : 'standard'

  return {
    ...habit,
    trackingMode,
    completions: normalizeCompletions(habit.completions),
    quantityUnit: trackingMode === 'quantity' ? habit.quantityUnit?.trim() : undefined,
    baseRate: trackingMode === 'quantity' ? habit.baseRate : undefined,
    baseUnit: trackingMode === 'quantity' ? habit.baseUnit : undefined,
    bonusThreshold: trackingMode === 'quantity' ? habit.bonusThreshold : undefined,
    scaleFactor: trackingMode === 'quantity' ? habit.scaleFactor : undefined,
  }
}

export function useHabits() {
  const t = useTranslations('useHabits')
  const [habitsData, setHabitsData] = useAtom(habitsAtom)
  const [settings] = useAtom(settingsAtom)
  const [habitFreqMap] = useAtom(habitFreqMapAtom)

  const persistHabitUpdate = async (updatedHabit: Habit) => {
    const sanitizedHabit = sanitizeHabit(updatedHabit)
    const updatedHabits = habitsData.habits.map((habit) =>
      habit.id === sanitizedHabit.id ? sanitizedHabit : habit
    )

    await saveHabitsData({ habits: updatedHabits })
    setHabitsData({ habits: updatedHabits })

    return { sanitizedHabit, updatedHabits }
  }

  const completeHabit = async (habit: Habit, options?: CompleteHabitOptions) => {
    const timezone = settings.system.timezone
    const today = getTodayInTimezone(timezone)
    const completionsToday = getCompletionCountForDate({
      habit,
      date: today,
      timezone,
    })
    const target = habit.targetCompletions || 1

    if (completionsToday >= target) {
      toast({
        title: t('alreadyCompletedTitle'),
        description: t('alreadyCompletedDescription'),
        variant: 'destructive',
      })
      return
    }

    if (isQuantityHabit(habit)) {
      const quantity = options?.quantity

      if (typeof quantity !== 'number' || Number.isNaN(quantity) || quantity <= 0) {
        toast({
          title: t('quantityRequiredTitle'),
          description: t('quantityRequiredDescription'),
          variant: 'destructive',
        })
        return
      }

      const coinsAwarded = calculateQuantityHabitCoins(habit, quantity)
      const newCompletion: HabitCompletion = {
        id: getCompletionId(),
        completedAt: options?.completedAt ?? d2t({ dateTime: getNow({ timezone }) }),
        quantity,
        coinsAwarded,
      }

      const updatedHabit: Habit = {
        ...habit,
        completions: [...normalizeCompletions(habit.completions), newCompletion],
        archived: habit.isTask && completionsToday + 1 === target ? true : habit.archived,
      }

      const { updatedHabits } = await persistHabitUpdate(updatedHabit)
      const updatedCoins = await addCoins({
        amount: coinsAwarded,
        description: `Completed: ${habit.name} (${formatQuantityValue(quantity)} ${habit.quantityUnit})`,
        type: habit.isTask ? 'TASK_COMPLETION' : 'HABIT_COMPLETION',
        relatedItemId: habit.id,
      })

      if (completionsToday + 1 === target) {
        playSound()
      }

      toast({
        title: t('completedTitle'),
        description: t('earnedQuantityCoinsDescription', {
          quantity: formatQuantityValue(quantity),
          unit: habit.quantityUnit ?? '',
          coinReward: coinsAwarded,
        }),
      })

      return {
        updatedHabits,
        newBalance: updatedCoins.primaryBalance,
        newTransactions: updatedCoins.transactions,
      }
    }

    const updatedHabit: Habit = {
      ...habit,
      completions: [
        ...normalizeCompletions(habit.completions),
        {
          id: getCompletionId(),
          completedAt: d2t({ dateTime: getNow({ timezone }) }),
        },
      ],
      archived: habit.isTask && completionsToday + 1 === target ? true : habit.archived,
    }

    const { updatedHabits } = await persistHabitUpdate(updatedHabit)
    const isTargetReached = completionsToday + 1 === target

    if (isTargetReached) {
      const updatedCoins = await addCoins({
        amount: habit.coinReward,
        description: `Completed: ${habit.name}`,
        type: habit.isTask ? 'TASK_COMPLETION' : 'HABIT_COMPLETION',
        relatedItemId: habit.id,
      })
      playSound()
      toast({
        title: t('completedTitle'),
        description: t('earnedCoinsDescription', { coinReward: habit.coinReward }),
      })
 
      return {
        updatedHabits,
        newBalance: updatedCoins.primaryBalance,
        newTransactions: updatedCoins.transactions,
      }
    } else {
      toast({
        title: t('progressTitle'),
        description: t('progressDescription', { count: completionsToday + 1, target }),
      })

      return {
        updatedHabits,
        newBalance: 0,
        newTransactions: [],
      }
    }
  }

  const saveHabit = async (habit: Omit<Habit, 'id'> & { id?: string }) => {
    const newHabit = sanitizeHabit({
      ...habit,
      id: habit.id || getNowInMilliseconds().toString(),
    })
    const updatedHabits = habit.id
      ? habitsData.habits.map((currentHabit) => currentHabit.id === habit.id ? newHabit : currentHabit)
      : [...habitsData.habits, newHabit]

    await saveHabitsData({ habits: updatedHabits })
    setHabitsData({ habits: updatedHabits })
    return updatedHabits
  }

  const deleteHabit = async (id: string) => {
    const updatedHabits = habitsData.habits.filter((habit) => habit.id !== id)
    await saveHabitsData({ habits: updatedHabits })
    setHabitsData({ habits: updatedHabits })
    return updatedHabits
  }

  const completePastHabit = async (habit: Habit, date: DateTime) => {
    if (isQuantityHabit(habit)) {
      toast({
        title: t('quantityBackfillDisabledTitle'),
        description: t('quantityBackfillDisabledDescription'),
        variant: 'destructive',
      })
      return
    }

    const timezone = settings.system.timezone
    const dateKey = getISODate({ dateTime: date, timezone })
    const completionsOnDate = getCompletionCountForDate({
      habit,
      date,
      timezone,
    })
    const target = habit.targetCompletions || 1

    if (completionsOnDate >= target) {
      toast({
        title: t('alreadyCompletedPastDateTitle'),
        description: t('alreadyCompletedPastDateDescription', {
          dateKey: d2s({ dateTime: date, timezone, format: 'yyyy-MM-dd' })
        }),
        variant: 'destructive',
      })
      return
    }

    const now = getNow({ timezone })
    const completionDateTime = date.set({
      hour: now.hour,
      minute: now.minute,
      second: now.second,
      millisecond: now.millisecond,
    })
    const updatedHabit: Habit = {
      ...habit,
      completions: [
        ...normalizeCompletions(habit.completions),
        {
          id: getCompletionId(),
          completedAt: d2t({ dateTime: completionDateTime }),
        },
      ],
    }

    const { updatedHabits } = await persistHabitUpdate(updatedHabit)
    const isTargetReached = completionsOnDate + 1 === target

    if (isTargetReached) {
      const updatedCoins = await addCoins({
        amount: habit.coinReward,
        description: `Completed: ${habit.name} on ${d2s({ dateTime: date, timezone, format: 'yyyy-MM-dd' })}`,
        type: habit.isTask ? 'TASK_COMPLETION' : 'HABIT_COMPLETION',
        relatedItemId: habit.id,
      })

      toast({
        title: t('completedTitle'),
        description: t('earnedCoinsPastDateDescription', { coinReward: habit.coinReward, dateKey }),
      })

      return {
        updatedHabits,
        newBalance: updatedCoins.primaryBalance,
        newTransactions: updatedCoins.transactions,
      }
    }

    toast({
      title: isTargetReached ? t('completedTitle') : t('progressTitle'),
      description: isTargetReached
        ? t('earnedCoinsPastDateDescription', { coinReward: habit.coinReward, dateKey })
        : t('progressPastDateDescription', { count: completionsOnDate + 1, target, dateKey }),
    })

    return {
      updatedHabits,
      newBalance: 0,
      newTransactions: [],
    }
  }

  const archiveHabit = async (id: string) => {
    const updatedHabits = habitsData.habits.map((habit) =>
      habit.id === id ? { ...habit, archived: true } : habit
    )
    await saveHabitsData({ habits: updatedHabits })
    setHabitsData({ habits: updatedHabits })
  }

  const unarchiveHabit = async (id: string) => {
    const updatedHabits = habitsData.habits.map((habit) =>
      habit.id === id ? { ...habit, archived: false } : habit
    )
    await saveHabitsData({ habits: updatedHabits })
    setHabitsData({ habits: updatedHabits })
  }

  return {
    completeHabit,
    saveHabit,
    deleteHabit,
    completePastHabit,
    archiveHabit,
    unarchiveHabit,
    habitFreqMap,
  }
}
