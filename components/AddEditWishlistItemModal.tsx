import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
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
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MAX_COIN_LIMIT } from '@/lib/constants'
import { RewardDefinition, RewardLimitWindow, RewardTier } from '@/lib/types'
import { translateWithFallback } from '@/lib/i18n'
import EmojiPickerButton from './EmojiPickerButton'

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'

type RewardFormTier = RewardTier & {
  localId: string
}

interface AddEditWishlistItemModalProps {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  editingItem: RewardDefinition | null
  setEditingItem: (item: RewardDefinition | null) => void
  addReward: (reward: Omit<RewardDefinition, 'id'>) => void
  editReward: (reward: RewardDefinition) => void
}

function createEmptyTier(position: number): RewardFormTier {
  return {
    id: crypto.randomUUID(),
    localId: crypto.randomUUID(),
    name: '',
    coinCost: 1,
    position,
  }
}

function normalizeTiers(tiers: RewardFormTier[]): RewardTier[] {
  return tiers.map((tier, index) => ({
    id: tier.id,
    name: tier.name.trim(),
    coinCost: tier.coinCost,
    position: index,
  }))
}

export default function AddEditWishlistItemModal({
  isOpen,
  setIsOpen,
  editingItem,
  setEditingItem,
  addReward,
  editReward,
}: AddEditWishlistItemModalProps) {
  const t = useTranslations('AddEditWishlistItemModal')
  const tx = (key: string, fallback: string, values?: Record<string, string | number>) =>
    translateWithFallback(t, key, fallback, values)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [link, setLink] = useState('')

  const [window, setWindow] = useState<RewardLimitWindow>('unlimited')
  const [maxRedemptions, setMaxRedemptions] = useState('1')
  const [tiers, setTiers] = useState<RewardFormTier[]>([createEmptyTier(0)])
  const [errors, setErrors] = useState<Record<string, string>>({})


  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name)
      setDescription(editingItem.description)
      setLink(editingItem.link ?? '')

      setWindow(editingItem.redemptionRule.window)
      setMaxRedemptions(String(editingItem.redemptionRule.maxRedemptions ?? 1))
      setTiers(editingItem.tiers.map((tier, index) => ({
        ...tier,
        position: tier.position ?? index,
        localId: crypto.randomUUID(),
      })))
      setErrors({})
      return
    }

    setName('')
    setDescription('')
    setLink('')

    setWindow('unlimited')
    setMaxRedemptions('1')
    setTiers([createEmptyTier(0)])
    setErrors({})
  }, [editingItem, isOpen])

  const cheapestTierCost = useMemo(
    () => Math.min(...tiers.map((tier) => tier.coinCost)),
    [tiers]
  )

  const handleClose = () => {
    setIsOpen(false)
    setEditingItem(null)
  }

  const isValidUrl = (value: string) => {
    if (!value.trim()) {
      return true
    }

    try {
      new URL(value)
      return true
    } catch {
      return false
    }
  }

  const validate = () => {
    const newErrors: Record<string, string> = {}

    if (!name.trim()) {
      newErrors.name = t('errorNameRequired')
    }

    if (!isValidUrl(link)) {
      newErrors.link = t('errorInvalidUrl')
    }

    if (tiers.length === 0) {
      newErrors.tiers = tx('errorTierRequired', 'Add at least one tier.')
    }

    tiers.forEach((tier, index) => {
      if (!tier.name.trim()) {
        newErrors[`tier-name-${tier.localId}`] = tx('errorTierNameRequired', 'Tier {index} needs a name.', { index: index + 1 })
      }

      if (tier.coinCost < 0.01) {
        newErrors[`tier-cost-${tier.localId}`] = t('errorCoinCostMin')
      }

      if (tier.coinCost > MAX_COIN_LIMIT) {
        newErrors[`tier-cost-${tier.localId}`] = tx('errorCoinCostMax', 'Coin cost cannot exceed {max}', { max: MAX_COIN_LIMIT })
      }
    })

    if (window !== 'unlimited') {
      const parsed = Number(maxRedemptions)
      if (!Number.isInteger(parsed) || parsed < 1) {
        newErrors.maxRedemptions = tx('errorMaxRedemptionsMin', 'Max redemptions must be at least 1')
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault()
    if (!validate()) {
      return
    }

    const rewardData = {
      name: name.trim(),
      description: description.trim(),
      archived: editingItem?.archived ?? false,
      link: link.trim() || undefined,
      redemptionRule: {
        window,
        maxRedemptions: window === 'unlimited' ? undefined : Number(maxRedemptions),
      },
      tiers: normalizeTiers(tiers),
    } satisfies Omit<RewardDefinition, 'id'>

    if (editingItem) {
      editReward({
        ...rewardData,
        id: editingItem.id,
      })
    } else {
      addReward(rewardData)
    }

    handleClose()
  }

  const moveTier = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= tiers.length) {
      return
    }

    const nextTiers = [...tiers]
    const [moved] = nextTiers.splice(index, 1)
    nextTiers.splice(nextIndex, 0, moved)
    setTiers(nextTiers.map((tier, position) => ({ ...tier, position })))
  }

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleClose()
          }
        }}
      >
        <DialogContent className="max-w-3xl p-0">
          <form onSubmit={handleSave}>
            <DialogHeader className="border-b px-6 py-5">
              <DialogTitle>{editingItem ? t('editTitle') : t('addTitle')}</DialogTitle>
              <DialogDescription>
                {tx('dialogDescription', 'Build a reward with multiple tiers and one shared redemption rule.')}
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[70vh] px-6 py-5">
              <div className="space-y-6">
                <div className="grid gap-5 md:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reward-name">{t('nameLabel')}</Label>
                      <div className="flex gap-2">
                        <Input
                          id="reward-name"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          placeholder={tx('namePlaceholder', 'Pizza night')}
                        />
                        <EmojiPickerButton
                          inputIdToFocus="reward-name"
                          onEmojiSelect={(emoji) => {
                            setName((previous) => {
                              const spacer = previous.length > 0 && !previous.endsWith(' ') ? ' ' : ''
                              return `${previous}${spacer}${emoji}`
                            })
                          }}
                        />
                      </div>
                      {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reward-description">{t('descriptionLabel')}</Label>
                      <Textarea
                        id="reward-description"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder={tx('descriptionPlaceholder', 'Add any details or guardrails for this reward.')}
                        className="min-h-28"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="reward-link">{t('linkLabel')}</Label>
                      <Input
                        id="reward-link"
                        value={link}
                        onChange={(event) => setLink(event.target.value)}
                        placeholder={tx('linkPlaceholder', 'https://...')}
                      />
                      {errors.link && <p className="text-sm text-red-500">{errors.link}</p>}
                    </div>
                  </div>

                  <Card className="border-dashed">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{tx('ruleCardTitle', 'Redemption rule')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>{tx('redemptionWindowLabel', 'Reset window')}</Label>
                        <Select value={window} onValueChange={(value) => setWindow(value as RewardLimitWindow)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unlimited">{tx('windowUnlimited', 'Unlimited')}</SelectItem>
                            <SelectItem value="daily">{tx('windowDaily', 'Daily')}</SelectItem>
                            <SelectItem value="weekly">{tx('windowWeekly', 'Weekly')}</SelectItem>
                            <SelectItem value="monthly">{tx('windowMonthly', 'Monthly')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {window !== 'unlimited' && (
                        <div className="space-y-2">
                          <Label htmlFor="reward-max-redemptions">{tx('maxRedemptionsLabel', 'Max redemptions per window')}</Label>
                          <Input
                            id="reward-max-redemptions"
                            type="number"
                            min={1}
                            step={1}
                            value={maxRedemptions}
                            onChange={(event) => setMaxRedemptions(event.target.value)}
                          />
                          {errors.maxRedemptions && (
                            <p className="text-sm text-red-500">{errors.maxRedemptions}</p>
                          )}
                        </div>
                      )}

                      <Separator />

                      <div className="rounded-lg bg-secondary/40 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          {tx('previewLabel', 'Preview')}
                        </p>
                        <p className="mt-2 text-sm font-medium">{tx('previewFromCoins', 'Starts at {coins} coins', { coins: cheapestTierCost })}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {window === 'unlimited'
                            ? tx('previewUnlimited', 'No redemption cap.')
                            : tx('previewLimited', '{count} redemption(s) per {window}.', {
                                count: Number(maxRedemptions || '1'),
                                window: tx(`windowName.${window}`, window === 'daily' ? 'day' : window === 'weekly' ? 'week' : 'month'),
                              })}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">{tx('tiersSectionTitle', 'Tiers')}</h3>
                      <p className="text-sm text-muted-foreground">{tx('tiersSectionDescription', 'Any tier can be redeemed until the shared reward limit is exhausted.')}</p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setTiers((previous) => [...previous, createEmptyTier(previous.length)])}
                    >
                      <Plus className="h-4 w-4" />
                      {tx('addTierButton', 'Add tier')}
                    </Button>
                  </div>

                  {errors.tiers && <p className="text-sm text-red-500">{errors.tiers}</p>}

                  <div className="space-y-3">
                    {tiers.map((tier, index) => (
                      <Card key={tier.localId} className="border border-border/70">
                        <CardContent className="grid gap-4 p-4 md:grid-cols-[1fr_180px_auto] md:items-end">
                          <div className="space-y-2">
                            <Label htmlFor={`tier-name-${tier.localId}`}>
                              {tx('tierNameLabel', 'Tier {index}', { index: index + 1 })}
                            </Label>
                            <Input
                              id={`tier-name-${tier.localId}`}
                              value={tier.name}
                              onChange={(event) => {
                                const nextValue = event.target.value
                                setTiers((previous) => previous.map((item) =>
                                  item.localId === tier.localId ? { ...item, name: nextValue } : item
                                ))
                              }}
                              placeholder={tx('tierNamePlaceholder', '1 slice')}
                            />
                            {errors[`tier-name-${tier.localId}`] && (
                              <p className="text-sm text-red-500">{errors[`tier-name-${tier.localId}`]}</p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`tier-cost-${tier.localId}`}>{t('costLabel')}</Label>
                            <Input
                              id={`tier-cost-${tier.localId}`}
                              type="number"
                              min={1}
                              max={MAX_COIN_LIMIT}
                              step="any"
                              value={tier.coinCost}
                              onChange={(event) => {
                                const parsed = Number(event.target.value || '0')
                                setTiers((previous) => previous.map((item) =>
                                  item.localId === tier.localId
                                    ? { ...item, coinCost: Math.min(Math.max(parsed, 0), MAX_COIN_LIMIT) }
                                    : item
                                ))
                              }}
                            />
                            {errors[`tier-cost-${tier.localId}`] && (
                              <p className="text-sm text-red-500">{errors[`tier-cost-${tier.localId}`]}</p>
                            )}
                          </div>

                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => moveTier(index, -1)}
                              disabled={index === 0}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => moveTier(index, 1)}
                              disabled={index === tiers.length - 1}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setTiers((previous) => previous.filter((item) => item.localId !== tier.localId))}
                              disabled={tiers.length === 1}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>

            <DialogFooter className="border-t px-6 py-4">
              <Button type="button" variant="ghost" onClick={handleClose}>
                {tx('cancelButton', 'Cancel')}
              </Button>
              <Button type="submit">
                {editingItem ? t('saveButton') : t('addButton')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </>
  )
}
