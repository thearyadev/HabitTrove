import { RRule } from "rrule"
import { DateTime } from "luxon"

export type HabitTrackingMode = 'standard' | 'quantity'

export type HabitCompletion = {
  id: string
  completedAt: string
  quantity?: number
  coinsAwarded?: number
}

export type Habit = {
  id: string
  name: string
  description: string
  frequency: string
  coinReward: number
  trackingMode?: HabitTrackingMode
  quantityUnit?: string
  baseRate?: number
  baseUnit?: number
  bonusThreshold?: number
  scaleFactor?: number
  targetCompletions?: number // Optional field, default to 1
  completions: HabitCompletion[]
  isTask?: boolean // mark the habit as a task
  archived?: boolean // mark the habit as archived
  pinned?: boolean // mark the habit as pinned
}


export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly'

export type RewardLimitWindow = 'unlimited' | 'daily' | 'weekly' | 'monthly'

export type RewardTier = {
  id: string
  name: string
  coinCost: number
  position: number
}

export type RewardRedemptionRule = {
  window: RewardLimitWindow
  maxRedemptions?: number
}

export type RewardDefinition = {
  id: string
  name: string
  description: string
  archived?: boolean // mark the wishlist item as archived
  link?: string // Optional URL to external resource
  redemptionRule: RewardRedemptionRule
  tiers: RewardTier[]
}

export type AccountKind = 'PRIMARY' | 'INVESTMENT_TERM'

export type AccountStatus = 'ACTIVE' | 'MATURED' | 'BROKEN' | 'CLOSED'

export type TransactionType =
  | 'HABIT_COMPLETION'
  | 'TASK_COMPLETION'
  | 'WISH_REDEMPTION'
  | 'MANUAL_ADJUSTMENT'
  | 'PRIMARY_TAX'
  | 'PRIMARY_TO_INVESTMENT'
  | 'INVESTMENT_PRINCIPAL'
  | 'INVESTMENT_INTEREST'
  | 'INVESTMENT_BREAK_FORFEIT'
  | 'INVESTMENT_BREAK_TAX_PENALTY'
  | 'INVESTMENT_BREAK_RETURN'
  | 'INVESTMENT_BREAK_RECEIPT'
  | 'INVESTMENT_WITHDRAWAL'
  | 'INVESTMENT_WITHDRAWAL_RECEIPT'
  | 'LEGACY_UNDO'

export interface FinanceAccount {
  id: string
  name: string
  kind: AccountKind
  status: AccountStatus
  createdAt: string
  updatedAt: string
  currentBalance: number
  termWeeks?: number
  weeklyInterestRateBps?: number
  principalAmount?: number
  startedAt?: string
  maturesAt?: string
  closedAt?: string
  taxStartAt?: string
  availableForWithdrawal?: boolean
}

export interface CoinTransaction {
  id: string
  accountId: string
  accountKind: AccountKind
  accountName: string
  amount: number
  type: TransactionType
  description: string
  timestamp: string
  effectiveAt: string
  relatedItemId?: string
  relatedSubItemId?: string
}

export interface HabitsData {
  habits: Habit[];
}


export interface CoinsData {
  primaryAccountId: string | null
  primaryBalance: number
  shelteredBalance: number
  accounts: FinanceAccount[]
  transactions: CoinTransaction[]
}

// Default value functions
// Data container types
export interface WishlistData {
  rewards: RewardDefinition[];
}

export const getDefaultHabitsData = (): HabitsData => ({
  habits: []
});


export const getDefaultCoinsData = (): CoinsData => ({
  primaryAccountId: null,
  primaryBalance: 0,
  shelteredBalance: 0,
  accounts: [],
  transactions: []
})

export const getDefaultWishlistData = (): WishlistData => ({
  rewards: []
});

export const getDefaultSettings = (): Settings => ({
  ui: {
    useNumberFormatting: true,
    useGrouping: true,
  },
  system: {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    weekStartDay: 1, // Monday
    autoBackupEnabled: false,
    language: 'en', // Default language
  },
  profile: {}
});

export const getDefaultServerSettings = (): ServerSettings => ({
  isDemo: false
})

// Map of data types to their default values
export const DATA_DEFAULTS = {
  wishlist: getDefaultWishlistData,
  habits: getDefaultHabitsData,
  coins: getDefaultCoinsData,
  settings: getDefaultSettings,
} as const;

// Type for all possible data types
export type DataType = keyof typeof DATA_DEFAULTS;

export interface UISettings {
  useNumberFormatting: boolean;
  useGrouping: boolean;
}

export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 6 = Saturday

export interface SystemSettings {
  timezone: string;
  weekStartDay: WeekDay;
  autoBackupEnabled: boolean; // Add this line
  language: string; // Add this line for language preference
}

export interface ProfileSettings {
  avatarPath?: string; // deprecated
}

export interface Settings {
  ui: UISettings;
  system: SystemSettings;
  profile: ProfileSettings;
}

export type CompletionCache = {
  [dateKey: string]: {  // dateKey format: "YYYY-MM-DD"
    [habitId: string]: number  // number of completions on that date
  }
}

export type ViewType = 'habits' | 'tasks'

export interface JotaiHydrateInitialValues {
  settings: Settings;
  coins: CoinsData;
  habits: HabitsData;
  wishlist: WishlistData;
  serverSettings: ServerSettings;
}

export interface ServerSettings {
  isDemo: boolean
}

export type ParsedResultType = DateTime<true> | RRule | string | null // null if invalid

// return rrule / datetime (machine-readable frequency), string (human-readable frequency), or null (invalid)
export interface ParsedFrequencyResult {
  message: string | null
  result: ParsedResultType
}
