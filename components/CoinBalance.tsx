'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Coins } from 'lucide-react'
import { FormattedNumber } from '@/components/FormattedNumber'
import { useAtom } from 'jotai'
import { useTranslations } from 'next-intl'
import { settingsAtom } from '@/lib/atoms'
import TodayEarnedCoins from './TodayEarnedCoins'

export default function CoinBalance({ coinBalance }: { coinBalance: number }) {
  const t = useTranslations('CoinBalance');
  const [settings] = useAtom(settingsAtom)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('coinBalanceTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
              <Coins className="h-5 w-5" />
            </div>
            <div className="text-3xl font-semibold">
              <FormattedNumber amount={coinBalance} settings={settings} />
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            <TodayEarnedCoins longFormat={true} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
