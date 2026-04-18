'use client'

import { useAtom } from 'jotai'
import { wishlistAtom, habitsAtom } from '@/lib/atoms'
import DailyOverview from './DailyOverview'
import HabitStreak from './HabitStreak'
import CoinBalance from './CoinBalance'
import { useCoins } from '@/hooks/useCoins'
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Coins, Gift, ListChecks } from 'lucide-react'

export default function Dashboard() {
  const t = useTranslations('Dashboard');
  const [habitsData] = useAtom(habitsAtom)
  const habits = habitsData.habits
  const { balance } = useCoins()
  const [wishlist] = useAtom(wishlistAtom)
  const wishlistItems = wishlist.items
  const activeHabits = habits.filter((habit) => !habit.archived)
  const activeRewards = wishlistItems.filter((item) => !item.archived)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          Focus on what is due, what is earning, and what reward is actually within reach today.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Balance</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Coins className="h-4 w-4 text-muted-foreground" />
            <div className="text-2xl font-semibold">{balance}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active habits</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            <div className="text-2xl font-semibold">{activeHabits.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Wishlist items</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Gift className="h-4 w-4 text-muted-foreground" />
            <div className="text-2xl font-semibold">{activeRewards.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid items-start grid-cols-1 gap-6">
          <CoinBalance coinBalance={balance} />
          <HabitStreak habits={habits} />
        </div>
        <div className="min-w-0">
          <DailyOverview
            wishlistItems={wishlistItems}
            habits={habits}
            coinBalance={balance}
          />
        </div>
      </div>
    </div>
  )
}
