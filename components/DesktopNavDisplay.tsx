'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ElementType } from 'react'
import { ChevronLeft, ChevronRight, PanelLeft } from 'lucide-react'
import { useAtom } from 'jotai'
import { cn } from '@/lib/utils'
import { browserSettingsAtom } from '@/lib/atoms'
import { Button } from './ui/button'

export interface NavItemType {
  icon: ElementType
  label: string
  href: string
  position: 'main' | 'bottom'
}

interface DesktopNavDisplayProps {
  navItems: NavItemType[]
  className?: string
}

export default function DesktopNavDisplay({ navItems, className }: DesktopNavDisplayProps) {
  const pathname = usePathname()
  const [browserSettings, setBrowserSettings] = useAtom(browserSettingsAtom)
  const desktopNavItems = navItems.filter((item) => item.position === 'main')
  const collapsed = browserSettings.sidebarCollapsed

  return (
    <aside className={cn('hidden shrink-0 border-r bg-muted/30 transition-all lg:block', collapsed ? 'w-16' : 'w-60', className)}>
      <div className="sticky top-12 flex h-[calc(100vh-3rem)] flex-col px-2 py-4">
        <div className={cn('mb-3 flex items-center', collapsed ? 'justify-center' : 'justify-between px-1')}>
          {!collapsed && (
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <PanelLeft className="h-4 w-4" />
              <span>Navigation</span>
            </div>
          )}
          <Button
            variant="outline"
            size={collapsed ? 'icon' : 'sm'}
            onClick={() => setBrowserSettings((prev) => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }))}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={collapsed ? 'h-8 w-8' : 'h-8 gap-1 px-2'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            {!collapsed && <span>Collapse</span>}
          </Button>
        </div>
        <nav className="space-y-1">
          {desktopNavItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center rounded-md px-3 py-2 text-sm transition-colors',
                  collapsed ? 'justify-center' : 'gap-3',
                  isActive
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
                title={collapsed ? item.label : undefined}
              >
                <span className={cn(
                  'flex h-4 w-4 items-center justify-center transition-colors',
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground',
                )}>
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
