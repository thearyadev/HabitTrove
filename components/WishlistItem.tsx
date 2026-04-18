import { useAtom } from 'jotai'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  Archive,
  ArchiveRestore,
  Coins,
  Edit,
  ExternalLink,
  Gift,
  MoreVertical,
  Trash2,
} from 'lucide-react'
import { RewardDefinition, RewardTier } from '@/lib/types'
import { RewardUsageSummary, sortRewardTiers } from '@/lib/rewards'
import { settingsAtom } from '@/lib/atoms'
import { translateWithFallback } from '@/lib/i18n'
import { d2s, t2d } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'


interface WishlistItemProps {
  reward: RewardDefinition
  balance: number
  usage: RewardUsageSummary
  onEdit: () => void
  onDelete: () => void
  onRedeemTier: (tier: RewardTier) => void
  onArchive: () => void
  onUnarchive: () => void
  isHighlighted?: boolean
  isRecentlyRedeemed?: boolean
}

export default function WishlistItem({
  reward,
  balance,
  usage,
  onEdit,
  onDelete,
  onRedeemTier,
  onArchive,
  onUnarchive,
  isHighlighted,
  isRecentlyRedeemed,
}: WishlistItemProps) {
  const t = useTranslations('WishlistItem')
  const tx = (key: string, fallback: string, values?: Record<string, string | number>) =>
    translateWithFallback(t, key, fallback, values)
  const [settings] = useAtom(settingsAtom)

  const sortedTiers = sortRewardTiers(reward.tiers)

  const windowLabel = usage.window === 'unlimited'
    ? tx('windowUnlimited', 'unlimited')
    : tx(`windowName.${usage.window}`, usage.window === 'daily' ? 'day' : usage.window === 'weekly' ? 'week' : 'month')

  const limitLabel = usage.window === 'unlimited'
    ? tx('limitUnlimited', 'Unlimited')
    : tx('limitSummary', '{count} per {window}', {
        count: usage.maxRedemptions ?? 1,
        window: windowLabel,
      })

  const usageLabel = usage.window === 'unlimited'
    ? tx('usageUnlimited', 'Unlimited redemption window')
    : tx('usageSummary', '{used}/{total} used this {window}', {
        used: usage.used,
        total: usage.maxRedemptions ?? 1,
        window: windowLabel,
      })

  return (
    <Card
      id={`wishlist-${reward.id}`}
      className={[
        'h-full border-border/70 bg-gradient-to-br from-background via-background to-secondary/20 transition-all duration-500',
        isHighlighted ? 'ring-2 ring-yellow-400/80' : '',
        isRecentlyRedeemed ? 'shadow-lg ring-2 ring-primary' : '',
        reward.archived ? 'opacity-70' : '',
      ].join(' ')}
    >
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="line-clamp-1 text-xl">{reward.name}</CardTitle>
              <Badge variant={usage.isExhausted ? 'secondary' : 'outline'}>{limitLabel}</Badge>
              {reward.link && (
                <Badge variant="secondary" className="gap-1">
                  <ExternalLink className="h-3 w-3" />
                  {tx('hasLinkBadge', 'opens link')}
                </Badge>
              )}
            </div>

            {reward.description && (
              <CardDescription className="whitespace-pre-line break-words text-sm leading-6">
                {reward.description}
              </CardDescription>
            )}

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{usageLabel}</span>
              {usage.isExhausted && usage.endsAt && (
                <span>
                  {tx('nextResetLabel', 'Resets {date}', {
                    date: d2s({
                      dateTime: t2d({ timestamp: usage.endsAt, timezone: settings.system.timezone }),
                      timezone: settings.system.timezone,
                    }),
                  })}
                </span>
              )}
              {reward.link && (
                <Link
                  href={reward.link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                >
                  {tx('openLink', 'Open link')}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!reward.archived && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t('editButton')}
                  </DropdownMenuItem>
                )}
                {!reward.archived && (
                  <DropdownMenuItem onClick={onArchive}>
                    <Archive className="mr-2 h-4 w-4" />
                    {t('archiveButton')}
                  </DropdownMenuItem>
                )}
                {reward.archived && (
                  <DropdownMenuItem onClick={onUnarchive}>
                    <ArchiveRestore className="mr-2 h-4 w-4" />
                    {t('unarchiveButton')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                  onClick={onDelete}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('deleteButton')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {sortedTiers.map((tier) => {
          const isAffordable = tier.coinCost <= balance
          const isDisabled = reward.archived || usage.isExhausted || !isAffordable

          return (
            <div
              key={tier.id}
              className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/70 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{tier.name}</span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                  <Coins className="h-3.5 w-3.5 text-yellow-500" />
                  <span>{tier.coinCost} {t('coinsSuffix')}</span>
                </div>
              </div>

              <Button
                type="button"
                size="sm"
                variant={isAffordable && !usage.isExhausted ? 'default' : 'secondary'}
                onClick={() => onRedeemTier(tier)}
                disabled={isDisabled}
                className="sm:min-w-[132px]"
              >
                <Gift className="h-4 w-4" />
                {usage.isExhausted
                  ? tx('unavailableButton', 'Unavailable')
                  : isAffordable
                    ? tx('redeemButton', 'Redeem')
                    : tx('needMoreCoinsButton', 'Need coins')}
              </Button>
            </div>
          )
        })}
      </CardContent>

      <CardFooter className="justify-between text-xs text-muted-foreground">
        <span>{tx('tiersCount', '{count} tiers', { count: reward.tiers.length })}</span>
        <span>{tx('fromCoins', 'From {coins} coins', { coins: sortedTiers[0]?.coinCost ?? 0 })}</span>
      </CardFooter>
    </Card>
  )
}
