'use client'

import { useAtom } from 'jotai'
import { wishlistAtom, habitsAtom, settingsAtom } from '@/lib/atoms'
import DailyOverview from './DailyOverview'
import HabitStreak from './HabitStreak'
import CoinBalance from './CoinBalance'
import { useCoins } from '@/hooks/useCoins'
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Coins, Gift, ListChecks } from 'lucide-react'
import { FormattedNumber } from './FormattedNumber'

export default function Dashboard() {
  const t = useTranslations('Dashboard');
  const [habitsData] = useAtom(habitsAtom)
  const habits = habitsData.habits
  const { balance, shelteredBalance, investmentAccounts } = useCoins()
  const [wishlist] = useAtom(wishlistAtom)
  const [settings] = useAtom(settingsAtom)
  const wishlistRewards = wishlist.rewards
  const activeHabits = habits.filter((habit) => !habit.archived)

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
            <div>
              <div className="text-2xl font-semibold"><FormattedNumber amount={balance} settings={settings} /></div>
              <div className="text-xs text-muted-foreground">Primary</div>
            </div>
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
            <CardTitle className="text-sm font-medium">Sheltered</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Gift className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-2xl font-semibold"><FormattedNumber amount={shelteredBalance} settings={settings} /></div>
              <div className="text-xs text-muted-foreground">{investmentAccounts.filter((account) => account.status !== 'CLOSED').length} term accounts</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid items-start grid-cols-1 gap-6">
          <CoinBalance coinBalance={balance} shelteredBalance={shelteredBalance} />
          <HabitStreak habits={habits} />
        </div>
        <div className="min-w-0">
          <DailyOverview
            wishlistRewards={wishlistRewards}
            habits={habits}
            coinBalance={balance}
          />
        </div>
      </div>
    </div>
  )
}
