'use client'

import { useState, useMemo, useCallback } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import CompletionCountBadge from '@/components/CompletionCountBadge'
import { Circle, CircleCheck } from 'lucide-react'
import { d2s, getNow, isHabitDue, getISODate, getCompletionsForDate, isQuantityHabit } from '@/lib/utils'
import { useAtom } from 'jotai'
import { useTranslations } from 'next-intl'
import { useHabits } from '@/hooks/useHabits'
import { habitsAtom, settingsAtom, completedHabitsMapAtom, hasTasksAtom } from '@/lib/atoms'
import { DateTime } from 'luxon'
import Linkify from './linkify'
import { Habit } from '@/lib/types'
import { Button } from './ui/button'
import { Separator } from './ui/separator'

function CompletionButton({
  habit,
  completions,
  isCompleted,
  onComplete,
}: {
  habit: Habit
  completions: number
  isCompleted: boolean
  onComplete: () => void
}) {
  const quantityHabit = isQuantityHabit(habit)

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onComplete}
      disabled={isCompleted || quantityHabit}
      className="h-8 w-8 rounded-md"
      aria-label={quantityHabit ? `Log ${habit.name} from habits view` : `Complete ${habit.name}`}
    >
      {isCompleted ? (
        <CircleCheck className="h-4 w-4 text-emerald-600" />
      ) : (
        <div className="relative h-4 w-4">
          <Circle className="absolute h-4 w-4 text-muted-foreground" />
          <div
            className="absolute h-4 w-4 rounded-full overflow-hidden text-foreground"
            style={{
              background: `conic-gradient(
                currentColor ${(completions / (habit.targetCompletions ?? 1)) * 360}deg,
                transparent ${(completions / (habit.targetCompletions ?? 1)) * 360}deg 360deg
              )`,
              mask: 'radial-gradient(transparent 50%, black 51%)',
              WebkitMask: 'radial-gradient(transparent 50%, black 51%)',
            }}
          />
        </div>
      )}
    </Button>
  )
}

function HabitListSection({
  title,
  badgeType,
  date,
  items,
  timezone,
  selectedDateTime,
  onComplete,
  emptyStateText,
  quantityDisabledText,
}: {
  title: string
  badgeType: 'tasks' | 'habits'
  date: string
  items: Habit[]
  timezone: string
  selectedDateTime: DateTime
  onComplete: (habit: Habit) => void
  emptyStateText: string
  quantityDisabledText: string
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <CompletionCountBadge type={badgeType} date={date} />
      </div>
      {items.length === 0 ? (
        <div className="rounded-md border border-dashed px-3 py-6 text-sm text-muted-foreground">
          {emptyStateText}
        </div>
      ) : (
        <div className="rounded-lg border">
          <ul className="divide-y">
            {items.map((habit) => {
              const completions = getCompletionsForDate({ habit, date: selectedDateTime, timezone })
              const isCompleted = completions >= (habit.targetCompletions || 1)

              return (
                <li key={habit.id} className="flex items-center justify-between gap-3 px-3 py-3">
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm font-medium">
                      <Linkify>{habit.name}</Linkify>
                    </div>
                    {habit.targetCompletions ? (
                      <p className="text-xs text-muted-foreground">
                        {completions}/{habit.targetCompletions} completions
                      </p>
                    ) : null}
                    {isQuantityHabit(habit) ? (
                      <p className="text-xs text-muted-foreground">
                        {quantityDisabledText}
                      </p>
                    ) : null}
                  </div>
                  <CompletionButton
                    habit={habit}
                    completions={completions}
                    isCompleted={isCompleted}
                    onComplete={() => onComplete(habit)}
                  />
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function HabitCalendar() {
  const t = useTranslations('HabitCalendar')
  const { completePastHabit } = useHabits()

  const handleCompletePastHabit = useCallback(async (habit: Habit, date: DateTime) => {
    try {
      await completePastHabit(habit, date)
    } catch (error) {
      console.error(t('errorCompletingPastHabit'), error)
    }
  }, [completePastHabit, t])
  const [settings] = useAtom(settingsAtom)
  const [selectedDateTime, setSelectedDateTime] = useState<DateTime>(getNow({ timezone: settings.system.timezone }))
  const selectedDate = selectedDateTime.toFormat("yyyy-MM-dd")
  const [habitsData] = useAtom(habitsAtom)
  const [hasTasks] = useAtom(hasTasksAtom)
  const habits = habitsData.habits

  const [completedHabitsMap] = useAtom(completedHabitsMapAtom)
  const tasks = habits.filter(habit => habit.isTask && isHabitDue({
    habit,
    timezone: settings.system.timezone,
    date: selectedDateTime,
  }))
  const dueHabits = habits.filter(habit => !habit.isTask && isHabitDue({
    habit,
    timezone: settings.system.timezone,
    date: selectedDateTime,
  }))

  const completedDates = useMemo(() => {
    return new Set(Array.from(completedHabitsMap.keys()).map(date =>
      getISODate({ dateTime: DateTime.fromISO(date), timezone: settings.system.timezone })
    ))
  }, [completedHabitsMap, settings.system.timezone])

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          Review completions by date and backfill missed check-ins.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="self-start">
          <CardHeader>
            <CardTitle>{t('calendarCardTitle')}</CardTitle>
            <CardDescription>{t('calendarCardDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDateTime.toJSDate()}
              onSelect={(e) => e && setSelectedDateTime(DateTime.fromJSDate(e))}
              weekStartsOn={settings.system.weekStartDay}
              className="rounded-md border"
              modifiers={{
                completed: (date) => completedDates.has(
                  getISODate({
                    dateTime: DateTime.fromJSDate(date),
                    timezone: settings.system.timezone
                  })!
                )
              }}
              modifiersClassNames={{
                completed: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
              }}
            />
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>
              {selectedDateTime ? (
                <>{d2s({ dateTime: selectedDateTime, timezone: settings.system.timezone, format: DateTime.DATE_MED_WITH_WEEKDAY })}</>
              ) : (
                t('selectDatePrompt')
              )}
            </CardTitle>
            <CardDescription>
              {t('selectedDateDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[520px] overflow-y-auto">
            {selectedDateTime && (
              <div className="space-y-5">
                {hasTasks && (
                  <>
                    <HabitListSection
                      title={t('tasksSectionTitle')}
                      badgeType="tasks"
                      date={selectedDate.toString()}
                      items={tasks}
                      timezone={settings.system.timezone}
                      selectedDateTime={selectedDateTime}
                      onComplete={(habit) => handleCompletePastHabit(habit, selectedDateTime)}
                      emptyStateText={t('emptyStateText')}
                      quantityDisabledText={t('quantityDisabledText')}
                    />
                    <Separator />
                  </>
                )}
                <HabitListSection
                  title={t('habitsSectionTitle')}
                  badgeType="habits"
                  date={selectedDate.toString()}
                  items={dueHabits}
                  timezone={settings.system.timezone}
                  selectedDateTime={selectedDateTime}
                  onComplete={(habit) => handleCompletePastHabit(habit, selectedDateTime)}
                  emptyStateText={t('emptyStateText')}
                  quantityDisabledText={t('quantityDisabledText')}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
