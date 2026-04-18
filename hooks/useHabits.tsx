import { useAtom } from 'jotai'
import { useTranslations } from 'next-intl'
import { habitsAtom, coinsAtom, settingsAtom, habitFreqMapAtom } from '@/lib/atoms'
import { addCoins, removeCoins, saveHabitsData } from '@/app/actions/data'
import { Habit, HabitCompletion } from '@/lib/types'
import { toast } from '@/hooks/use-toast'
import { DateTime } from 'luxon'
import {
  calculateQuantityHabitCoins,
  d2s,
  d2t,
  getCompletionCountForDate,
  getCompletionRecordsForDate,
  getISODate,
  getNow,
  getNowInMilliseconds,
  getTodayInTimezone,
  isQuantityHabit,
  normalizeHabitCompletion,
  playSound,
  t2d,
} from '@/lib/utils'
import { ToastAction } from '@/components/ui/toast'
import { Undo2 } from 'lucide-react'

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
  const tCommon = useTranslations('Common')
  const [habitsData, setHabitsData] = useAtom(habitsAtom)
  const [coins, setCoins] = useAtom(coinsAtom)
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

      const { sanitizedHabit, updatedHabits } = await persistHabitUpdate(updatedHabit)
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
        action: <ToastAction altText={tCommon('undoButton')} className="gap-2" onClick={() => undoComplete(sanitizedHabit)}>
          <Undo2 className="h-4 w-4" />{tCommon('undoButton')}
        </ToastAction>
      })
      setCoins(updatedCoins)

      return {
        updatedHabits,
        newBalance: coins.balance,
        newTransactions: coins.transactions,
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

    const { sanitizedHabit, updatedHabits } = await persistHabitUpdate(updatedHabit)
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
        action: <ToastAction altText={tCommon('undoButton')} className="gap-2" onClick={() => undoComplete(sanitizedHabit)}>
          <Undo2 className="h-4 w-4" />{tCommon('undoButton')}
        </ToastAction>
      })
      setCoins(updatedCoins)
    } else {
      toast({
        title: t('progressTitle'),
        description: t('progressDescription', { count: completionsToday + 1, target }),
        action: <ToastAction altText={tCommon('undoButton')} className="gap-2" onClick={() => undoComplete(sanitizedHabit)}>
          <Undo2 className="h-4 w-4" />{tCommon('undoButton')}
        </ToastAction>
      })
    }

    return {
      updatedHabits,
      newBalance: coins.balance,
      newTransactions: coins.transactions,
    }
  }

  const undoComplete = async (habit: Habit) => {
    const timezone = settings.system.timezone
    const today = t2d({ timestamp: getTodayInTimezone(timezone), timezone })
    const todayCompletions = getCompletionRecordsForDate({
      habit,
      date: today,
      timezone,
    })

    if (todayCompletions.length === 0) {
      toast({
        title: t('noCompletionsToUndoTitle'),
        description: t('noCompletionsToUndoDescription'),
        variant: 'destructive',
      })
      return
    }

    const completionToRemove = todayCompletions[todayCompletions.length - 1]
    const updatedHabit: Habit = {
      ...habit,
      completions: normalizeCompletions(habit.completions).filter(
        (completion) => completion.id !== completionToRemove.id
      ),
      archived: habit.isTask ? false : habit.archived,
    }

    const { sanitizedHabit, updatedHabits } = await persistHabitUpdate(updatedHabit)
    let updatedCoins = coins

    if (isQuantityHabit(habit)) {
      if (completionToRemove.coinsAwarded) {
        updatedCoins = await removeCoins({
          amount: completionToRemove.coinsAwarded,
          description: `Undid completion: ${habit.name} (${formatQuantityValue(completionToRemove.quantity ?? 0)} ${habit.quantityUnit})`,
          type: habit.isTask ? 'TASK_UNDO' : 'HABIT_UNDO',
          relatedItemId: habit.id,
        })
        setCoins(updatedCoins)
      }

      toast({
        title: t('completionUndoneTitle'),
        description: t('quantityCompletionUndoneDescription', {
          count: getCompletionCountForDate({
            habit: sanitizedHabit,
            date: today,
            timezone,
          }),
          target: habit.targetCompletions || 1,
        }),
        action: completionToRemove.quantity ? (
          <ToastAction
            altText={tCommon('redoButton')}
            onClick={() => completeHabit(sanitizedHabit, {
              quantity: completionToRemove.quantity,
              completedAt: completionToRemove.completedAt,
            })}
          >
            <Undo2 className="h-4 w-4" />{tCommon('redoButton')}
          </ToastAction>
        ) : undefined,
      })

      return {
        updatedHabits,
        newBalance: updatedCoins.balance,
        newTransactions: updatedCoins.transactions,
      }
    }

    const target = habit.targetCompletions || 1
    if (todayCompletions.length === target) {
      updatedCoins = await removeCoins({
        amount: habit.coinReward,
        description: `Undid completion: ${habit.name}`,
        type: habit.isTask ? 'TASK_UNDO' : 'HABIT_UNDO',
        relatedItemId: habit.id,
      })
      setCoins(updatedCoins)
    }

    toast({
      title: t('completionUndoneTitle'),
      description: t('completionUndoneDescription', {
        count: getCompletionCountForDate({
          habit: sanitizedHabit,
          date: today,
          timezone,
        }),
        target,
      }),
      action: <ToastAction altText={tCommon('redoButton')} onClick={() => completeHabit(sanitizedHabit)}>
        <Undo2 className="h-4 w-4" />{tCommon('redoButton')}
      </ToastAction>
    })

    return {
      updatedHabits,
      newBalance: updatedCoins.balance,
      newTransactions: updatedCoins.transactions,
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
      setCoins(updatedCoins)
    }

    toast({
      title: isTargetReached ? t('completedTitle') : t('progressTitle'),
      description: isTargetReached
        ? t('earnedCoinsPastDateDescription', { coinReward: habit.coinReward, dateKey })
        : t('progressPastDateDescription', { count: completionsOnDate + 1, target, dateKey }),
    })

    return {
      updatedHabits,
      newBalance: coins.balance,
      newTransactions: coins.transactions,
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
    undoComplete,
    saveHabit,
    deleteHabit,
    completePastHabit,
    archiveHabit,
    unarchiveHabit,
    habitFreqMap,
  }
}
