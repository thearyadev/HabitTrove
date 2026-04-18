'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SmilePlus } from 'lucide-react'

const EMOJIS = [
  '🔥',
  '✨',
  '💪',
  '🎯',
  '✅',
  '🧠',
  '📚',
  '🏃',
  '🧘',
  '💰',
  '🎁',
  '🌿',
  '☕',
  '🎵',
  '🛠️',
  '⭐',
] as const

interface EmojiPickerButtonProps {
  onEmojiSelect: (emoji: string) => void
  inputIdToFocus?: string
}

export default function EmojiPickerButton({
  onEmojiSelect,
  inputIdToFocus,
}: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-full">
          <SmilePlus className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 rounded-2xl border-border/70 bg-card/95 p-3 shadow-xl backdrop-blur"
        align="end"
        onCloseAutoFocus={(event) => {
          if (inputIdToFocus) {
            event.preventDefault()
            const input = document.getElementById(inputIdToFocus) as HTMLInputElement | null
            input?.focus()
          }
        }}
      >
        <div className="grid grid-cols-4 gap-2">
          {EMOJIS.map((emoji) => (
            <Button
              key={emoji}
              type="button"
              variant="ghost"
              className="h-11 rounded-xl border border-transparent text-xl hover:border-border hover:bg-accent"
              onClick={() => {
                onEmojiSelect(emoji)
                setOpen(false)
              }}
            >
              {emoji}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
