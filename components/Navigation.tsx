'use client'

import { Home, Gift, Coins } from 'lucide-react'
import { useAtom } from 'jotai'
import { browserSettingsAtom } from '@/lib/atoms'
import { ElementType } from 'react'
import { useTranslations } from 'next-intl'
import { HabitIcon, TaskIcon } from '@/lib/constants'
import MobileNavDisplay from './MobileNavDisplay'
import DesktopNavDisplay from './DesktopNavDisplay'

type ViewPort = 'main' | 'mobile'

export interface NavItemType {
  icon: ElementType;
  label: string;
  href: string;
  position: 'main' | 'bottom';
}

interface NavigationProps {
  className?: string
  viewPort: ViewPort
}


export default function Navigation({ className, viewPort }: NavigationProps) {
  const t = useTranslations('Navigation')
  const [browserSettings] = useAtom(browserSettingsAtom)
  const isTasksView = browserSettings.viewType === 'tasks'

  const currentNavItems: NavItemType[] = [
    { icon: Home, label: t('dashboard'), href: '/', position: 'main' },
    {
      icon: isTasksView ? TaskIcon : HabitIcon,
      label: isTasksView ? t('tasks') : t('habits'),
      href: '/habits',
      position: 'main'
    },
    { icon: Gift, label: t('wishlist'), href: '/wishlist', position: 'main' },
    { icon: Coins, label: t('coins'), href: '/coins', position: 'main' },
  ]

  if (viewPort === 'mobile') {
    return <MobileNavDisplay navItems={currentNavItems} />
  }

  if (viewPort === 'main') {
    return <DesktopNavDisplay navItems={currentNavItems} className={className} />
  }

  return null
}
