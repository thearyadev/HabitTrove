'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAtom } from 'jotai'
import { AlertTriangle, Landmark, PiggyBank, Shield, Sparkles, TrendingUp } from 'lucide-react'
import { settingsAtom } from '@/lib/atoms'
import { calculateProjectedMaturityAmount, formatRatePercent, getCurrentWeekStart, getWeeklyInterestRateBps, WEEKLY_TAX_RATE } from '@/lib/finance'
import { d2s, formatDecimal, t2d } from '@/lib/utils'
import { useCoins } from '@/hooks/useCoins'
import { MAX_COIN_LIMIT } from '@/lib/constants'
import { FinanceAccount, TransactionType } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { FormattedNumber } from '@/components/FormattedNumber'
import { getBreakPreview } from '@/app/actions/data'
import EmptyState from './EmptyState'

const TERM_OPTIONS = [1, 4, 8, 12, 24]

function getTransactionTypeLabel(type: TransactionType) {
  switch (type) {
    case 'HABIT_COMPLETION':
      return 'Habit reward'
    case 'TASK_COMPLETION':
      return 'Task reward'
    case 'WISH_REDEMPTION':
      return 'Reward redeemed'
    case 'MANUAL_ADJUSTMENT':
      return 'Manual adjustment'
    case 'PRIMARY_TAX':
      return 'Weekly tax'
    case 'PRIMARY_TO_INVESTMENT':
      return 'Funded shelter'
    case 'INVESTMENT_PRINCIPAL':
      return 'Shelter funded'
    case 'INVESTMENT_INTEREST':
      return 'Weekly interest'
    case 'INVESTMENT_BREAK_FORFEIT':
      return 'Interest forfeited'
    case 'INVESTMENT_BREAK_TAX_PENALTY':
      return 'Back tax on early break'
    case 'INVESTMENT_BREAK_RETURN':
      return 'Principal released'
    case 'INVESTMENT_BREAK_RECEIPT':
      return 'Principal recovered'
    case 'INVESTMENT_WITHDRAWAL':
      return 'Matured withdrawal'
    case 'INVESTMENT_WITHDRAWAL_RECEIPT':
      return 'Matured receipt'
    case 'LEGACY_UNDO':
      return 'Legacy correction'
  }
}

function getStatusLabel(account: FinanceAccount) {
  switch (account.status) {
    case 'ACTIVE':
      return 'Active'
    case 'MATURED':
      return 'Ready to withdraw'
    case 'BROKEN':
      return 'Broken early'
    case 'CLOSED':
      return 'Closed'
  }
}

function getLedgerLink(transaction: { type: TransactionType; relatedItemId?: string }) {
  if (!transaction.relatedItemId) {
    return null
  }

  if (transaction.type === 'WISH_REDEMPTION') {
    return `/wishlist?highlight=${transaction.relatedItemId}`
  }

  if (transaction.type === 'HABIT_COMPLETION' || transaction.type === 'TASK_COMPLETION') {
    return `/habits?highlight=${transaction.relatedItemId}`
  }

  return null
}

export default function CoinsManager() {
  const [settings] = useAtom(settingsAtom)
  const {
    add,
    remove,
    createInvestment,
    breakInvestment,
    withdrawInvestment,
    balance,
    shelteredBalance,
    primaryAccount,
    investmentAccounts,
    transactions,
    coinsEarnedToday,
    totalEarned,
    totalSpent,
    coinsSpentToday,
    transactionsToday,
  } = useCoins()

  const [manualAmount, setManualAmount] = useState('0')
  const [manualDescription, setManualDescription] = useState('Manual adjustment')
  const [investmentAmount, setInvestmentAmount] = useState('50')
  const [termWeeks, setTermWeeks] = useState(TERM_OPTIONS[1].toString())
  const [pageSize, setPageSize] = useState(50)
  const [currentPage, setCurrentPage] = useState(1)
  const [breakTarget, setBreakTarget] = useState<FinanceAccount | null>(null)
  const [breakPreview, setBreakPreview] = useState<{
    principal: number
    forfeitedInterest: number
    taxPenalty: number
    totalLoss: number
    netReturned: number
  } | null>(null)
  const [isBreakLoading, setIsBreakLoading] = useState(false)
  const searchParams = useSearchParams()
  const highlightId = searchParams.get('highlight')
  const transactionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (highlightId && transactionRefs.current[highlightId]) {
      transactionRefs.current[highlightId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightId, transactions])

  const nextTaxAt = useMemo(() => (
    getCurrentWeekStart(settings.system.timezone, settings.system.weekStartDay)
      .plus({ weeks: 1 })
  ), [settings.system.timezone, settings.system.weekStartDay])

  const nextTaxAmount = Math.max(balance, 0) * 0.3
  const selectedTermWeeks = Number(termWeeks)
  const selectedRateBps = getWeeklyInterestRateBps(selectedTermWeeks)
  const selectedInvestmentAmount = Math.max(0, Number(investmentAmount) || 0)
  const projectedMaturity = calculateProjectedMaturityAmount(selectedInvestmentAmount, selectedTermWeeks, selectedRateBps)

  const stats = [
    { label: 'Earned today', value: coinsEarnedToday, accent: 'text-emerald-400' },
    { label: 'Spent today', value: coinsSpentToday, accent: 'text-amber-300' },
    { label: 'Total inflow', value: totalEarned, accent: 'text-sky-300' },
    { label: 'Total outflow', value: totalSpent, accent: 'text-rose-300' },
    { label: 'Today rows', value: transactionsToday, accent: 'text-violet-300' },
  ]

  const handleManualSubmit = async () => {
    const amount = Number(manualAmount)
    if (amount > 0) {
      await add(amount, manualDescription.trim() || 'Manual addition')
    } else if (amount < 0) {
      await remove(Math.abs(amount), manualDescription.trim() || 'Manual removal')
    }

    setManualAmount('0')
    setManualDescription('Manual adjustment')
  }

  const pagedTransactions = transactions.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.25),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(250,204,21,0.15),_transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(17,24,39,0.92))] p-6 shadow-2xl shadow-slate-950/30">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:28px_28px] opacity-20" />
        <div className="relative grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs uppercase tracking-[0.28em] text-sky-200">
              <Shield className="h-3.5 w-3.5" />
              Spend it or lose it
            </div>
            <div>
              <h1 className="font-display text-4xl font-semibold tracking-tight text-white">Accounts</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Primary coins stay liquid for habits and rewards. Tax hits 30% of primary ending balance every closed week. Shelter accounts lock coins away, compound weekly, and protect them from tax while term lives.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-200">
                    <Landmark className="h-4 w-4 text-sky-300" />
                    Primary account
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-4xl font-semibold text-white">
                    <FormattedNumber amount={balance} settings={settings} />
                  </div>
                  <p className="text-sm text-slate-300">Reward spending, habit income, manual adjustments, weekly tax.</p>
                </CardContent>
              </Card>
              <Card className="border-white/10 bg-white/5 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-200">
                    <PiggyBank className="h-4 w-4 text-emerald-300" />
                    Sheltered balance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-4xl font-semibold text-white">
                    <FormattedNumber amount={shelteredBalance} settings={settings} />
                  </div>
                  <p className="text-sm text-slate-300">Locked away from reward spending. No weekly tax while sheltered.</p>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card className="border-white/10 bg-black/20 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-100">
                <Sparkles className="h-4 w-4 text-amber-300" />
                Next weekly hit
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-4xl font-semibold text-amber-200">
                  <FormattedNumber amount={nextTaxAmount} settings={settings} />
                </div>
                <p className="mt-1 text-sm text-slate-300">Estimated tax if primary balance closed right now.</p>
              </div>
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-50">
                <div className="font-medium">Tax boundary</div>
                <div className="mt-1 text-amber-100/80">
                  {d2s({ dateTime: nextTaxAt, timezone: settings.system.timezone })}
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm text-emerald-50">
                <div className="font-medium">Shelter rule</div>
                <div className="mt-1 text-emerald-100/80">Move coins before boundary. Tax only sees primary balance. Early break incurs back tax.</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border/60 bg-card/60 backdrop-blur">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-semibold ${stat.accent}`}>
                <FormattedNumber amount={stat.value} settings={settings} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <Card className="border-border/60 bg-card/70">
            <CardHeader>
              <CardTitle>Manual primary adjustment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                value={manualDescription}
                onChange={(event) => setManualDescription(event.target.value)}
                placeholder="Reason"
              />
              <div className="flex gap-3">
                <Input
                  type="number"
                  step="any"
                  value={manualAmount}
                  onChange={(event) => {
                    const rawValue = event.target.value
                    if (rawValue === '' || rawValue === '-') {
                      setManualAmount(rawValue)
                      return
                    }

                    const numericValue = Number(rawValue)
                    if (Number.isNaN(numericValue)) return
                    const clamped = Math.max(Math.min(numericValue, MAX_COIN_LIMIT), -MAX_COIN_LIMIT)
                    setManualAmount(clamped.toString())
                  }}
                  min={-MAX_COIN_LIMIT}
                  max={MAX_COIN_LIMIT}
                />
                <Button onClick={handleManualSubmit} className="min-w-32">
                  {Number(manualAmount) >= 0 ? 'Post credit' : 'Post debit'}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Immutable ledger. No edit. No delete. Use correction entry if needed.</p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                Open shelter account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Amount from primary</label>
                  <Input
                    type="number"
                    step="any"
                    min={0.01}
                    max={Math.max(balance, 0.01)}
                    value={investmentAmount}
                    onChange={(event) => setInvestmentAmount(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Term</label>
                  <select
                    value={termWeeks}
                    onChange={(event) => setTermWeeks(event.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    {TERM_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option} week{option === 1 ? '' : 's'}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 sm:grid-cols-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-emerald-300">Weekly rate</div>
                  <div className="mt-1 text-xl font-semibold text-foreground">{formatRatePercent(selectedRateBps)}%</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-emerald-300">Projected maturity</div>
                  <div className="mt-1 text-xl font-semibold text-foreground">
                    <FormattedNumber amount={projectedMaturity} settings={settings} />
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-emerald-300">Break early</div>
                  <div className="mt-1 text-sm text-muted-foreground">Interest dies. Back tax applies ({formatDecimal(WEEKLY_TAX_RATE * 100)}% × principal per missed week).</div>
                </div>
              </div>
              <Button
                onClick={async () => {
                  await createInvestment(selectedInvestmentAmount, selectedTermWeeks)
                }}
                disabled={selectedInvestmentAmount <= 0 || selectedInvestmentAmount > balance}
                className="w-full"
              >
                Open shelter
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70">
            <CardHeader>
              <CardTitle>Term accounts</CardTitle>
            </CardHeader>
            <CardContent>
              {investmentAccounts.length === 0 ? (
                <EmptyState
                  icon={PiggyBank}
                  title="No shelter accounts yet"
                  description="Open one before weekly tax closes if you want coins protected."
                />
              ) : (
                <div className="space-y-3">
                  {investmentAccounts.map((account) => {
                    const projected = calculateProjectedMaturityAmount(
                      account.principalAmount ?? 0,
                      account.termWeeks ?? 1,
                      account.weeklyInterestRateBps ?? 0,
                    )

                    return (
                      <div key={account.id} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-medium">{account.name}</div>
                              <span className="rounded-full bg-secondary px-2 py-1 text-xs text-secondary-foreground">
                                {getStatusLabel(account)}
                              </span>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {account.termWeeks} week term at {formatRatePercent(account.weeklyInterestRateBps ?? 0)}% weekly
                            </div>
                            {account.maturesAt && (
                              <div className="text-sm text-muted-foreground">
                                Matures {d2s({ dateTime: t2d({ timestamp: account.maturesAt, timezone: settings.system.timezone }), timezone: settings.system.timezone })}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-semibold text-foreground">
                              <FormattedNumber amount={account.currentBalance} settings={settings} />
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Projected <FormattedNumber amount={projected} settings={settings} />
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {account.availableForWithdrawal ? (
                            <Button size="sm" onClick={async () => { await withdrawInvestment(account.id) }}>
                              Withdraw to primary
                            </Button>
                          ) : account.status === 'ACTIVE' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                const preview = await getBreakPreview(account.id)
                                setBreakTarget(account)
                                setBreakPreview(preview)
                              }}
                            >
                              Break early
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/60 bg-card/70">
          <CardHeader>
            <CardTitle>Immutable ledger</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Show</span>
                <select
                  className="rounded-md border bg-background px-2 py-1 text-sm"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value))
                    setCurrentPage(1)
                  }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>rows</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {transactions.length === 0
                  ? 'No rows yet'
                  : `${Math.min((currentPage - 1) * pageSize + 1, transactions.length)}-${Math.min(currentPage * pageSize, transactions.length)} of ${transactions.length}`}
              </div>
            </div>

            {transactions.length === 0 ? (
              <EmptyState
                icon={Landmark}
                title="Ledger empty"
                description="Complete habits, redeem rewards, or open shelter accounts to start posting entries."
              />
            ) : (
              <>
                <div className="space-y-3">
                  {pagedTransactions.map((transaction) => {
                    const href = getLedgerLink(transaction)
                    const isHighlighted = transaction.id === highlightId

                    return (
                      <div
                        key={transaction.id}
                        ref={(element) => {
                          transactionRefs.current[transaction.id] = element
                        }}
                        className={`rounded-2xl border p-4 transition-colors ${isHighlighted ? 'border-sky-400/60 bg-sky-400/10' : 'border-border/70 bg-background/60'}`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {href ? (
                                <Link href={href} className="font-medium hover:underline">
                                  {transaction.description}
                                </Link>
                              ) : (
                                <div className="font-medium">{transaction.description}</div>
                              )}
                              <span className="rounded-full bg-secondary px-2 py-1 text-xs text-secondary-foreground">
                                {getTransactionTypeLabel(transaction.type)}
                              </span>
                              <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                                {transaction.accountName}
                              </span>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Effective {d2s({ dateTime: t2d({ timestamp: transaction.effectiveAt, timezone: settings.system.timezone }), timezone: settings.system.timezone })}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-lg font-semibold ${transaction.amount >= 0 ? 'text-emerald-400' : 'text-amber-300'}`}>
                              {transaction.amount >= 0 ? '+' : ''}
                              <FormattedNumber amount={transaction.amount} settings={settings} />
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {transactions.length > pageSize && (
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {currentPage} / {Math.ceil(transactions.length / pageSize)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, Math.ceil(transactions.length / pageSize)))}
                      disabled={currentPage >= Math.ceil(transactions.length / pageSize)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {primaryAccount && (
        <Card className="border-border/60 bg-card/70">
          <CardHeader>
            <CardTitle>Primary account rules</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
              <div className="text-sm font-medium">Tax base</div>
              <p className="mt-2 text-sm text-muted-foreground">Full primary ending balance every closed week. No exceptions for idle coins.</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
              <div className="text-sm font-medium">Ledger policy</div>
              <p className="mt-2 text-sm text-muted-foreground">Posted rows immutable. Corrections happen through new rows, never edits.</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
              <div className="text-sm font-medium">Reward spending</div>
              <p className="mt-2 text-sm text-muted-foreground">Wishlist redemptions can only spend liquid primary balance. Sheltered coins do not count.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!breakTarget} onOpenChange={(open) => { if (!open) { setBreakTarget(null); setBreakPreview(null) } }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Break {breakTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-sm">
                <p className="text-muted-foreground">
                  Early break forfeits all accrued interest and charges back tax for every closed week the principal was sheltered.
                </p>
                {breakPreview && (
                  <div className="rounded-xl border border-border/70 bg-background/70 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Principal returned</span>
                      <span className="font-medium"><FormattedNumber amount={breakPreview.principal} settings={settings} /></span>
                    </div>
                    {breakPreview.forfeitedInterest > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Interest forfeited</span>
                        <span className="font-medium text-amber-500">-<FormattedNumber amount={breakPreview.forfeitedInterest} settings={settings} /></span>
                      </div>
                    )}
                    {breakPreview.taxPenalty > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Back tax ({formatDecimal(WEEKLY_TAX_RATE * 100)}% × principal × missed weeks)</span>
                        <span className="font-medium text-rose-500">-<FormattedNumber amount={breakPreview.taxPenalty} settings={settings} /></span>
                      </div>
                    )}
                    <div className="border-t pt-3 flex items-center justify-between">
                      <span className="font-medium">Net to primary</span>
                      <span className={`text-lg font-semibold ${breakPreview.netReturned > 0 ? 'text-foreground' : 'text-rose-500'}`}>
                        <FormattedNumber amount={breakPreview.netReturned} settings={settings} />
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBreakLoading}>Keep sheltered</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBreakLoading}
              className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600"
              onClick={async () => {
                if (!breakTarget) return
                setIsBreakLoading(true)
                try {
                  await breakInvestment(breakTarget.id)
                } finally {
                  setIsBreakLoading(false)
                  setBreakTarget(null)
                  setBreakPreview(null)
                }
              }}
            >
              {isBreakLoading ? 'Breaking...' : 'Break and accept losses'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
