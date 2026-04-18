'use client'

import { useMemo, useState } from 'react'
import { RRule } from 'rrule'
import { useAtom } from 'jotai'
import { useTranslations } from 'next-intl'
import { DateTime } from 'luxon'
import { Minus, Plus, Sparkles, Zap } from 'lucide-react'
import { settingsAtom } from '@/lib/atoms'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Habit } from '@/lib/types'
import EmojiPickerButton from './EmojiPickerButton'

import {
  calculateQuantityHabitCoins,
  cn,
  convertHumanReadableFrequencyToMachineReadable,
  convertMachineReadableFrequencyToHumanReadable,
  d2t,
  formatDecimal,
  serializeRRule,
} from '@/lib/utils'
import { INITIAL_DUE, INITIAL_RECURRENCE_RULE, MAX_COIN_LIMIT, QUICK_DATES } from '@/lib/constants'

interface AddEditHabitModalProps {
  onClose: () => void
  onSave: (habit: Omit<Habit, 'id'>) => Promise<void>
  habit?: Habit | null
  isTask: boolean
}

function FieldGroup({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </Label>
      {children}
    </div>
  )
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-background/70 p-4 shadow-sm sm:p-5">
      <div className="mb-4 space-y-1">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function StepperField({
  id,
  value,
  onChange,
  onDecrease,
  onIncrease,
  min,
  max,
}: {
  id: string
  value: number
  onChange: (value: number) => void
  onDecrease: () => void
  onIncrease: () => void
  min: number
  max: number
}) {
  return (
    <div className="flex items-center rounded-xl border border-input bg-background shadow-sm">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onDecrease}
        className="h-11 w-11 rounded-r-none"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const nextValue = Number.parseInt(event.target.value, 10)
          onChange(Number.isNaN(nextValue) ? min : nextValue)
        }}
        className="h-11 border-0 text-center shadow-none [appearance:textfield] focus-visible:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onIncrease}
        className="h-11 w-11 rounded-l-none"
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )
}

export default function AddEditHabitModal({ onClose, onSave, habit, isTask }: AddEditHabitModalProps) {
  const t = useTranslations('AddEditHabitModal')
  const [settings] = useAtom(settingsAtom)
  const [name, setName] = useState(habit?.name || '')
  const [description, setDescription] = useState(habit?.description || '')
  const [coinReward, setCoinReward] = useState(habit?.coinReward || 1)
  const [trackingMode, setTrackingMode] = useState<'standard' | 'quantity'>(habit?.trackingMode ?? 'standard')
  const [quantityUnit, setQuantityUnit] = useState(habit?.quantityUnit || 'km')
  const [baseRate, setBaseRate] = useState(habit?.baseRate ?? habit?.coinReward ?? 1)
  const [baseUnit, setBaseUnit] = useState(habit?.baseUnit ?? 1)
  const [bonusThreshold, setBonusThreshold] = useState(habit?.bonusThreshold ?? 10)
  const [scaleFactor, setScaleFactor] = useState(habit?.scaleFactor ?? 1.5)
  const [targetCompletions, setTargetCompletions] = useState(habit?.targetCompletions || 1)
  const [isQuickDatesOpen, setIsQuickDatesOpen] = useState(false)
  const isRecurring = !isTask
  const initialRuleText = habit?.frequency
    ? convertMachineReadableFrequencyToHumanReadable({
      frequency: habit.frequency,
      isRecurRule: isRecurring,
      timezone: settings.system.timezone,
    })
    : (isRecurring ? INITIAL_RECURRENCE_RULE : INITIAL_DUE)
  const [ruleText, setRuleText] = useState(initialRuleText)

  const parsedFrequency = useMemo(() => (
    convertHumanReadableFrequencyToMachineReadable({
      text: ruleText,
      timezone: settings.system.timezone,
      isRecurring,
    })
  ), [ruleText, settings.system.timezone, isRecurring])

  const isQuantityMode = trackingMode === 'quantity'

  const quantityValidationMessage = useMemo(() => {
    if (!isQuantityMode) {
      return null
    }

    if (!quantityUnit.trim()) {
      return t('quantityUnitRequired')
    }
    if (!Number.isFinite(baseRate) || baseRate <= 0) {
      return t('baseRateInvalid')
    }
    if (!Number.isFinite(baseUnit) || baseUnit <= 0) {
      return t('baseUnitInvalid')
    }
    if (!Number.isFinite(bonusThreshold) || bonusThreshold <= 0) {
      return t('bonusThresholdInvalid')
    }
    if (!Number.isFinite(scaleFactor) || scaleFactor <= 1) {
      return t('scaleFactorInvalid')
    }

    return null
  }, [isQuantityMode, quantityUnit, baseRate, baseUnit, bonusThreshold, scaleFactor, t])

  const quantityPreviewCoins = useMemo(() => {
    if (!isQuantityMode || quantityValidationMessage) {
      return null
    }

    const previewHabit: Habit = {
      id: habit?.id ?? 'preview',
      name,
      description,
      frequency: habit?.frequency ?? '',
      coinReward,
      trackingMode: 'quantity',
      quantityUnit,
      baseRate,
      baseUnit,
      bonusThreshold,
      scaleFactor,
      targetCompletions,
      completions: [],
    }

    return {
      thresholdCoins: calculateQuantityHabitCoins(previewHabit, bonusThreshold),
      bonusCoins: calculateQuantityHabitCoins(previewHabit, bonusThreshold * 2),
    }
  }, [
    isQuantityMode,
    quantityValidationMessage,
    habit?.id,
    habit?.frequency,
    name,
    description,
    coinReward,
    quantityUnit,
    baseRate,
    baseUnit,
    bonusThreshold,
    scaleFactor,
    targetCompletions,
  ])

  function getFrequencyUpdate() {
    if (ruleText === initialRuleText && habit?.frequency) {
      return habit.frequency
    }

    const parsedResult = convertHumanReadableFrequencyToMachineReadable({
      text: ruleText,
      timezone: settings.system.timezone,
      isRecurring,
    })

    if (!parsedResult.result) {
      return 'invalid'
    }

    return isRecurring
      ? serializeRRule(parsedResult.result as RRule)
      : d2t({
        dateTime: parsedResult.result as DateTime,
        timezone: settings.system.timezone,
      })
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!parsedFrequency.result || quantityValidationMessage) {
      return
    }

    await onSave({
      name,
      description,
      coinReward,
      trackingMode,
      quantityUnit: isQuantityMode ? quantityUnit.trim() : undefined,
      baseRate: isQuantityMode ? baseRate : undefined,
      baseUnit: isQuantityMode ? baseUnit : undefined,
      bonusThreshold: isQuantityMode ? bonusThreshold : undefined,
      scaleFactor: isQuantityMode ? scaleFactor : undefined,
      targetCompletions: targetCompletions > 1 ? targetCompletions : undefined,
      completions: habit?.completions || [],
      frequency: getFrequencyUpdate(),
    })
  }

  return (
    <>
      <Dialog open={true} onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-hidden border-border/80 p-0">
          <DialogHeader className="border-b border-border/70 px-6 py-5 sm:px-7">
            <DialogTitle className="text-2xl font-semibold tracking-tight">
              {habit
                ? t(isTask ? 'editTaskTitle' : 'editHabitTitle')
                : t(isTask ? 'addNewTaskTitle' : 'addNewHabitTitle')}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex max-h-[calc(92vh-88px)] flex-col">
            <div className="flex-1 overflow-y-auto px-6 py-5 sm:px-7">
              <div className="space-y-5">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                  <SectionCard title={t('nameLabel')}>
                    <div className="space-y-4">
                      <FieldGroup label={t('nameLabel')} htmlFor="habit-name">
                        <div className="flex items-center gap-2">
                          <Input
                            id="habit-name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder={t('nameLabel')}
                            required
                            className="h-11"
                          />
                          <EmojiPickerButton
                            inputIdToFocus="habit-name"
                            onEmojiSelect={(emoji) => {
                              setName((prev) => {
                                const space = prev.length > 0 && !prev.endsWith(' ') ? ' ' : ''
                                return `${prev}${space}${emoji}`
                              })
                            }}
                          />
                        </div>
                      </FieldGroup>
                      <FieldGroup label={t('descriptionLabel')} htmlFor="habit-description">
                        <Textarea
                          id="habit-description"
                          value={description}
                          onChange={(event) => setDescription(event.target.value)}
                          rows={5}
                          className="min-h-[128px] resize-y"
                        />
                      </FieldGroup>
                    </div>
                  </SectionCard>

                  <SectionCard title={t('whenLabel')}>
                    <div className="space-y-4">
                      <FieldGroup label={t('trackingModeLabel')}>
                        <Select value={trackingMode} onValueChange={(value: 'standard' | 'quantity') => setTrackingMode(value)}>
                          <SelectTrigger className="h-11">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="standard">{t('trackingModeStandard')}</SelectItem>
                            <SelectItem value="quantity">{t('trackingModeQuantity')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </FieldGroup>

                      <FieldGroup label={t('whenLabel')} htmlFor="habit-frequency">
                        <div className="flex gap-2">
                          <Input
                            id="habit-frequency"
                            value={ruleText}
                            onChange={(event) => setRuleText(event.target.value)}
                            required
                            className="h-11"
                          />
                          {isTask ? (
                            <Popover open={isQuickDatesOpen} onOpenChange={setIsQuickDatesOpen}>
                              <PopoverTrigger asChild>
                                <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0">
                                  <Zap className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[280px] p-3" align="end">
                                <div className="grid grid-cols-2 gap-2">
                                  {QUICK_DATES.map((date) => (
                                    <Button
                                      key={date.value}
                                      type="button"
                                      variant="outline"
                                      className="justify-start"
                                      onClick={() => {
                                        setRuleText(date.value)
                                        setIsQuickDatesOpen(false)
                                      }}
                                    >
                                      {date.label}
                                    </Button>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          ) : null}
                        </div>
                        <p className={cn(
                          'text-sm',
                          parsedFrequency.message ? 'text-destructive' : 'text-muted-foreground'
                        )}>
                          {convertMachineReadableFrequencyToHumanReadable({
                            frequency: parsedFrequency.result,
                            isRecurRule: isRecurring,
                            timezone: settings.system.timezone,
                          })}
                        </p>
                        {parsedFrequency.message ? (
                          <p className="text-xs text-destructive">{parsedFrequency.message}</p>
                        ) : null}
                      </FieldGroup>

                      <FieldGroup label={t('completeLabel')} htmlFor="targetCompletions">
                        <div className="flex items-center gap-3">
                          <StepperField
                            id="targetCompletions"
                            value={targetCompletions}
                            min={1}
                            max={10}
                            onChange={(value) => setTargetCompletions(Math.max(1, Math.min(10, value)))}
                            onDecrease={() => setTargetCompletions((prev) => Math.max(1, prev - 1))}
                            onIncrease={() => setTargetCompletions((prev) => Math.min(10, prev + 1))}
                          />
                          <span className="text-sm text-muted-foreground">{t('timesSuffix')}</span>
                        </div>
                      </FieldGroup>
                    </div>
                  </SectionCard>
                </div>

                <SectionCard
                  title={t('rewardLabel')}
                  description={isQuantityMode ? t('trackingModeQuantity') : t('trackingModeStandard')}
                >
                  {!isQuantityMode ? (
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,240px)_auto] sm:items-end">
                      <FieldGroup label={t('rewardLabel')} htmlFor="coinReward">
                        <StepperField
                          id="coinReward"
                          value={coinReward}
                          min={0}
                          max={MAX_COIN_LIMIT}
                          onChange={(value) => setCoinReward(Math.max(0, Math.min(MAX_COIN_LIMIT, value)))}
                          onDecrease={() => setCoinReward((prev) => Math.max(0, prev - 1))}
                          onIncrease={() => setCoinReward((prev) => Math.min(MAX_COIN_LIMIT, prev + 1))}
                        />
                      </FieldGroup>
                      <p className="pb-2 text-sm text-muted-foreground">{t('coinsSuffix')}</p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <FieldGroup label={t('quantityUnitLabel')} htmlFor="quantityUnit">
                          <Input
                            id="quantityUnit"
                            value={quantityUnit}
                            onChange={(event) => setQuantityUnit(event.target.value)}
                            className="h-11"
                            placeholder={t('quantityUnitPlaceholder')}
                            required
                          />
                        </FieldGroup>
                        <FieldGroup label={t('baseRateLabel')} htmlFor="baseRate">
                          <Input
                            id="baseRate"
                            type="number"
                            min="0"
                            step="any"
                            value={baseRate}
                            onChange={(event) => setBaseRate(Number.parseFloat(event.target.value))}
                            className="h-11"
                            required
                          />
                        </FieldGroup>
                        <FieldGroup label={t('baseUnitLabel')} htmlFor="baseUnit">
                          <Input
                            id="baseUnit"
                            type="number"
                            min="0"
                            step="any"
                            value={baseUnit}
                            onChange={(event) => setBaseUnit(Number.parseFloat(event.target.value))}
                            className="h-11"
                            required
                          />
                        </FieldGroup>
                        <FieldGroup label={t('scaleFactorLabel')} htmlFor="scaleFactor">
                          <Input
                            id="scaleFactor"
                            type="number"
                            min="1"
                            step="any"
                            value={scaleFactor}
                            onChange={(event) => setScaleFactor(Number.parseFloat(event.target.value))}
                            className="h-11"
                            required
                          />
                        </FieldGroup>
                      </div>

                      <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
                        <FieldGroup label={t('bonusThresholdLabel')} htmlFor="bonusThreshold">
                          <Input
                            id="bonusThreshold"
                            type="number"
                            min="0"
                            step="any"
                            value={bonusThreshold}
                            onChange={(event) => setBonusThreshold(Number.parseFloat(event.target.value))}
                            className="h-11"
                            required
                          />
                        </FieldGroup>

                        <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <span>{t('rewardLabel')}</span>
                          </div>
                          <div className="space-y-2">
                            <p className="text-lg font-semibold tracking-tight">
                              {t('quantityPreviewBase', {
                                baseRate: formatDecimal(baseRate || 0),
                                baseUnit: formatDecimal(baseUnit || 0),
                                unit: quantityUnit || t('quantityUnitPlaceholder'),
                              })}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {t('quantityPreviewBonus', {
                                threshold: formatDecimal(bonusThreshold || 0),
                                unit: quantityUnit || t('quantityUnitPlaceholder'),
                                scaleFactor: formatDecimal(scaleFactor || 0),
                              })}
                            </p>
                            {quantityPreviewCoins ? (
                              <p className="text-sm text-muted-foreground">
                                {t('quantityPreviewExamples', {
                                  threshold: formatDecimal(bonusThreshold),
                                  thresholdCoins: quantityPreviewCoins.thresholdCoins,
                                  bonusQuantity: formatDecimal(bonusThreshold * 2),
                                  bonusCoins: quantityPreviewCoins.bonusCoins,
                                })}
                              </p>
                            ) : null}
                            {quantityValidationMessage ? (
                              <p className="text-sm text-destructive">{quantityValidationMessage}</p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </SectionCard>


              </div>
            </div>

            <Separator />

            <DialogFooter className="px-6 py-4 sm:px-7">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!parsedFrequency.result || !!quantityValidationMessage}>
                {habit
                  ? t('saveChangesButton')
                  : t(isTask ? 'addTaskButton' : 'addHabitButton')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </>
  )
}
