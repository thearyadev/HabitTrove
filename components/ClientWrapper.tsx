'use client'

import { ReactNode } from 'react'
import { useAtom } from 'jotai'
import { aboutOpenAtom, pomodoroAtom } from '@/lib/atoms'
import PomodoroTimer from './PomodoroTimer'
import AboutModal from './AboutModal'

function ClientWrapperContent({ children }: { children: ReactNode }) {
  const [pomo] = useAtom(pomodoroAtom)
  const [aboutOpen, setAboutOpen] = useAtom(aboutOpenAtom)

  return (
    <>
      {children}
      {pomo.show && <PomodoroTimer />}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </>
  )
}

export default function ClientWrapper({ children }: { children: ReactNode }) {
  return <ClientWrapperContent>{children}</ClientWrapperContent>
}
