import { Logo } from '@/components/Logo'
import Link from 'next/link'
import HeaderActions from './HeaderActions'

interface HeaderProps {
  className?: string
}


export default function Header({ className }: HeaderProps) {
  return (
    <header className={`sticky top-0 z-40 border-b bg-background ${className || ''}`}>
      <div className="mx-auto flex h-12 w-full max-w-screen-2xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="min-w-0">
          <Link href="/" className="block">
            <Logo />
          </Link>
        </div>
        <HeaderActions />
      </div>
    </header>
  )
}
