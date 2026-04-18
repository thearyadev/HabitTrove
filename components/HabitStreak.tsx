'use client'

import { Habit } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAtom } from 'jotai'
import { useTranslations } from 'next-intl'
import { hasTasksAtom } from '@/lib/atoms'

interface HabitStreakProps {
  habits: Habit[]
}

export default function HabitStreak({ habits }: HabitStreakProps) {
  const t = useTranslations('HabitStreak');
  const [hasTasks] = useAtom(hasTasksAtom)
  const activeItems = habits.filter((habit) => !habit.archived)
  const activeHabits = activeItems.filter((habit) => !habit.isTask)
  const activeTasks = activeItems.filter((habit) => habit.isTask)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dailyCompletionStreakTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/30 px-4 py-3">
          <div className="text-sm font-medium">Current overview</div>
          <div className="text-sm text-foreground">{activeItems.length} live habits/tasks tracked</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border p-4">
            <div className="text-sm text-muted-foreground">{t('tooltipHabitsLabel')}</div>
            <div className="mt-1 text-2xl font-semibold">{activeHabits.length}</div>
          </div>
          <div className="rounded-md border p-4">
            <div className="text-sm text-muted-foreground">{hasTasks ? t('tooltipTasksLabel') : 'Tasks'}</div>
            <div className="mt-1 text-2xl font-semibold">{activeTasks.length}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
