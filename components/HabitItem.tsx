import { Habit } from '@/lib/types'
import { useAtom } from 'jotai'
import { settingsAtom, browserSettingsAtom } from '@/lib/atoms'
import { convertMachineReadableFrequencyToHumanReadable, formatDecimal, getCompletionsForToday, isQuantityHabit, isTaskOverdue } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Coins, Edit, Check, MoreVertical, Pin } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useEffect, useState } from 'react'
import { useHabits } from '@/hooks/useHabits'
import { useTranslations } from 'next-intl'
import { HabitContextMenuItems } from './HabitContextMenuItems'
import LogHabitCompletionModal from './LogHabitCompletionModal'

interface HabitItemProps {
  habit: Habit
  onEdit: () => void
  onDelete: () => void
}

export default function HabitItem({ habit, onEdit, onDelete }: HabitItemProps) {
  const { completeHabit } = useHabits()
  const [settings] = useAtom(settingsAtom)
  const completionsToday = getCompletionsForToday({ habit, timezone: settings.system.timezone })
  const target = habit.targetCompletions || 1
  const isCompletedToday = completionsToday >= target
  const [isHighlighted, setIsHighlighted] = useState(false)
  const [isLogModalOpen, setIsLogModalOpen] = useState(false)
  const t = useTranslations('HabitItem');
  const canWrite = true
  const canInteract = true
  const [browserSettings] = useAtom(browserSettingsAtom)
  const isTasksView = browserSettings.viewType === 'tasks'
  const isRecurRule = !isTasksView
  const quantityHabit = isQuantityHabit(habit)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const highlightId = params.get('highlight')

    if (highlightId === habit.id) {
      setIsHighlighted(true)
      // Scroll the element into view after a short delay to ensure rendering
      setTimeout(() => {
        const element = document.getElementById(`habit-${habit.id}`)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
      // Remove highlight after animation
      const timer = setTimeout(() => setIsHighlighted(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [habit.id])

  return (
    <>
      <Card
        id={`habit-${habit.id}`}
        className={`h-full flex flex-col transition-all duration-500 ${isHighlighted ? 'bg-yellow-100 dark:bg-yellow-900' : ''} ${habit.archived ? 'opacity-75' : ''}`}
      >
        <CardHeader className="flex-shrink-0">
          <div className="flex justify-between items-start">
            <CardTitle className={`line-clamp-1 ${habit.archived ? 'text-gray-400 dark:text-gray-500' : ''} flex items-center ${isTasksView ? 'w-full' : ''} justify-between`}>
              <div className="flex items-center gap-1">
                {habit.pinned && (
                  <Pin className="h-4 w-4 text-yellow-500" />
                )}
                <span>{habit.name}</span>
              </div>
              {isTaskOverdue(habit, settings.system.timezone) && (
                <span className="ml-2 inline-flex items-center rounded-md bg-red-50 dark:bg-red-900/30 px-2 py-1 text-xs font-medium text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-600/10 dark:ring-red-500/20">
                  {t('overdue')}
                </span>
              )}
            </CardTitle>
          </div>
          {habit.description && (
            <div className="mt-2">
              <CardDescription className={`whitespace-pre-line flex-1 min-w-0 break-words ${habit.archived ? 'text-gray-400 dark:text-gray-500' : ''}`}>
                {habit.description}
              </CardDescription>
            </div>
          )}
        </CardHeader>
        <CardContent className="flex-grow flex flex-col justify-end">
          <div className="mt-auto">
            <p className={`text-sm ${habit.archived ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500'}`}>
              {t('whenLabel', {
                frequency: convertMachineReadableFrequencyToHumanReadable({
                  frequency: habit.frequency,
                  isRecurRule,
                  timezone: settings.system.timezone
                })
              })}
            </p>
            <div className="mt-2">
              <div className="flex items-center">
                <Coins className={`h-4 w-4 mr-1 ${habit.archived ? 'text-gray-400 dark:text-gray-500' : 'text-yellow-400'}`} />
                <span className={`text-sm font-medium ${habit.archived ? 'text-gray-400 dark:text-gray-500' : ''}`}>
                  {quantityHabit
                    ? t('coinsPerQuantity', {
                      baseRate: formatDecimal(habit.baseRate ?? 0),
                      unit: habit.quantityUnit ?? '',
                    })
                    : t('coinsPerCompletion', { count: formatDecimal(habit.coinReward) })}
                </span>
              </div>
              {quantityHabit && (
                <p className={`mt-1 text-xs ${habit.archived ? 'text-gray-400 dark:text-gray-500' : 'text-muted-foreground'}`}>
                  {t('quantityBonusHint', {
                    threshold: formatDecimal(habit.bonusThreshold ?? 0),
                    unit: habit.quantityUnit ?? '',
                    scaleFactor: formatDecimal(habit.scaleFactor ?? 1),
                  })}
                </p>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex-shrink-0 flex justify-between gap-2">
          <div className="flex gap-2">
            <div className="relative">
              <Button
                variant={isCompletedToday ? "secondary" : "default"}
                size="sm"
                onClick={async () => {
                  if (quantityHabit) {
                    setIsLogModalOpen(true)
                    return
                  }

                  await completeHabit(habit)
                }}
                disabled={!canInteract || habit.archived || (isCompletedToday && completionsToday >= target)}
                className={`overflow-hidden w-24 sm:w-auto ${habit.archived ? 'cursor-not-allowed' : ''}`}
              >
                <Check className="h-4 w-4 sm:mr-2" />
                <span>
                  {isCompletedToday ? (
                    target > 1 ? (
                      <>
                        <span className="sm:hidden">{t('completedStatusCountMobile', { completed: completionsToday, target })}</span>
                        <span className="hidden sm:inline">{t('completedStatusCount', { completed: completionsToday, target })}</span>
                      </>
                    ) : (
                      t('completedStatus')
                    )
                  ) : (
                    target > 1 ? (
                      <>
                        <span className="sm:hidden">{quantityHabit ? t('logButtonCountMobile', { completed: completionsToday, target }) : t('completeButtonCountMobile', { completed: completionsToday, target })}</span>
                        <span className="hidden sm:inline">{quantityHabit ? t('logButtonCount', { completed: completionsToday, target }) : t('completeButtonCount', { completed: completionsToday, target })}</span>
                      </>
                    ) : (
                      quantityHabit ? t('logButton') : t('completeButton')
                    )
                  )}
                </span>
                {habit.targetCompletions && habit.targetCompletions > 1 && (
                  <div
                    className="absolute bottom-0 left-0 h-1 bg-white/50"
                    style={{
                      width: `${(completionsToday / target) * 100}%`
                    }}
                  />
                )}
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            {!habit.archived && (
              <Button
                variant="edit"
                size="sm"
                onClick={onEdit}
                disabled={!canWrite}
                className="hidden sm:flex"
              >
                <Edit className="h-4 w-4" />
                <span className="ml-2">{t('editButton')}</span>
              </Button>
            )}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <HabitContextMenuItems
                  habit={habit}
                  onEditRequest={onEdit}
                  onDeleteRequest={onDelete}
                  context="habit-item"
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardFooter>
      </Card>
      {quantityHabit && (
        <LogHabitCompletionModal
          habit={habit}
          open={isLogModalOpen}
          onClose={() => setIsLogModalOpen(false)}
          onSubmit={async (quantity) => {
            await completeHabit(habit, { quantity })
          }}
        />
      )}
    </>
  )
}
