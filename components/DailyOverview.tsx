import { Circle, Coins, ArrowRight, CircleCheck, ChevronDown, ChevronUp, Plus, Pin, AlertTriangle } from 'lucide-react' // Removed unused icons
import CompletionCountBadge from './CompletionCountBadge'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { useState } from 'react'
import { useAtom } from 'jotai'
import { useTranslations } from 'next-intl'
import { settingsAtom, completedHabitsMapAtom, browserSettingsAtom, coinsAtom, hasTasksAtom } from '@/lib/atoms'
import { formatDecimal, getCompletionCountForDate, getHabitRewardValue, getNow, getTodayInTimezone, isHabitDue, isQuantityHabit, isTaskOverdue } from '@/lib/utils'
import { canAffordAnyRewardTier, getCheapestRewardTier, getRewardUsageSummary } from '@/lib/rewards'
import { translateWithFallback } from '@/lib/i18n'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Progress } from '@/components/ui/progress'
import { Habit, RewardDefinition } from '@/lib/types'
import Linkify from './linkify'
import { useHabits } from '@/hooks/useHabits'
import AddEditHabitModal from './AddEditHabitModal'
import ConfirmDialog from './ConfirmDialog'
import { Button } from './ui/button'
import { HabitContextMenuItems } from './HabitContextMenuItems'
import DrawingDisplay from './DrawingDisplay'
import LogHabitCompletionModal from './LogHabitCompletionModal'

interface UpcomingItemsProps {
  habits: Habit[]
  wishlistRewards: RewardDefinition[]
  coinBalance: number
}

interface ItemSectionProps {
  title: string;
  items: Habit[];
  emptyMessage: string;
  isTask: boolean;
  viewLink: string;
  addNewItem: () => void;
}

const ItemSection = ({
  title,
  items,
  emptyMessage,
  isTask,
  viewLink,
  addNewItem,
}: ItemSectionProps) => {
  const t = useTranslations('DailyOverview');
  const { completeHabit, undoComplete, saveHabit, deleteHabit, habitFreqMap } = useHabits();
  const [browserSettings, setBrowserSettings] = useAtom(browserSettingsAtom);
  const [settings] = useAtom(settingsAtom);
  const [completedHabitsMap] = useAtom(completedHabitsMapAtom);

  const today = getTodayInTimezone(settings.system.timezone);
  const currentTodayCompletions = completedHabitsMap.get(today) || [];
  const currentBadgeType = isTask ? 'tasks' : 'habits';

  const currentExpanded = isTask ? browserSettings.expandedTasks : browserSettings.expandedHabits;
  const setCurrentExpanded = (value: boolean) => {
    setBrowserSettings(prev => ({
      ...prev,
      [isTask ? 'expandedTasks' : 'expandedHabits']: value
    }));
  };

  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);
  const [habitToDelete, setHabitToDelete] = useState<Habit | null>(null);
  const [habitToEdit, setHabitToEdit] = useState<Habit | null>(null);
  const [quantityHabitToLog, setQuantityHabitToLog] = useState<Habit | null>(null);

  const handleDeleteClick = (habit: Habit) => {
    setHabitToDelete(habit);
    setIsConfirmDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (habitToDelete) {
      await deleteHabit(habitToDelete.id);
      setHabitToDelete(null);
      setIsConfirmDeleteDialogOpen(false);
    }
  };

  const handleEditClick = (habit: Habit) => {
    setHabitToEdit(habit);
  };

  if (items.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">{title}</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 rounded-full hover:bg-primary/10 hover:text-primary"
            onClick={addNewItem}
          >
            <Plus className="h-4 w-4" />
            <span className="sr-only">{t(isTask ? 'addTaskButtonLabel' : 'addHabitButtonLabel')}</span>
          </Button>
        </div>
        <div className="text-center text-muted-foreground text-sm py-4">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <CompletionCountBadge type={currentBadgeType} />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 rounded-full hover:bg-primary/10 hover:text-primary"
            onClick={addNewItem}
          >
            <Plus className="h-4 w-4" />
            <span className="sr-only">{t(isTask ? 'addTaskButtonLabel' : 'addHabitButtonLabel')}</span>
          </Button>
        </div>
      </div>
      <ul className={`grid gap-2 transition-all duration-300 ease-in-out ${currentExpanded ? 'max-h-none' : 'max-h-[200px]'} overflow-hidden`}>
        {items
          .sort((a, b) => {
            // First by pinned status
            if (a.pinned !== b.pinned) {
              return a.pinned ? -1 : 1;
            }

            // Then by completion status
            const aCompleted = currentTodayCompletions.includes(a);
            const bCompleted = currentTodayCompletions.includes(b);
            if (aCompleted !== bCompleted) {
              return aCompleted ? 1 : -1;
            }

            // Then by frequency (daily first)
            const aFreq = habitFreqMap.get(a.id) || 'daily';
            const bFreq = habitFreqMap.get(b.id) || 'daily';
            const freqOrder = ['daily', 'weekly', 'monthly', 'yearly'];
            if (freqOrder.indexOf(aFreq) !== freqOrder.indexOf(bFreq)) {
              return freqOrder.indexOf(aFreq) - freqOrder.indexOf(bFreq);
            }

            // Then by coin reward (higher first)
            const aReward = getHabitRewardValue(a);
            const bReward = getHabitRewardValue(b);
            if (aReward !== bReward) {
              return bReward - aReward;
            }

            // Finally by target completions (higher first)
            const aTarget = a.targetCompletions || 1;
            const bTarget = b.targetCompletions || 1;
            return bTarget - aTarget;
          })
          .slice(0, currentExpanded ? undefined : 5)
          .map((habit) => {
            const completionsToday = getCompletionCountForDate({
              habit,
              date: getNow({ timezone: settings.system.timezone }),
              timezone: settings.system.timezone,
            })
            const target = habit.targetCompletions || 1
            const isCompleted = completionsToday >= target || (isTask && habit.archived)
            const quantityHabit = isQuantityHabit(habit)
            return (
              <li
                className={`flex items-center justify-between text-sm p-2 rounded-md
                ${isCompleted ? 'bg-secondary/50' : 'bg-secondary/20'}`}
                key={habit.id}
              >
                <span className="flex items-center gap-2 flex-1 min-w-0">
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                        <div className="flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (isCompleted) {
                                undoComplete(habit);
                              } else {
                                if (quantityHabit) {
                                  setQuantityHabitToLog(habit);
                                } else {
                                  completeHabit(habit);
                                }
                              }
                            }}
                            className="relative hover:opacity-70 transition-opacity w-4 h-4"
                          >
                            {isCompleted ? (
                              <CircleCheck className="h-4 w-4 text-green-500" />
                            ) : (
                              <div className="relative h-4 w-4">
                                <Circle className="absolute h-4 w-4 text-muted-foreground" />
                                <div
                                  className="absolute h-4 w-4 rounded-full overflow-hidden"
                                  style={{
                                    background: `conic-gradient(
                                  currentColor ${(completionsToday / target) * 360}deg,
                                  transparent ${(completionsToday / target) * 360}deg 360deg
                                )`,
                                    mask: 'radial-gradient(transparent 50%, black 51%)',
                                    WebkitMask: 'radial-gradient(transparent 50%, black 51%)'
                                  }}
                                />
                              </div>
                            )}
                          </button>
                        </div>
                        <span className="flex items-center gap-1">
                          {habit.pinned && (
                            <Pin className="h-4 w-4 text-yellow-500" />
                          )}
                          <Link
                            href={`/habits?highlight=${habit.id}`}
                            className="flex items-center gap-1 hover:text-primary transition-colors"
                            onClick={() => {
                              const newViewType = isTask ? 'tasks' : 'habits';
                              if (browserSettings.viewType !== newViewType) {
                                setBrowserSettings(prev => ({ ...prev, viewType: newViewType }));
                              }
                            }}
                          >
                            {isTask && isTaskOverdue(habit, settings.system.timezone) && !isCompleted && (
                              <TooltipProvider>
                                <Tooltip delayDuration={0}>
                                  <TooltipTrigger asChild>
                                    {/* The AlertTriangle itself doesn't need hover styles if the parent Link handles it */}
                                    <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-600 dark:text-red-500" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{t('overdueTooltip')}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            <span
                              className={cn(
                                isCompleted ? 'line-through' : '',
                                'break-all' // Text specific styles
                              )}
                            >
                              {habit.name}
                            </span>
                          </Link>
                          {habit.drawing && (
                            <div className="ml-2 pr-2">
                              <DrawingDisplay
                                drawingData={habit.drawing}
                                width={40}
                                height={26}
                                className="border-0"
                              />
                            </div>
                          )}
                        </span>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-64">
                      <HabitContextMenuItems
                        habit={habit}
                        onEditRequest={() => handleEditClick(habit)}
                        onDeleteRequest={() => handleDeleteClick(habit)}
                        context="daily-overview"
                      />
                    </ContextMenuContent>
                  </ContextMenu>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                  {habit.targetCompletions && (
                    <span className="bg-secondary px-1.5 py-0.5 rounded-full">
                      {completionsToday}/{target}
                    </span>
                  )}
                  {habitFreqMap.get(habit.id) !== 'daily' && (
                    <Badge variant="outline" className="text-xs">
                      {habitFreqMap.get(habit.id)}
                    </Badge>
                  )}
                  <span className="flex items-center">
                    <Coins className={cn(
                      "h-3 w-3 mr-1 transition-all",
                      isCompleted
                        ? "text-yellow-500 drop-shadow-[0_0_2px_rgba(234,179,8,0.3)]"
                        : "text-gray-400"
                    )} />
                    <span className={cn(
                      "transition-all",
                      isCompleted
                        ? "text-yellow-500 font-medium"
                        : "text-gray-400"
                    )}>
                      {quantityHabit
                        ? `${formatDecimal(habit.baseRate ?? 0)}/${habit.quantityUnit}`
                        : habit.coinReward}
                    </span>
                  </span>
                  {quantityHabit && (
                    <span className="hidden md:inline">
                      {t('quantityModeBadge')}
                    </span>
                  )}
                </span>
              </li>
            )
          })}
      </ul>
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentExpanded(!currentExpanded)}
          className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
        >
          {currentExpanded ? (
            <>
              {t('showLessButton')}
              <ChevronUp className="h-3 w-3" />
            </>
          ) : (
            <>
              {t('showAllButton')}
              <ChevronDown className="h-3 w-3" />
            </>
          )}
        </button>
        <Link
          href={viewLink}
          className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
          onClick={() => {
            const newViewType = isTask ? 'tasks' : 'habits';
            if (browserSettings.viewType !== newViewType) {
              setBrowserSettings(prev => ({ ...prev, viewType: newViewType }));
            }
          }}
        >
          View
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {habitToDelete && (
        <ConfirmDialog
          isOpen={isConfirmDeleteDialogOpen}
          onClose={() => setIsConfirmDeleteDialogOpen(false)}
          onConfirm={confirmDelete}
          title={`Delete ${isTask ? 'Task' : 'Habit'}`}
          message={`Are you sure you want to delete "${habitToDelete.name}"? This action cannot be undone.`}
          confirmText="Delete"
        />
      )}
      {habitToEdit && (
        <AddEditHabitModal
          onClose={() => setHabitToEdit(null)}
          onSave={async (updatedHabit) => {
            await saveHabit({ ...habitToEdit, ...updatedHabit });
            setHabitToEdit(null);
          }}
          habit={habitToEdit}
          isTask={habitToEdit.isTask || false}
        />
      )}
      {quantityHabitToLog && (
        <LogHabitCompletionModal
          habit={quantityHabitToLog}
          open={!!quantityHabitToLog}
          onClose={() => setQuantityHabitToLog(null)}
          onSubmit={async (quantity) => {
            await completeHabit(quantityHabitToLog, { quantity });
          }}
        />
      )}
    </div>
  );
};

export default function DailyOverview({
  habits,
  wishlistRewards,
  coinBalance,
}: UpcomingItemsProps) {
  const t = useTranslations('DailyOverview');
  const tx = (key: string, fallback: string, values?: Record<string, string | number>) =>
    translateWithFallback(t, key, fallback, values)
  const { saveHabit } = useHabits()
  const [settings] = useAtom(settingsAtom)
  const [browserSettings, setBrowserSettings] = useAtom(browserSettingsAtom)
  const [coins] = useAtom(coinsAtom)

  const timezone = settings.system.timezone
  const todayDateObj = getNow({ timezone })

  const dailyTasks = habits.filter(habit =>
    habit.isTask &&
    !habit.archived &&
    (isHabitDue({ habit, timezone, date: todayDateObj }) || isTaskOverdue(habit, timezone))
  )
  const dailyHabits = habits.filter(habit =>
    !habit.isTask &&
    !habit.archived &&
    isHabitDue({ habit, timezone, date: todayDateObj })
  )

  const sortedWishlistRewards = wishlistRewards
    .filter((reward) => !reward.archived)
    .map((reward) => {
      const cheapestTier = getCheapestRewardTier(reward)
      const usage = getRewardUsageSummary({
        reward,
        transactions: coins.transactions,
        timezone,
        weekStartDay: settings.system.weekStartDay,
      })
      const redeemable = !usage.isExhausted && canAffordAnyRewardTier(reward, coinBalance)

      return {
        reward,
        cheapestTier,
        usage,
        redeemable,
      }
    })
    .filter((entry) => !!entry.cheapestTier)
    .sort((a, b) => {
      if (a.redeemable !== b.redeemable) {
        return a.redeemable ? 1 : -1
      }

      return (a.cheapestTier?.coinCost ?? 0) - (b.cheapestTier?.coinCost ?? 0)
    })

  const [hasTasks] = useAtom(hasTasksAtom)
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean,
    isTask: boolean
  }>({
    isOpen: false,
    isTask: false
  });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('todaysOverviewTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[520px] overflow-y-auto">
          <div className="space-y-6">
            {/* Tasks Section */}
            {hasTasks && (
              <ItemSection
                title={t('dailyTasksTitle')}
                items={dailyTasks}
                emptyMessage={t('noTasksDueTodayMessage')}
                isTask={true}
                viewLink="/habits?view=tasks"
                addNewItem={() => setModalConfig({ isOpen: true, isTask: true })}
              />
            )}

            {/* Habits Section */}
            <ItemSection
              title={t('dailyHabitsTitle')}
              items={dailyHabits}
              emptyMessage={t('noHabitsDueTodayMessage')}
              isTask={false}
              viewLink="/habits"
              addNewItem={() => setModalConfig({ isOpen: true, isTask: false })}
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">{t('wishlistGoalsTitle')}</h3>
                <Badge variant="secondary">
                  {t('redeemableBadgeLabel', {
                    count: sortedWishlistRewards.filter((entry) => entry.redeemable).length,
                    total: sortedWishlistRewards.length,
                  })}
                </Badge>
              </div>
              <div>
                <div className={`space-y-3 transition-all duration-300 ease-in-out ${browserSettings.expandedWishlist ? 'max-h-none' : 'max-h-[200px]'} overflow-hidden`}>
                  {sortedWishlistRewards.length === 0 ? (
                    <div className="text-center text-muted-foreground text-sm py-4">
                      {t('noWishlistItemsMessage')}
                    </div>
                  ) : (
                    <>
                      {sortedWishlistRewards
                        .slice(0, browserSettings.expandedWishlist ? undefined : 5)
                        .map(({ reward, cheapestTier, usage, redeemable }) => {
                          const tierCost = cheapestTier?.coinCost ?? 0
                          return (
                            <Link
                              key={reward.id}
                              href={`/wishlist?highlight=${reward.id}`}
                              className={cn(
                                "block p-3 rounded-md hover:bg-secondary/30 transition-colors",
                                redeemable ? 'bg-green-500/10' : 'bg-secondary/20'
                              )}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">
                                    <Linkify>{reward.name}</Linkify>
                                  </span>
                                  {reward.drawing && (
                                    <DrawingDisplay
                                      drawingData={reward.drawing}
                                      width={40}
                                      height={26}
                                      className="border-0"
                                    />
                                  )}
                                  {usage.isExhausted && (
                                    <Badge variant="secondary" className="text-[10px]">
                                      {tx('rewardLimitReachedBadge', 'Limit reached')}
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-xs flex items-center">
                                  <Coins className={cn(
                                    "h-3 w-3 mr-1 transition-all",
                                    redeemable
                                      ? "text-yellow-500 drop-shadow-[0_0_2px_rgba(234,179,8,0.3)]"
                                      : "text-gray-400"
                                  )} />
                                  <span className={cn(
                                    "transition-all",
                                    redeemable
                                      ? "text-yellow-500 font-medium"
                                      : "text-gray-400"
                                  )}>
                                    {tx('fromCoinsMessage', 'From {amount}', { amount: tierCost })}
                                  </span>
                                </span>
                              </div>
                              <Progress
                                value={Math.min(100, (coinBalance / Math.max(tierCost, 1)) * 100)}
                                className={cn(
                                  "h-2",
                                  redeemable ? "bg-green-500/20" : ""
                                )}
                              />
                              <p className="text-xs text-muted-foreground mt-2">
                                {usage.isExhausted
                                  ? tx('rewardLimitReachedMessage', 'Redeemable again next reset')
                                  : redeemable
                                    ? t('readyToRedeemMessage')
                                    : t('coinsToGoMessage', { amount: tierCost - coinBalance })}
                              </p>
                            </Link>
                          )
                        })}
                    </>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setBrowserSettings(prev => ({ ...prev, expandedWishlist: !prev.expandedWishlist }))}
                    className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                  >
                    {browserSettings.expandedWishlist ? (
                      <>
                        {t('showLessButton')}
                        <ChevronUp className="h-3 w-3" />
                      </>
                    ) : (
                      <>
                        {t('showAllButton')}
                        <ChevronDown className="h-3 w-3" />
                      </>
                    )}
                  </button>
                  <Link
                    href="/wishlist"
                    className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                  >
                    {t('viewButton')}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      {modalConfig.isOpen && (
        <AddEditHabitModal
          onClose={() => setModalConfig({ isOpen: false, isTask: false })}
          onSave={async (habit) => {
            await saveHabit({ ...habit, isTask: modalConfig.isTask })
            setModalConfig({ isOpen: false, isTask: false });
          }}
          habit={null}
          isTask={modalConfig.isTask}
        />
      )}
    </>
  )
}
