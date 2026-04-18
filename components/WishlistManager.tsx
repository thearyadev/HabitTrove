'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAtom } from 'jotai'
import { useTranslations } from 'next-intl'
import { Gift, Plus } from 'lucide-react'
import { settingsAtom } from '@/lib/atoms'
import { getRewardUsageSummary } from '@/lib/rewards'
import { translateWithFallback } from '@/lib/i18n'
import { openWindow } from '@/lib/utils'
import { useCoins } from '@/hooks/useCoins'
import { useWishlist } from '@/hooks/useWishlist'
import { RewardDefinition, RewardTier } from '@/lib/types'
import { toast } from '@/hooks/use-toast'
import EmptyState from './EmptyState'
import WishlistItem from './WishlistItem'
import AddEditWishlistItemModal from './AddEditWishlistItemModal'
import ConfirmDialog from './ConfirmDialog'
import { Button } from '@/components/ui/button'

export default function WishlistManager() {
  const t = useTranslations('WishlistManager')
  const tx = (key: string, fallback: string) => translateWithFallback(t, key, fallback)
  const [settings] = useAtom(settingsAtom)
  const { balance, transactions } = useCoins()
  const {
    addReward,
    editReward,
    deleteReward,
    redeemRewardTier,
    archiveReward,
    unarchiveReward,
    wishlistRewards,
  } = useWishlist()

  const activeRewards = wishlistRewards.filter((reward) => !reward.archived)
  const archivedRewards = wishlistRewards.filter((reward) => reward.archived)

  const [highlightedRewardId, setHighlightedRewardId] = useState<string | null>(null)
  const [recentlyRedeemedRewardId, setRecentlyRedeemedRewardId] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingReward, setEditingReward] = useState<RewardDefinition | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; rewardId: string | null }>({
    isOpen: false,
    rewardId: null,
  })

  const rewardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const usageByRewardId = useMemo(() => (
    new Map(wishlistRewards.map((reward) => [reward.id, getRewardUsageSummary({
      reward,
      transactions,
      timezone: settings.system.timezone,
      weekStartDay: settings.system.weekStartDay,
    })]))
  ), [settings.system.timezone, settings.system.weekStartDay, transactions, wishlistRewards])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const highlightId = params.get('highlight')
    if (!highlightId) {
      return
    }

    setHighlightedRewardId(highlightId)
    setTimeout(() => {
      rewardRefs.current[highlightId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
    setTimeout(() => setHighlightedRewardId(null), 2000)
  }, [])

  const handleRedeemTier = async (reward: RewardDefinition, tier: RewardTier) => {
    const success = await redeemRewardTier(reward, tier)
    if (!success) {
      return
    }

    setRecentlyRedeemedRewardId(reward.id)
    setTimeout(() => setRecentlyRedeemedRewardId(null), 3000)

    if (reward.link) {
      setTimeout(() => {
        const opened = openWindow(reward.link!)
        if (!opened) {
          toast({
            title: t('popupBlockedTitle'),
            description: t('popupBlockedDescription'),
            variant: 'destructive',
          })
        }
      }, 300)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{tx('subtitle', 'Set up flexible rewards with multiple ways to cash out the same craving.')}</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="h-4 w-4" />
          {t('addRewardButton')}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {activeRewards.length === 0 ? (
          <div className="xl:col-span-2">
            <EmptyState
              icon={Gift}
              title={t('emptyStateTitle')}
              description={t('emptyStateDescription')}
            />
          </div>
        ) : (
          activeRewards.map((reward) => (
            <div
              key={reward.id}
              ref={(element) => {
                rewardRefs.current[reward.id] = element
              }}
            >
              <WishlistItem
                reward={reward}
                balance={balance}
                usage={usageByRewardId.get(reward.id)!}
                isHighlighted={highlightedRewardId === reward.id}
                isRecentlyRedeemed={recentlyRedeemedRewardId === reward.id}
                onEdit={() => {
                  setEditingReward(reward)
                  setIsModalOpen(true)
                }}
                onDelete={() => setDeleteConfirmation({ isOpen: true, rewardId: reward.id })}
                onRedeemTier={(tier) => handleRedeemTier(reward, tier)}
                onArchive={() => archiveReward(reward.id)}
                onUnarchive={() => unarchiveReward(reward.id)}
              />
            </div>
          ))
        )}

        {archivedRewards.length > 0 && (
          <>
            <div className="xl:col-span-2 relative flex items-center py-4">
              <div className="flex-grow border-t border-border" />
              <span className="mx-4 text-sm text-muted-foreground">{t('archivedSectionTitle')}</span>
              <div className="flex-grow border-t border-border" />
            </div>

            {archivedRewards.map((reward) => (
              <WishlistItem
                key={reward.id}
                reward={reward}
                balance={balance}
                usage={usageByRewardId.get(reward.id)!}
                onEdit={() => {
                  setEditingReward(reward)
                  setIsModalOpen(true)
                }}
                onDelete={() => setDeleteConfirmation({ isOpen: true, rewardId: reward.id })}
                onRedeemTier={(tier) => handleRedeemTier(reward, tier)}
                onArchive={() => archiveReward(reward.id)}
                onUnarchive={() => unarchiveReward(reward.id)}
              />
            ))}
          </>
        )}
      </div>

      {isModalOpen && (
        <AddEditWishlistItemModal
          isOpen={isModalOpen}
          setIsOpen={setIsModalOpen}
          editingItem={editingReward}
          setEditingItem={setEditingReward}
          addReward={addReward}
          editReward={editReward}
        />
      )}

      <ConfirmDialog
        isOpen={deleteConfirmation.isOpen}
        onClose={() => setDeleteConfirmation({ isOpen: false, rewardId: null })}
        onConfirm={() => {
          if (deleteConfirmation.rewardId) {
            deleteReward(deleteConfirmation.rewardId)
          }
          setDeleteConfirmation({ isOpen: false, rewardId: null })
        }}
        title={t('deleteDialogTitle')}
        message={t('deleteDialogMessage')}
        confirmText={t('deleteButton')}
      />
    </div>
  )
}
