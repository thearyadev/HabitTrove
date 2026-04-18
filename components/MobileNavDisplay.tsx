'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ElementType } from 'react'
import { cn } from '@/lib/utils'

export interface NavItemType {
  icon: ElementType
  label: string
  href: string
  position: 'main' | 'bottom'
}

interface MobileNavDisplayProps {
  navItems: NavItemType[]
}

function isIOS() {
  if (typeof navigator === 'undefined') {
    return false
  }

  return [
    'iPad Simulator',
    'iPhone Simulator',
    'iPod Simulator',
    'iPad',
    'iPhone',
    'iPod',
  ].includes(navigator.platform) || (navigator.userAgent.includes('Mac') && 'ontouchend' in document)
}

export default function MobileNavDisplay({ navItems }: MobileNavDisplayProps) {
  const pathname = usePathname()
  const mobileNavItems = navItems.filter((item) => item.position === 'main' || item.position === 'bottom')
  const ios = isIOS()
  const columnClass =
    mobileNavItems.length <= 4 ? 'grid-cols-4' : mobileNavItems.length === 5 ? 'grid-cols-5' : 'grid-cols-6'

  return (
    <>
      <div className={cn('lg:hidden', ios ? 'pb-24' : 'pb-20')} />
      <nav className={cn('fixed bottom-0 left-0 right-0 z-50 border-t bg-background px-3 py-2 lg:hidden', ios && 'pb-6')}>
        <div className={cn('mx-auto grid max-w-2xl gap-1', columnClass)}>
          {mobileNavItems.map((item) => {
            const isActive = pathname === item.href

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex min-w-0 flex-col items-center gap-1 rounded-md px-2 py-2 text-[11px] font-medium transition-colors',
                  isActive
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="w-full truncate text-center leading-tight">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
