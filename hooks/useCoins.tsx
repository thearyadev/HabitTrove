import { useAtom } from 'jotai';
import { useTranslations } from 'next-intl';
import {
  coinsAtom,
  coinsEarnedTodayAtom,
  totalEarnedAtom,
  totalSpentAtom,
  coinsSpentTodayAtom,
  transactionsTodayAtom,
} from '@/lib/atoms'
import { addCoins, removeCoins, updateTransactionNote } from '@/app/actions/data'
import { toast } from '@/hooks/use-toast'
import { MAX_COIN_LIMIT } from '@/lib/constants'

export function useCoins() {
  const t = useTranslations('useCoins');
  const [coins, setCoins] = useAtom(coinsAtom)
  const [atomCoinsEarnedToday] = useAtom(coinsEarnedTodayAtom);
  const [atomTotalEarned] = useAtom(totalEarnedAtom)
  const [atomTotalSpent] = useAtom(totalSpentAtom)
  const [atomCoinsSpentToday] = useAtom(coinsSpentTodayAtom);
  const [atomTransactionsToday] = useAtom(transactionsTodayAtom);
  const transactions = coins.transactions
  const balance = transactions.reduce((sum, transaction) => sum + transaction.amount, 0)

  const add = async (amount: number, description: string, note?: string) => {
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: t("invalidAmountTitle"),
        description: t("invalidAmountDescription")
      })
      return null
    }
    if (amount > MAX_COIN_LIMIT) {
      toast({
        title: t("invalidAmountTitle"),
        description: t("maxAmountExceededDescription", { max: MAX_COIN_LIMIT })
      })
      return null
    }

    const data = await addCoins({
      amount,
      description,
      type: 'MANUAL_ADJUSTMENT',
      note,
    })
    setCoins(data)
    toast({ title: t("successTitle"), description: t("addedCoinsDescription", { amount }) })
    return data
  }

  const remove = async (amount: number, description: string, note?: string) => {
    const numAmount = Math.abs(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      toast({
        title: t("invalidAmountTitle"),
        description: t("invalidAmountDescription")
      })
      return null
    }
    if (numAmount > MAX_COIN_LIMIT) {
      toast({
        title: t("invalidAmountTitle"),
        description: t("maxAmountExceededDescription", { max: MAX_COIN_LIMIT })
      })
      return null
    }

    const data = await removeCoins({
      amount: numAmount,
      description,
      type: 'MANUAL_ADJUSTMENT',
      note,
    })
    setCoins(data)
    toast({ title: t("successTitle"), description: t("removedCoinsDescription", { amount: numAmount }) })
    return data
  }

  const updateNote = async (transactionId: string, note: string) => {
    const transaction = coins.transactions.find(t => t.id === transactionId)
    if (!transaction) {
      toast({
        title: t("invalidAmountTitle"),
        description: t("transactionNotFoundDescription")
      })
      return null
    }

    const newData = await updateTransactionNote(transactionId, note)
    setCoins(newData)
    return newData
  }

  return {
    add,
    remove,
    updateNote,
    balance,
    transactions: transactions,
    coinsEarnedToday: atomCoinsEarnedToday,
    totalEarned: atomTotalEarned,
    totalSpent: atomTotalSpent,
    coinsSpentToday: atomCoinsSpentToday,
    transactionsToday: atomTransactionsToday
  }
}
