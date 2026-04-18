'use client'

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Settings, Info, User } from "lucide-react"
import Link from "next/link"
import { useAtom } from "jotai"
import { aboutOpenAtom } from "@/lib/atoms"
import { useTranslations } from 'next-intl'

export function Profile() {
  const t = useTranslations('Profile')
  const [, setAboutOpen] = useAtom(aboutOpenAtom)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
          <User className="h-4 w-4" />
          <span className="sr-only">{t('guestUsername')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href="/settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span>{t('settingsLink')}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setAboutOpen(true)} className="flex items-center gap-2">
          <Info className="h-4 w-4" />
          <span>{t('aboutButton')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
