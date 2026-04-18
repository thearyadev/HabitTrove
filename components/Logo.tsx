import Image from "next/image"

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
        <Image src="/icons/icon.png" alt="HabitTrove Logo" width={28} height={28} className="h-4 w-4" />
      </div>
      <span className="text-sm font-semibold">HabitTrove</span>
    </div>
  )
}
