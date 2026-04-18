'use client'

import Link from 'next/link'
import { useAtom } from 'jotai'
import { settingsAtom } from '@/lib/atoms'
import { useCoins } from '@/hooks/useCoins'
import { FormattedNumber } from '@/components/FormattedNumber'
import { Coins } from 'lucide-react'
import { Profile } from './Profile'
import { Button } from './ui/button'
import TodayEarnedCoins from './TodayEarnedCoins'

export default function HeaderActions() {
  const [settings] = useAtom(settingsAtom)
  const { balance } = useCoins()

  return (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline" className="h-8 gap-2 px-2.5">
        <Link href="/coins">
          <Coins className="h-4 w-4" />
          <div className="hidden items-baseline gap-1 sm:flex">
            <FormattedNumber
              amount={balance}
              settings={settings}
              className="text-sm font-medium text-foreground"
            />
            <div className="hidden md:block">
              <TodayEarnedCoins />
            </div>
          </div>
        </Link>
      </Button>
      <Profile />
    </div>
  )
}
