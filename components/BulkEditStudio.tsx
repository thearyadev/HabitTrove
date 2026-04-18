'use client'

import { ChangeEvent, useDeferredValue, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAtom } from 'jotai'
import { AlertTriangle, Download, FileJson, Loader2, RefreshCw, Upload } from 'lucide-react'
import { habitsAtom, wishlistAtom } from '@/lib/atoms'
import { exportBulkEditData, syncBulkEditData } from '@/app/actions/data'
import { formatBulkEditValidationError, parseBulkEditJson } from '@/lib/bulk-edit'
import { cn } from '@/lib/utils'
import { toast } from '@/hooks/use-toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'

type PreviewSummary = {
  habits: { create: number; update: number; delete: number }
  tasks: { create: number; update: number; delete: number }
  rewards: { create: number; update: number; delete: number }
}

function buildPreviewSummary(
  input: {
    habits: Array<{ id?: string }>
    tasks: Array<{ id?: string }>
    rewards: Array<{ id?: string }>
  },
  current: {
    habitIds: Set<string>
    taskIds: Set<string>
    rewardIds: Set<string>
  }
): PreviewSummary {
  const incomingHabitIds = new Set(input.habits.flatMap((habit) => habit.id ? [habit.id] : []))
  const incomingTaskIds = new Set(input.tasks.flatMap((task) => task.id ? [task.id] : []))
  const incomingRewardIds = new Set(input.rewards.flatMap((reward) => reward.id ? [reward.id] : []))

  return {
    habits: {
      create: input.habits.filter((habit) => !habit.id || !current.habitIds.has(habit.id)).length,
      update: input.habits.filter((habit) => !!habit.id && current.habitIds.has(habit.id)).length,
      delete: [...current.habitIds].filter((id) => !incomingHabitIds.has(id)).length,
    },
    tasks: {
      create: input.tasks.filter((task) => !task.id || !current.taskIds.has(task.id)).length,
      update: input.tasks.filter((task) => !!task.id && current.taskIds.has(task.id)).length,
      delete: [...current.taskIds].filter((id) => !incomingTaskIds.has(id)).length,
    },
    rewards: {
      create: input.rewards.filter((reward) => !reward.id || !current.rewardIds.has(reward.id)).length,
      update: input.rewards.filter((reward) => !!reward.id && current.rewardIds.has(reward.id)).length,
      delete: [...current.rewardIds].filter((id) => !incomingRewardIds.has(id)).length,
    },
  }
}

function SummaryRow({
  label,
  stats,
}: {
  label: string
  stats: { create: number; update: number; delete: number }
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background/70 px-4 py-3">
      <div className="text-sm font-medium">{label}</div>
      <div className="flex items-center gap-2 text-xs">
        <Badge variant="secondary">Create {stats.create}</Badge>
        <Badge variant="secondary">Update {stats.update}</Badge>
        <Badge variant={stats.delete > 0 ? 'destructive' : 'secondary'}>Delete {stats.delete}</Badge>
      </div>
    </div>
  )
}

function CountRow({
  label,
  count,
}: {
  label: string
  count: number
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background/70 px-4 py-3">
      <div className="text-sm font-medium">{label}</div>
      <Badge variant="secondary">Active {count}</Badge>
    </div>
  )
}

export default function BulkEditStudio() {
  const router = useRouter()
  const [habitsData, setHabitsData] = useAtom(habitsAtom)
  const [wishlistData, setWishlistData] = useAtom(wishlistAtom)
  const [jsonInput, setJsonInput] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isWorking, setIsWorking] = useState(false)
  const [isRefreshing, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const deferredJsonInput = useDeferredValue(jsonInput)

  const currentIds = useMemo(() => ({
    habitIds: new Set(habitsData.habits.filter((habit) => !habit.isTask).map((habit) => habit.id)),
    taskIds: new Set(habitsData.habits.filter((habit) => habit.isTask).map((habit) => habit.id)),
    rewardIds: new Set(wishlistData.items.map((reward) => reward.id)),
  }), [habitsData.habits, wishlistData.items])

  const validation = useMemo(() => {
    if (!deferredJsonInput.trim()) {
      return {
        payload: null,
        errors: [] as string[],
      }
    }

    try {
      return {
        payload: parseBulkEditJson(deferredJsonInput),
        errors: [] as string[],
      }
    } catch (error) {
      return {
        payload: null,
        errors: formatBulkEditValidationError(error),
      }
    }
  }, [deferredJsonInput])

  const previewSummary = useMemo(() => {
    if (!validation.payload) {
      return null
    }

    return buildPreviewSummary(validation.payload, currentIds)
  }, [currentIds, validation.payload])

  const destructiveChangeCount = useMemo(() => {
    if (!previewSummary) {
      return 0
    }

    return previewSummary.habits.delete + previewSummary.tasks.delete + previewSummary.rewards.delete
  }, [previewSummary])

  const isPending = isWorking || isRefreshing

  const handleExport = () => {
    setIsWorking(true)
    void exportBulkEditData()
      .then((payload) => {
        const nextJson = JSON.stringify(payload, null, 2)
        setJsonInput(nextJson)

        const blob = new Blob([nextJson], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `habittrove-bulk-edit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
        anchor.click()
        URL.revokeObjectURL(url)

        toast({
          title: 'Bulk edit export ready',
          description: 'The current habits, tasks, and rewards were exported as JSON.',
        })
      })
      .catch((error: unknown) => {
        toast({
          title: 'Export failed',
          description: error instanceof Error ? error.message : 'Could not export the current catalog.',
          variant: 'destructive',
        })
      })
      .finally(() => {
        setIsWorking(false)
      })
  }

  const handleImport = () => {
    if (!validation.payload) {
      return
    }

    setIsWorking(true)
    void syncBulkEditData(jsonInput)
      .then((result) => {
        setHabitsData(result.habits)
        setWishlistData(result.wishlist)
        setConfirmOpen(false)
        startTransition(() => {
          router.refresh()
        })

        toast({
          title: 'Catalog synced',
          description: `${result.summary.habitsCreated + result.summary.tasksCreated + result.summary.rewardsCreated} created, ${result.summary.habitsUpdated + result.summary.tasksUpdated + result.summary.rewardsUpdated} updated, ${result.summary.habitsDeleted + result.summary.tasksDeleted + result.summary.rewardsDeleted} deleted.`,
        })
      })
      .catch((error: unknown) => {
        toast({
          title: 'Import failed',
          description: error instanceof Error ? error.message : 'The JSON could not be applied.',
          variant: 'destructive',
        })
      })
      .finally(() => {
        setIsWorking(false)
      })
  }

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      setJsonInput(await file.text())
      toast({
        title: 'JSON loaded',
        description: `Loaded ${file.name}. Review the preview before syncing.`,
      })
    } catch {
      toast({
        title: 'File read failed',
        description: 'The selected file could not be read.',
        variant: 'destructive',
      })
    } finally {
      event.target.value = ''
    }
  }

  return (
    <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-background via-background to-muted/30 shadow-sm">
      <CardHeader className="space-y-4 border-b border-border/60 bg-muted/20">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="rounded-full px-3 py-1">AI Sync Studio</Badge>
              <Badge variant="outline" className="rounded-full px-3 py-1">JSON</Badge>
            </div>
            <CardTitle className="text-2xl font-semibold tracking-tight">Bulk edit the live catalog without touching history.</CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-6">
              Export your current habits, tasks, and rewards. Let an AI rewrite the JSON. Then import it back to create, update, and delete the live catalog while preserving past completions and coin transactions.
            </CardDescription>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={handleExport} disabled={isPending} className="min-w-[180px]">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export JSON
            </Button>
            <Button variant="outline" disabled={isPending} onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Upload JSON
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {[
            ['1. Export', 'Download a clean JSON snapshot of the current catalog.'],
            ['2. Rewrite', 'Have an AI optimize goals, rewards, and task structure.'],
            ['3. Sync', 'Paste or upload the JSON and confirm the previewed changes.'],
          ].map(([title, description]) => (
            <div key={title} className="rounded-2xl border border-border/60 bg-background/80 p-4">
              <div className="text-sm font-semibold">{title}</div>
              <div className="mt-2 text-sm text-muted-foreground">{description}</div>
            </div>
          ))}
        </div>
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Quantity habits</AlertTitle>
          <AlertDescription>
            For quantity-based habits, edit <code>baseRate</code>, <code>baseUnit</code>, <code>bonusThreshold</code>, and <code>scaleFactor</code>. The importer also treats <code>coinReward</code> as a compatibility fallback for older payloads.
          </AlertDescription>
        </Alert>
      </CardHeader>

      <CardContent className="space-y-6 p-6">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleFileUpload}
        />

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="bulk-json" className="text-sm font-medium">Bulk edit JSON</Label>
              <Button variant="ghost" size="sm" onClick={() => setJsonInput('')} disabled={!jsonInput || isPending}>
                Clear
              </Button>
            </div>
            <Textarea
              id="bulk-json"
              value={jsonInput}
              onChange={(event) => setJsonInput(event.target.value)}
              placeholder={`{\n  "schemaVersion": 1,\n  "habits": [],\n  "tasks": [],\n  "rewards": []\n}`}
              className="min-h-[420px] resize-y font-mono text-xs leading-6"
              spellCheck={false}
            />
          </div>

          <div className="space-y-4">
            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Current catalog</CardTitle>
                <CardDescription>These are the records currently managed by the app.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <CountRow label="Habits" count={currentIds.habitIds.size} />
                <CountRow label="Tasks" count={currentIds.taskIds.size} />
                <CountRow label="Rewards" count={currentIds.rewardIds.size} />
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Validation + preview</CardTitle>
                <CardDescription>The import must pass validation before sync is enabled.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!jsonInput.trim() ? (
                  <Alert>
                    <FileJson className="h-4 w-4" />
                    <AlertTitle>Ready for JSON</AlertTitle>
                    <AlertDescription>Export or upload a payload to preview the impact.</AlertDescription>
                  </Alert>
                ) : validation.errors.length > 0 ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Validation failed</AlertTitle>
                    <AlertDescription className="space-y-3">
                      <div>The payload is invalid and will not be applied.</div>
                      <ScrollArea className="h-40 rounded-md border border-destructive/20 bg-destructive/5 p-3">
                        <div className="space-y-2 text-xs leading-5">
                          {validation.errors.map((error) => (
                            <div key={error}>{error}</div>
                          ))}
                        </div>
                      </ScrollArea>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <Alert>
                      <RefreshCw className="h-4 w-4" />
                      <AlertTitle>Payload is valid</AlertTitle>
                      <AlertDescription>
                        The preview below shows what the sync will do to the live catalog.
                      </AlertDescription>
                    </Alert>

                    {previewSummary ? (
                      <div className="space-y-3">
                        <SummaryRow label="Habits" stats={previewSummary.habits} />
                        <SummaryRow label="Tasks" stats={previewSummary.tasks} />
                        <SummaryRow label="Rewards" stats={previewSummary.rewards} />
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">History safety</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div>Live records are synced from the JSON.</div>
                <div>Past coin transactions are preserved.</div>
                <div>Past habit completion records are preserved.</div>
                <div>Deleting from the JSON removes the record from the live catalog, not from history.</div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className={cn('text-sm text-muted-foreground', destructiveChangeCount > 0 && 'text-foreground')}>
            {validation.payload
              ? destructiveChangeCount > 0
                ? `${destructiveChangeCount} live records will be deleted because they are missing from the JSON.`
                : 'No live records will be deleted by this sync.'
              : 'Validation must pass before sync is available.'}
          </div>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button disabled={!validation.payload || isPending}>
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Apply JSON sync
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apply this JSON to the live catalog?</AlertDialogTitle>
                <AlertDialogDescription>
                  Habits, tasks, and rewards will be created, updated, or deleted to match the JSON exactly. Historical transactions and completion records stay intact.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {previewSummary ? (
                <div className="space-y-2">
                  <SummaryRow label="Habits" stats={previewSummary.habits} />
                  <SummaryRow label="Tasks" stats={previewSummary.tasks} />
                  <SummaryRow label="Rewards" stats={previewSummary.rewards} />
                </div>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction disabled={isPending} onClick={handleImport}>
                  {isPending ? 'Applying...' : 'Confirm sync'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  )
}
