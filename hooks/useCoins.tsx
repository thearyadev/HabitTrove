import { useAtom } from 'jotai'
import { useTranslations } from 'next-intl'
import {
  coinsAtom,
  coinsEarnedTodayAtom,
  coinsSpentTodayAtom,
  shelteredBalanceAtom,
  totalEarnedAtom,
  totalSpentAtom,
  transactionsTodayAtom,
} from '@/lib/atoms'
import {
  addCoins,
  breakInvestment,
  openInvestmentAccount,
  removeCoins,
  withdrawInvestment,
} from '@/app/actions/data'
import { translateWithFallback } from '@/lib/i18n'
import { toast } from '@/hooks/use-toast'
import { MAX_COIN_LIMIT } from '@/lib/constants'

export function useCoins() {
  const t = useTranslations('useCoins')
  const tx = (key: string, fallback: string, values?: Record<string, string | number>) =>
    translateWithFallback(t, key, fallback, values)
  const [coins, setCoins] = useAtom(coinsAtom)
  const [coinsEarnedToday] = useAtom(coinsEarnedTodayAtom)
  const [totalEarned] = useAtom(totalEarnedAtom)
  const [totalSpent] = useAtom(totalSpentAtom)
  const [coinsSpentToday] = useAtom(coinsSpentTodayAtom)
  const [transactionsToday] = useAtom(transactionsTodayAtom)
  const [shelteredBalance] = useAtom(shelteredBalanceAtom)

  const add = async (amount: number, description: string, note?: string) => {
    if (Number.isNaN(amount) || amount <= 0) {
      toast({ title: t('invalidAmountTitle'), description: t('invalidAmountDescription') })
      return null
    }

    if (amount > MAX_COIN_LIMIT) {
      toast({ title: t('invalidAmountTitle'), description: t('maxAmountExceededDescription', { max: MAX_COIN_LIMIT }) })
      return null
    }

    const data = await addCoins({
      amount,
      description,
      type: 'MANUAL_ADJUSTMENT',
      note,
    })
    setCoins(data)
    toast({ title: t('successTitle'), description: t('addedCoinsDescription', { amount }) })
    return data
  }

  const remove = async (amount: number, description: string, note?: string) => {
    const value = Math.abs(amount)
    if (Number.isNaN(value) || value <= 0) {
      toast({ title: t('invalidAmountTitle'), description: t('invalidAmountDescription') })
      return null
    }

    if (value > MAX_COIN_LIMIT) {
      toast({ title: t('invalidAmountTitle'), description: t('maxAmountExceededDescription', { max: MAX_COIN_LIMIT }) })
      return null
    }

    const data = await removeCoins({
      amount: value,
      description,
      type: 'MANUAL_ADJUSTMENT',
      note,
    })
    setCoins(data)
    toast({ title: t('successTitle'), description: t('removedCoinsDescription', { amount: value }) })
    return data
  }

  const createInvestment = async (amount: number, termWeeks: number) => {
    try {
      const data = await openInvestmentAccount({ amount, termWeeks })
      setCoins(data)
      toast({
        title: tx('investmentOpenedTitle', 'Investment opened'),
        description: tx('investmentOpenedDescription', 'Moved {amount} coins into {termWeeks}-week shelter.', { amount, termWeeks }),
      })
      return data
    } catch (error) {
      toast({
        title: tx('investmentErrorTitle', 'Investment error'),
        description: error instanceof Error ? error.message : tx('investmentErrorDescription', 'Unable to update investment account.'),
        variant: 'destructive',
      })
      return null
    }
  }

  const breakInvestmentAccountById = async (accountId: string) => {
    try {
      const data = await breakInvestment(accountId)
      setCoins(data)
      toast({
        title: tx('investmentBrokenTitle', 'Investment broken'),
        description: tx('investmentBrokenDescription', 'Returned principal to primary account. Interest forfeited.'),
      })
      return data
    } catch (error) {
      toast({
        title: tx('investmentErrorTitle', 'Investment error'),
        description: error instanceof Error ? error.message : tx('investmentErrorDescription', 'Unable to update investment account.'),
        variant: 'destructive',
      })
      return null
    }
  }

  const withdrawInvestmentAccountById = async (accountId: string) => {
    try {
      const data = await withdrawInvestment(accountId)
      setCoins(data)
      toast({
        title: tx('investmentWithdrawnTitle', 'Investment withdrawn'),
        description: tx('investmentWithdrawnDescription', 'Moved matured balance back to primary account.'),
      })
      return data
    } catch (error) {
      toast({
        title: tx('investmentErrorTitle', 'Investment error'),
        description: error instanceof Error ? error.message : tx('investmentErrorDescription', 'Unable to update investment account.'),
        variant: 'destructive',
      })
      return null
    }
  }

  return {
    add,
    remove,
    createInvestment,
    breakInvestment: breakInvestmentAccountById,
    withdrawInvestment: withdrawInvestmentAccountById,
    balance: coins.primaryBalance,
    shelteredBalance,
    accounts: coins.accounts,
    primaryAccount: coins.accounts.find((account) => account.id === coins.primaryAccountId) ?? null,
    investmentAccounts: coins.accounts.filter((account) => account.kind === 'INVESTMENT_TERM'),
    transactions: coins.transactions,
    coinsEarnedToday,
    totalEarned,
    totalSpent,
    coinsSpentToday,
    transactionsToday,
  }
}
