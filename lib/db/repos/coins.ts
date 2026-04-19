import { randomUUID } from 'crypto'
import { DateTime } from 'luxon'
import { getDatabase, withTransaction } from '@/lib/db/client'
import {
  calculateBreakTaxPenalty,
  calculateProjectedMaturityAmount,
  clampInvestmentTermWeeks,
  getClosedWeekStartBoundaries,
  getInterestCheckpointDates,
  getWeeklyInterestRateBps,
  sortAccountsForDisplay,
  WEEKLY_TAX_RATE,
} from '@/lib/finance'
import {
  CoinTransaction,
  CoinsData,
  FinanceAccount,
  TransactionType,
  WeekDay,
} from '@/lib/types'

type AccountRow = {
  id: string
  name: string
  kind: FinanceAccount['kind']
  status: FinanceAccount['status']
  created_at: string
  updated_at: string
  term_weeks: number | null
  weekly_interest_rate_bps: number | null
  principal_amount: number | null
  started_at: string | null
  matures_at: string | null
  closed_at: string | null
  tax_start_at: string | null
}

type LedgerRow = {
  id: string
  account_id: string
  amount: number
  type: TransactionType
  description: string
  posted_at: string
  effective_at: string
  related_item_id: string | null
  related_sub_item_id: string | null
  account_name: string
  account_kind: FinanceAccount['kind']
}

type ScheduledEventRow = {
  id: string
  event_type: 'WEEKLY_PRIMARY_TAX' | 'WEEKLY_INVESTMENT_INTEREST' | 'INVESTMENT_MATURITY'
  account_id: string
  scheduled_for: string
  status: 'PENDING' | 'PROCESSED' | 'CANCELLED'
  dedupe_key: string
}

type SettingsContext = {
  timezone: string
  weekStartDay: WeekDay
}

function getSettingsContext(db: ReturnType<typeof getDatabase>): SettingsContext {
  const row = db.prepare(`
    SELECT timezone, week_start_day
    FROM app_settings
    WHERE singleton = 1
  `).get() as { timezone: string; week_start_day: WeekDay } | undefined

  return {
    timezone: row?.timezone ?? 'UTC',
    weekStartDay: row?.week_start_day ?? 1,
  }
}

function getPrimaryAccountRow(db: ReturnType<typeof getDatabase>) {
  const account = db.prepare(`
    SELECT *
    FROM accounts
    WHERE kind = 'PRIMARY'
    LIMIT 1
  `).get() as AccountRow | undefined

  if (!account) {
    throw new Error('Primary account not found')
  }

  return account
}

function getInvestmentAccountRow(db: ReturnType<typeof getDatabase>, accountId: string) {
  const account = db.prepare(`
    SELECT *
    FROM accounts
    WHERE id = ? AND kind = 'INVESTMENT_TERM'
    LIMIT 1
  `).get(accountId) as AccountRow | undefined

  if (!account) {
    throw new Error('Investment account not found')
  }

  return account
}

function getAccountBalance(db: ReturnType<typeof getDatabase>, accountId: string) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS balance
    FROM ledger_entries
    WHERE account_id = ?
  `).get(accountId) as { balance: number }

  return row.balance
}

function getAccountBalanceBefore(db: ReturnType<typeof getDatabase>, accountId: string, effectiveAtExclusive: string) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS balance
    FROM ledger_entries
    WHERE account_id = ?
      AND effective_at < ?
  `).get(accountId, effectiveAtExclusive) as { balance: number }

  return row.balance
}

function insertScheduledEvent(
  db: ReturnType<typeof getDatabase>,
  event: Omit<ScheduledEventRow, 'id' | 'status'>
) {
  db.prepare(`
    INSERT INTO scheduled_events (
      id,
      event_type,
      account_id,
      scheduled_for,
      status,
      processed_at,
      dedupe_key,
      payload_json,
      error
    ) VALUES (?, ?, ?, ?, 'PENDING', NULL, ?, NULL, NULL)
    ON CONFLICT(dedupe_key) DO NOTHING
  `).run(randomUUID(), event.event_type, event.account_id, event.scheduled_for, event.dedupe_key)
}

function markScheduledEventProcessed(db: ReturnType<typeof getDatabase>, eventId: string, processedAt: string) {
  db.prepare(`
    UPDATE scheduled_events
    SET status = 'PROCESSED', processed_at = ?, error = NULL
    WHERE id = ?
  `).run(processedAt, eventId)
}

function cancelFutureScheduledEvents(db: ReturnType<typeof getDatabase>, accountId: string, processedAt: string) {
  db.prepare(`
    UPDATE scheduled_events
    SET status = 'CANCELLED', processed_at = ?, error = NULL
    WHERE account_id = ? AND status = 'PENDING'
  `).run(processedAt, accountId)
}

function insertLedgerEntry(
  db: ReturnType<typeof getDatabase>,
  {
    id = randomUUID(),
    accountId,
    amount,
    type,
    description,
    postedAt,
    effectiveAt = postedAt,
    relatedItemId,
    relatedSubItemId,
  }: {
    id?: string
    accountId: string
    amount: number
    type: TransactionType
    description: string
    postedAt: string
    effectiveAt?: string
    relatedItemId?: string
    relatedSubItemId?: string
  }
) {
  db.prepare(`
    INSERT INTO ledger_entries (
      id,
      account_id,
      amount,
      type,
      description,
      posted_at,
      effective_at,
      related_item_id,
      related_sub_item_id,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    id,
    accountId,
    amount,
    type,
    description,
    postedAt,
    effectiveAt,
    relatedItemId ?? null,
    relatedSubItemId ?? null,
  )
}

function hydrateAccounts(db: ReturnType<typeof getDatabase>) {
  const rows = db.prepare(`
    SELECT *
    FROM accounts
    ORDER BY created_at ASC
  `).all() as AccountRow[]

  const balanceRows = db.prepare(`
    SELECT account_id, COALESCE(SUM(amount), 0) AS balance
    FROM ledger_entries
    GROUP BY account_id
  `).all() as Array<{ account_id: string; balance: number }>

  const balances = new Map(balanceRows.map((row) => [row.account_id, row.balance]))

  return sortAccountsForDisplay(rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    currentBalance: balances.get(row.id) ?? 0,
    termWeeks: row.term_weeks ?? undefined,
    weeklyInterestRateBps: row.weekly_interest_rate_bps ?? undefined,
    principalAmount: row.principal_amount ?? undefined,
    startedAt: row.started_at ?? undefined,
    maturesAt: row.matures_at ?? undefined,
    closedAt: row.closed_at ?? undefined,
    taxStartAt: row.tax_start_at ?? undefined,
    availableForWithdrawal: row.kind === 'INVESTMENT_TERM' && row.status === 'MATURED',
  } satisfies FinanceAccount)))
}

function hydrateTransactions(db: ReturnType<typeof getDatabase>): CoinTransaction[] {
  const rows = db.prepare(`
    SELECT
      ledger_entries.id,
      ledger_entries.account_id,
      ledger_entries.amount,
      ledger_entries.type,
      ledger_entries.description,
      ledger_entries.posted_at,
      ledger_entries.effective_at,
      ledger_entries.related_item_id,
      ledger_entries.related_sub_item_id,
      accounts.name AS account_name,
      accounts.kind AS account_kind
    FROM ledger_entries
    INNER JOIN accounts ON accounts.id = ledger_entries.account_id
    ORDER BY ledger_entries.effective_at DESC, ledger_entries.posted_at DESC, ledger_entries.id DESC
  `).all() as LedgerRow[]

  return rows.map((row) => ({
    id: row.id,
    accountId: row.account_id,
    accountKind: row.account_kind,
    accountName: row.account_name,
    amount: row.amount,
    type: row.type,
    description: row.description,
    timestamp: row.posted_at,
    effectiveAt: row.effective_at,
    relatedItemId: row.related_item_id ?? undefined,
    relatedSubItemId: row.related_sub_item_id ?? undefined,
  }))
}

function readCoinsData(db: ReturnType<typeof getDatabase>): CoinsData {
  const accounts = hydrateAccounts(db)
  const primaryAccount = accounts.find((account) => account.kind === 'PRIMARY')

  return {
    primaryAccountId: primaryAccount?.id ?? null,
    primaryBalance: primaryAccount?.currentBalance ?? 0,
    shelteredBalance: accounts
      .filter((account) => account.kind === 'INVESTMENT_TERM' && account.currentBalance > 0)
      .reduce((sum, account) => sum + account.currentBalance, 0),
    accounts,
    transactions: hydrateTransactions(db),
  }
}

function ensurePrimaryTaxEvents(
  db: ReturnType<typeof getDatabase>,
  primaryAccount: AccountRow,
  settings: SettingsContext,
  now: DateTime,
) {
  const taxStartAt = primaryAccount.tax_start_at ?? primaryAccount.created_at
  const boundaries = getClosedWeekStartBoundaries({
    timezone: settings.timezone,
    weekStartDay: settings.weekStartDay,
    startAt: taxStartAt,
    now,
  })

  for (const boundary of boundaries) {
    insertScheduledEvent(db, {
      event_type: 'WEEKLY_PRIMARY_TAX',
      account_id: primaryAccount.id,
      scheduled_for: boundary,
      dedupe_key: `tax:${primaryAccount.id}:${boundary}`,
    })
  }
}

function ensureInvestmentEvents(db: ReturnType<typeof getDatabase>, account: AccountRow) {
  if (
    account.kind !== 'INVESTMENT_TERM'
    || !account.started_at
    || !account.term_weeks
    || !account.weekly_interest_rate_bps
    || account.status === 'BROKEN'
    || account.status === 'CLOSED'
  ) {
    return
  }

  for (const checkpoint of getInterestCheckpointDates(account.started_at, account.term_weeks)) {
    insertScheduledEvent(db, {
      event_type: 'WEEKLY_INVESTMENT_INTEREST',
      account_id: account.id,
      scheduled_for: checkpoint,
      dedupe_key: `interest:${account.id}:${checkpoint}`,
    })
  }

  if (account.matures_at) {
    insertScheduledEvent(db, {
      event_type: 'INVESTMENT_MATURITY',
      account_id: account.id,
      scheduled_for: account.matures_at,
      dedupe_key: `maturity:${account.id}:${account.matures_at}`,
    })
  }
}

function ensureScheduledEvents(db: ReturnType<typeof getDatabase>, now: DateTime) {
  const settings = getSettingsContext(db)
  const primaryAccount = getPrimaryAccountRow(db)
  ensurePrimaryTaxEvents(db, primaryAccount, settings, now)

  const investmentAccounts = db.prepare(`
    SELECT *
    FROM accounts
    WHERE kind = 'INVESTMENT_TERM'
  `).all() as AccountRow[]

  for (const account of investmentAccounts) {
    ensureInvestmentEvents(db, account)
  }
}

function processTaxEvent(
  db: ReturnType<typeof getDatabase>,
  event: ScheduledEventRow,
  processedAt: string,
) {
  const primaryAccount = getPrimaryAccountRow(db)
  const endingBalance = Math.max(0, getAccountBalanceBefore(db, primaryAccount.id, event.scheduled_for))
  const taxAmount = endingBalance * 0.3

  if (taxAmount > 0) {
    insertLedgerEntry(db, {
      accountId: primaryAccount.id,
      amount: -taxAmount,
      type: 'PRIMARY_TAX',
      description: 'Weekly tax on primary ending balance',
      postedAt: processedAt,
      effectiveAt: event.scheduled_for,
    })
  }

  markScheduledEventProcessed(db, event.id, processedAt)
}

function processInvestmentInterestEvent(
  db: ReturnType<typeof getDatabase>,
  event: ScheduledEventRow,
  processedAt: string,
) {
  const account = getInvestmentAccountRow(db, event.account_id)
  if (account.status !== 'ACTIVE' || !account.weekly_interest_rate_bps) {
    markScheduledEventProcessed(db, event.id, processedAt)
    return
  }

  const balance = Math.max(0, getAccountBalanceBefore(db, account.id, event.scheduled_for))
  const interestAmount = (balance * account.weekly_interest_rate_bps) / 10_000

  if (interestAmount > 0) {
    insertLedgerEntry(db, {
      accountId: account.id,
      amount: interestAmount,
      type: 'INVESTMENT_INTEREST',
      description: `Weekly compound interest (${(account.weekly_interest_rate_bps / 100).toFixed(2)}%)`,
      postedAt: processedAt,
      effectiveAt: event.scheduled_for,
    })
  }

  markScheduledEventProcessed(db, event.id, processedAt)
}

function processInvestmentMaturityEvent(
  db: ReturnType<typeof getDatabase>,
  event: ScheduledEventRow,
  processedAt: string,
) {
  const account = getInvestmentAccountRow(db, event.account_id)
  if (account.status === 'ACTIVE') {
    db.prepare(`
      UPDATE accounts
      SET status = 'MATURED', updated_at = ?
      WHERE id = ?
    `).run(processedAt, account.id)
  }

  markScheduledEventProcessed(db, event.id, processedAt)
}

function runDueFinancialEventsInTransaction(db: ReturnType<typeof getDatabase>, now = DateTime.now()) {
  ensureScheduledEvents(db, now)

  const processedAt = now.toUTC().toISO()!
  const dueEvents = db.prepare(`
    SELECT id, event_type, account_id, scheduled_for, status, dedupe_key
    FROM scheduled_events
    WHERE status = 'PENDING' AND scheduled_for <= ?
    ORDER BY
      scheduled_for ASC,
      CASE event_type
        WHEN 'WEEKLY_INVESTMENT_INTEREST' THEN 1
        WHEN 'INVESTMENT_MATURITY' THEN 2
        WHEN 'WEEKLY_PRIMARY_TAX' THEN 3
        ELSE 4
      END ASC,
      id ASC
  `).all(processedAt) as ScheduledEventRow[]

  for (const event of dueEvents) {
    switch (event.event_type) {
      case 'WEEKLY_PRIMARY_TAX':
        processTaxEvent(db, event, processedAt)
        break
      case 'WEEKLY_INVESTMENT_INTEREST':
        processInvestmentInterestEvent(db, event, processedAt)
        break
      case 'INVESTMENT_MATURITY':
        processInvestmentMaturityEvent(db, event, processedAt)
        break
    }
  }
}

export function runDueFinancialEvents() {
  return withTransaction((db) => {
    runDueFinancialEventsInTransaction(db)
  })
}

export function getCoins(): CoinsData {
  return withTransaction((db) => {
    runDueFinancialEventsInTransaction(db)
    return readCoinsData(db)
  })
}

export function postPrimaryTransaction({
  amount,
  description,
  type,
  relatedItemId,
  relatedSubItemId,
  effectiveAt,
}: {
  amount: number
  description: string
  type: TransactionType
  relatedItemId?: string
  relatedSubItemId?: string
  effectiveAt?: string
}) {
  return withTransaction((db) => {
    runDueFinancialEventsInTransaction(db)
    const primaryAccount = getPrimaryAccountRow(db)
    const timestamp = DateTime.now().toUTC().toISO()!

    insertLedgerEntry(db, {
      accountId: primaryAccount.id,
      amount,
      type,
      description,
      postedAt: timestamp,
      effectiveAt: effectiveAt ?? timestamp,
      relatedItemId,
      relatedSubItemId,
    })

    return readCoinsData(db)
  })
}

export function spendPrimaryTransaction({
  amount,
  description,
  type,
  relatedItemId,
  relatedSubItemId,
}: {
  amount: number
  description: string
  type: TransactionType
  relatedItemId?: string
  relatedSubItemId?: string
}) {
  return withTransaction((db) => {
    runDueFinancialEventsInTransaction(db)
    const primaryAccount = getPrimaryAccountRow(db)
    const spendAmount = Math.abs(amount)
    const primaryBalance = getAccountBalance(db, primaryAccount.id)

    if (primaryBalance < spendAmount) {
      throw new Error('Insufficient primary balance')
    }

    const timestamp = DateTime.now().toUTC().toISO()!
    insertLedgerEntry(db, {
      accountId: primaryAccount.id,
      amount: -spendAmount,
      type,
      description,
      postedAt: timestamp,
      effectiveAt: timestamp,
      relatedItemId,
      relatedSubItemId,
    })

    return readCoinsData(db)
  })
}

export function createInvestmentAccount({
  amount,
  termWeeks,
}: {
  amount: number
  termWeeks: number
}) {
  return withTransaction((db) => {
    runDueFinancialEventsInTransaction(db)

    const principal = Math.max(0, amount)
    if (principal <= 0) {
      throw new Error('Investment amount must be greater than 0')
    }

    const primaryAccount = getPrimaryAccountRow(db)
    const primaryBalance = getAccountBalance(db, primaryAccount.id)
    if (primaryBalance < principal) {
      throw new Error('Insufficient primary balance')
    }

    const normalizedTermWeeks = clampInvestmentTermWeeks(termWeeks)
    const weeklyInterestRateBps = getWeeklyInterestRateBps(normalizedTermWeeks)
    const now = DateTime.now().toUTC()
    const nowIso = now.toISO()!
    const maturesAt = now.plus({ weeks: normalizedTermWeeks }).toISO()!
    const accountId = randomUUID()
    const projectedBalance = calculateProjectedMaturityAmount(principal, normalizedTermWeeks, weeklyInterestRateBps)

    db.prepare(`
      INSERT INTO accounts (
        id,
        name,
        kind,
        status,
        created_at,
        updated_at,
        term_weeks,
        weekly_interest_rate_bps,
        principal_amount,
        started_at,
        matures_at,
        closed_at,
        tax_start_at
      ) VALUES (?, ?, 'INVESTMENT_TERM', 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
    `).run(
      accountId,
      `${normalizedTermWeeks}-week term`,
      nowIso,
      nowIso,
      normalizedTermWeeks,
      weeklyInterestRateBps,
      principal,
      nowIso,
      maturesAt,
    )

    insertLedgerEntry(db, {
      accountId: primaryAccount.id,
      amount: -principal,
      type: 'PRIMARY_TO_INVESTMENT',
      description: `Opened ${normalizedTermWeeks}-week investment`,
      postedAt: nowIso,
      effectiveAt: nowIso,
      relatedItemId: accountId,
    })

    insertLedgerEntry(db, {
      accountId,
      amount: principal,
      type: 'INVESTMENT_PRINCIPAL',
      description: `Funded from primary account. Projects to ${projectedBalance} coins.`,
      postedAt: nowIso,
      effectiveAt: nowIso,
    })

    ensureInvestmentEvents(db, getInvestmentAccountRow(db, accountId))

    return readCoinsData(db)
  })
}

export function breakInvestmentAccount(accountId: string) {
  return withTransaction((db) => {
    runDueFinancialEventsInTransaction(db)

    const account = getInvestmentAccountRow(db, accountId)
    if (account.status !== 'ACTIVE') {
      throw new Error('Only active investments can be broken early')
    }

    const currentBalance = Math.max(0, getAccountBalance(db, account.id))
    const principal = Math.max(0, account.principal_amount ?? 0)
    const primaryAccount = getPrimaryAccountRow(db)
    const now = DateTime.now()
    const nowIso = now.toUTC().toISO()!
    const settings = getSettingsContext(db)
    const forfeitedAmount = Math.max(0, currentBalance - principal)

    const taxPenalty = account.started_at
      ? calculateBreakTaxPenalty({
          principal,
          startedAt: account.started_at,
          timezone: settings.timezone,
          weekStartDay: settings.weekStartDay,
          now,
        })
      : 0

    if (forfeitedAmount > 0) {
      insertLedgerEntry(db, {
        accountId: account.id,
        amount: -forfeitedAmount,
        type: 'INVESTMENT_BREAK_FORFEIT',
        description: 'Early withdrawal forfeited accrued interest',
        postedAt: nowIso,
        effectiveAt: nowIso,
      })
    }

    if (principal > 0) {
      insertLedgerEntry(db, {
        accountId: account.id,
        amount: -principal,
        type: 'INVESTMENT_BREAK_RETURN',
        description: 'Returned principal to primary account',
        postedAt: nowIso,
        effectiveAt: nowIso,
      })

      insertLedgerEntry(db, {
        accountId: primaryAccount.id,
        amount: principal,
        type: 'INVESTMENT_BREAK_RECEIPT',
        description: `Recovered principal from ${account.name}`,
        postedAt: nowIso,
        effectiveAt: nowIso,
        relatedItemId: account.id,
      })
    }

    if (taxPenalty > 0) {
      insertLedgerEntry(db, {
        accountId: primaryAccount.id,
        amount: -taxPenalty,
        type: 'INVESTMENT_BREAK_TAX_PENALTY',
        description: `Back tax on ${account.name}: ${WEEKLY_TAX_RATE * 100}% × ${principal} × missed weeks`,
        postedAt: nowIso,
        effectiveAt: nowIso,
        relatedItemId: account.id,
      })
    }

    db.prepare(`
      UPDATE accounts
      SET status = 'BROKEN', closed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(nowIso, nowIso, account.id)

    cancelFutureScheduledEvents(db, account.id, nowIso)

    return readCoinsData(db)
  })
}

export function withdrawInvestmentAccount(accountId: string) {
  return withTransaction((db) => {
    runDueFinancialEventsInTransaction(db)

    const account = getInvestmentAccountRow(db, accountId)
    if (account.status !== 'MATURED') {
      throw new Error('Investment is not ready for withdrawal')
    }

    const currentBalance = Math.max(0, getAccountBalance(db, account.id))
    if (currentBalance <= 0) {
      throw new Error('Investment balance is empty')
    }

    const primaryAccount = getPrimaryAccountRow(db)
    const nowIso = DateTime.now().toUTC().toISO()!

    insertLedgerEntry(db, {
      accountId: account.id,
      amount: -currentBalance,
      type: 'INVESTMENT_WITHDRAWAL',
      description: 'Transferred matured balance to primary account',
      postedAt: nowIso,
      effectiveAt: nowIso,
    })

    insertLedgerEntry(db, {
      accountId: primaryAccount.id,
      amount: currentBalance,
      type: 'INVESTMENT_WITHDRAWAL_RECEIPT',
      description: `Withdrew matured funds from ${account.name}`,
      postedAt: nowIso,
      effectiveAt: nowIso,
      relatedItemId: account.id,
    })

    db.prepare(`
      UPDATE accounts
      SET status = 'CLOSED', closed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(nowIso, nowIso, account.id)

    cancelFutureScheduledEvents(db, account.id, nowIso)

    return readCoinsData(db)
  })
}

export function getPrimaryBalance() {
  return withTransaction((db) => {
    runDueFinancialEventsInTransaction(db)
    const primaryAccount = getPrimaryAccountRow(db)
    return getAccountBalance(db, primaryAccount.id)
  })
}
