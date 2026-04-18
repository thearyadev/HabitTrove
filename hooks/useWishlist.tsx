import { useAtom } from 'jotai'
import { useTranslations } from 'next-intl'
import { coinsAtom, wishlistAtom } from '@/lib/atoms'
import { redeemRewardTier as redeemRewardTierAction, saveWishlistItems } from '@/app/actions/data'
import { toast } from '@/hooks/use-toast'
import { RewardDefinition, RewardTier } from '@/lib/types'
import { celebrations } from '@/utils/celebrations'
import { translateWithFallback } from '@/lib/i18n'

export function useWishlist() {
  const t = useTranslations('useWishlist')
  const tx = (key: string, fallback: string, values?: Record<string, string | number>) =>
    translateWithFallback(t, key, fallback, values)
  const [wishlist, setWishlist] = useAtom(wishlistAtom)
  const [, setCoins] = useAtom(coinsAtom)

  const addReward = async (reward: Omit<RewardDefinition, 'id'>) => {
    const newReward = { ...reward, id: crypto.randomUUID() }
    const newWishlistData = { rewards: [...wishlist.rewards, newReward] }
    setWishlist(newWishlistData)
    await saveWishlistItems(newWishlistData)
  }

  const editReward = async (updatedReward: RewardDefinition) => {
    const newWishlistData = {
      rewards: wishlist.rewards.map((reward) => reward.id === updatedReward.id ? updatedReward : reward),
    }
    setWishlist(newWishlistData)
    await saveWishlistItems(newWishlistData)
  }

  const deleteReward = async (id: string) => {
    const newWishlistData = {
      rewards: wishlist.rewards.filter((reward) => reward.id !== id),
    }
    setWishlist(newWishlistData)
    await saveWishlistItems(newWishlistData)
  }

  const archiveReward = async (id: string) => {
    const newWishlistData = {
      rewards: wishlist.rewards.map((reward) =>
        reward.id === id ? { ...reward, archived: true } : reward
      ),
    }
    setWishlist(newWishlistData)
    await saveWishlistItems(newWishlistData)
  }

  const unarchiveReward = async (id: string) => {
    const newWishlistData = {
      rewards: wishlist.rewards.map((reward) =>
        reward.id === id ? { ...reward, archived: false } : reward
      ),
    }
    setWishlist(newWishlistData)
    await saveWishlistItems(newWishlistData)
  }

  const redeemRewardTier = async (reward: RewardDefinition, tier: RewardTier) => {
    const result = await redeemRewardTierAction({ rewardId: reward.id, tierId: tier.id })

    if (!result.success) {
      switch (result.reason) {
        case 'INSUFFICIENT_COINS':
          toast({
            title: t('notEnoughCoinsTitle'),
            description: t('notEnoughCoinsDescription', { coinsNeeded: result.coinsNeeded ?? tier.coinCost }),
            variant: 'destructive',
          })
          break
        case 'LIMIT_REACHED':
          toast({
            title: t('redemptionLimitReachedTitle'),
            description: t('redemptionLimitReachedDescription', { itemName: reward.name }),
            variant: 'destructive',
          })
          break
        case 'ARCHIVED':
        case 'NOT_FOUND':
          toast({
            title: tx('rewardUnavailableTitle', 'Reward unavailable'),
            description: tx('rewardUnavailableDescription', 'This reward is no longer available to redeem.'),
            variant: 'destructive',
          })
          break
      }

      return false
    }

    setCoins(result.coins)
    setWishlist(result.wishlist)
    celebrations.emojiParty()

    toast({
      title: t('rewardRedeemedTitle'),
      description: t('rewardRedeemedDescription', {
        itemName: reward.name,
        tierName: tier.name,
        itemCoinCost: tier.coinCost,
      }),
    })

    return true
  }

  return {
    addReward,
    editReward,
    deleteReward,
    archiveReward,
    unarchiveReward,
    redeemRewardTier,
    wishlistRewards: wishlist.rewards,
  }
}
