'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useAtom } from 'jotai'
import { Minus, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { settingsAtom } from '@/lib/atoms'
import { d2s, t2d } from '@/lib/utils'
import { useCoins } from '@/hooks/useCoins'
import { MAX_COIN_LIMIT } from '@/lib/constants'
import { TransactionType } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormattedNumber } from '@/components/FormattedNumber'
import { TransactionNoteEditor } from './TransactionNoteEditor'
import EmptyState from './EmptyState'
import { History } from 'lucide-react'

export default function CoinsManager() {
  const t = useTranslations('CoinsManager')
  const {
    add,
    remove,
    updateNote,
    balance,
    transactions,
    coinsEarnedToday,
    totalEarned,
    totalSpent,
    coinsSpentToday,
    transactionsToday,
  } = useCoins()
  const [settings] = useAtom(settingsAtom)
  const [amount, setAmount] = useState('0')
  const [pageSize, setPageSize] = useState(50)
  const [currentPage, setCurrentPage] = useState(1)
  const [note, setNote] = useState('')
  const searchParams = useSearchParams()
  const highlightId = searchParams.get('highlight')
  const transactionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useEffect(() => {
    if (highlightId && transactionRefs.current[highlightId]) {
      transactionRefs.current[highlightId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [highlightId, transactions])

  const handleSaveNote = async (transactionId: string, value: string) => {
    await updateNote(transactionId, value)
  }

  const handleDeleteNote = async (transactionId: string) => {
    await updateNote(transactionId, '')
  }

  const handleAddRemoveCoins = async () => {
    const numAmount = Number(amount)
    if (numAmount > 0) {
      await add(numAmount, 'Manual addition', note)
    } else if (numAmount < 0) {
      await remove(Math.abs(numAmount), 'Manual removal', note)
    }
    setAmount('0')
    setNote('')
  }

  const getTransactionTypeLabel = (type: TransactionType) => {
    switch (type) {
      case 'HABIT_COMPLETION': return t('transactionTypeHabitCompletion')
      case 'TASK_COMPLETION': return t('transactionTypeTaskCompletion')
      case 'HABIT_UNDO': return t('transactionTypeHabitUndo')
      case 'TASK_UNDO': return t('transactionTypeTaskUndo')
      case 'WISH_REDEMPTION': return t('transactionTypeWishRedemption')
      case 'MANUAL_ADJUSTMENT': return t('transactionTypeManualAdjustment')
    }
  }

  const statCards = [
    { label: t('totalEarnedLabel'), value: totalEarned },
    { label: t('totalSpentLabel'), value: totalSpent },
    { label: t('totalTransactionsLabel'), value: transactions.length },
    { label: t('todaysEarnedLabel'), value: coinsEarnedToday },
    { label: t('todaysSpentLabel'), value: coinsSpentToday },
    { label: t('todaysTransactionsLabel'), value: transactionsToday },
  ]

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t('currentBalanceLabel')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-3xl font-semibold">
              <FormattedNumber amount={balance} settings={settings} /> {t('coinsSuffix')}
            </div>
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setAmount((prev) => {
                  const current = Number(prev)
                  const next = current - 1
                  return Math.max(next, -MAX_COIN_LIMIT).toString()
                })}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                value={amount}
                onChange={(e) => {
                  const rawValue = e.target.value
                  if (rawValue === '' || rawValue === '-') {
                    setAmount(rawValue)
                    return
                  }
                  const numericValue = Number(rawValue)
                  if (Number.isNaN(numericValue)) return
                  setAmount(Math.max(Math.min(numericValue, MAX_COIN_LIMIT), -MAX_COIN_LIMIT).toString())
                }}
                min={-MAX_COIN_LIMIT}
                max={MAX_COIN_LIMIT}
                className="w-32 text-center"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setAmount((prev) => {
                  const current = Number(prev)
                  const next = current + 1
                  return Math.min(next, MAX_COIN_LIMIT).toString()
                })}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Button onClick={handleAddRemoveCoins} className="w-full">
              {Number(amount) >= 0 ? t('addCoinsButton') : t('removeCoinsButton')}
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {statCards.map((card) => (
            <Card key={card.label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{card.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">
                  {typeof card.value === 'number' ? (
                    <FormattedNumber amount={card.value} settings={settings} />
                  ) : (
                    card.value
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('transactionHistoryTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('showLabel')}</span>
              <select
                className="rounded-md border bg-background px-2 py-1 text-sm"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setCurrentPage(1)
                }}
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={500}>500</option>
              </select>
              <span className="text-sm text-muted-foreground">{t('entriesSuffix')}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {t('showingEntries', {
                from: Math.min((currentPage - 1) * pageSize + 1, transactions.length),
                to: Math.min(currentPage * pageSize, transactions.length),
                total: transactions.length,
              })}
            </div>
          </div>

          {transactions.length === 0 ? (
            <EmptyState
              icon={History}
              title={t('noTransactionsTitle')}
              description={t('noTransactionsDescription')}
            />
          ) : (
            <>
              {transactions
                .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                .map((transaction) => {
                  const isHighlighted = transaction.id === highlightId

                  return (
                    <div
                      key={transaction.id}
                      ref={(el) => { transactionRefs.current[transaction.id] = el }}
                      className={`flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between ${isHighlighted ? 'ring-2 ring-ring' : ''}`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {transaction.relatedItemId ? (
                            <Link
                              href={`${transaction.type === 'WISH_REDEMPTION' ? '/wishlist' : '/habits'}?highlight=${transaction.relatedItemId}`}
                              className="font-medium hover:underline"
                              scroll={true}
                            >
                              {transaction.description}
                            </Link>
                          ) : (
                            <p className="font-medium">{transaction.description}</p>
                          )}
                          <span className="rounded-full bg-secondary px-2 py-1 text-xs text-secondary-foreground">
                            {getTransactionTypeLabel(transaction.type as TransactionType)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {d2s({
                            dateTime: t2d({ timestamp: transaction.timestamp, timezone: settings.system.timezone }),
                            timezone: settings.system.timezone,
                          })}
                        </p>
                        <TransactionNoteEditor
                          transactionId={transaction.id}
                          initialNote={transaction.note}
                          onSave={handleSaveNote}
                          onDelete={handleDeleteNote}
                        />
                      </div>
                      <div className="text-right font-mono text-sm sm:min-w-[96px]">
                        <span className="text-foreground">
                          {transaction.amount >= 0 ? '+' : ''}
                          <FormattedNumber amount={transaction.amount} settings={settings} />
                        </span>
                      </div>
                    </div>
                  )
                })}

              {transactions.length > pageSize && (
                <div className="flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    {t('previousPageButton')}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {t('pageIndicator', { currentPage, totalPages: Math.ceil(transactions.length / pageSize) })}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, Math.ceil(transactions.length / pageSize)))}
                    disabled={currentPage >= Math.ceil(transactions.length / pageSize)}
                  >
                    {t('nextPageButton')}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
