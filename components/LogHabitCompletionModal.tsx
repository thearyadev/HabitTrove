'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Habit } from '@/lib/types'
import { calculateQuantityHabitCoins, formatDecimal } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface LogHabitCompletionModalProps {
  habit: Habit
  open: boolean
  onClose: () => void
  onSubmit: (quantity: number) => Promise<void>
}

export default function LogHabitCompletionModal({
  habit,
  open,
  onClose,
  onSubmit,
}: LogHabitCompletionModalProps) {
  const t = useTranslations('LogHabitCompletionModal')
  const [quantity, setQuantity] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setQuantity('')
      setIsSubmitting(false)
    }
  }, [open])

  const parsedQuantity = useMemo(() => {
    const value = Number.parseFloat(quantity)
    return Number.isFinite(value) ? value : NaN
  }, [quantity])

  const estimatedCoins = useMemo(() => {
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      return 0
    }

    return calculateQuantityHabitCoins(habit, parsedQuantity)
  }, [habit, parsedQuantity])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      return
    }

    setIsSubmitting(true)

    try {
      await onSubmit(parsedQuantity)
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title', { habitName: habit.name })}</DialogTitle>
          <DialogDescription>
            {t('description', {
              baseRate: formatDecimal(habit.baseRate ?? 0),
              baseUnit: formatDecimal(habit.baseUnit ?? 1),
              unit: habit.quantityUnit ?? '',
            })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            <p>
              {t('bonusRule', {
                threshold: formatDecimal(habit.bonusThreshold ?? 0),
                unit: habit.quantityUnit ?? '',
                scaleFactor: formatDecimal(habit.scaleFactor ?? 1),
              })}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="completion-quantity">
              {t('quantityLabel', { unit: habit.quantityUnit ?? '' })}
            </Label>
            <Input
              id="completion-quantity"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder={t('quantityPlaceholder')}
              autoFocus
              required
            />
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('estimatedRewardLabel')}
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {t('estimatedRewardValue', { coins: estimatedCoins })}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t('cancelButton')}
            </Button>
            <Button type="submit" disabled={isSubmitting || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0}>
              {t('submitButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
