import { SimplePool } from "nostr-tools"
import { signEventWithRemote } from '@/lib/signer-manager'

const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.snort.social',
  'wss://nostr.wine',
  'wss://relay.nostr.band'
]

// Create a simple pool for this module
const pool = new SimplePool()

// Types
export interface StakeSettings {
  dailyWordGoal: number
  rewardPerCompletion: number
  currentBalance: number
  stakeCreatedAt: number
  status: 'active' | 'cancelled'
  lastUpdated: number
}

export interface DailyProgress {
  date: string
  wordCount: number
  goalMet: boolean
  rewardSent: boolean
  rewardAmount: number
  rewardTimestamp: number
}

export interface Transaction {
  type: 'deposit' | 'reward' | 'refund' | 'cancel'
  amount: number
  paymentHash?: string
  balanceBefore: number
  balanceAfter: number
  description: string
  timestamp: number
}

/**
 * Get user's current stake settings
 * This is FAST because it only fetches ONE event (the current stake)
 */
export async function getCurrentStake(userPubkey: string): Promise<StakeSettings | null> {
  console.log('[Nostr] Fetching current stake for:', userPubkey.substring(0, 8))
  
  // pool is already available at module level
  
  // Query for ONLY the current stake event (kind 30078 with d="lightning-goals-current")
  const events = await pool.querySync(RELAYS, {
    kinds: [30078],
    authors: [userPubkey],
    "#d": ["lightning-goals-current"],  // This is the key - only ONE event
    limit: 1  // We only need the most recent
  })
  
  if (events.length === 0) {
    console.log('[Nostr] No active stake found')
    return null
  }
  
  const event = events[0]
  
  // Parse tags into object
  const getTags = (name: string) => event.tags.find(t => t[0] === name)?.[1]
  
  const stake: StakeSettings = {
    dailyWordGoal: parseInt(getTags('daily_word_goal') || '500'),
    rewardPerCompletion: parseInt(getTags('reward_per_completion') || '100'),
    currentBalance: parseInt(getTags('current_balance') || '0'),
    stakeCreatedAt: parseInt(getTags('stake_created_at') || '0'),
    status: getTags('status') as 'active' | 'cancelled' || 'active',
    lastUpdated: parseInt(getTags('last_updated') || '0')
  }
  
  console.log('[Nostr] ✅ Current stake:', stake)
  
  return stake
}

/**
 * Create or update stake settings
 * Because this uses the same d tag, it REPLACES the previous stake event
 */
export async function saveStakeSettings(
  userPubkey: string,
  settings: {
    dailyWordGoal: number
    rewardPerCompletion: number
    currentBalance: number
    stakeCreatedAt?: number
    status?: 'active' | 'cancelled'
  },
  authData: any
): Promise<void> {
  console.log('[Nostr] Saving stake settings:', settings)
  
  const event = {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", "lightning-goals-current"],  // Same d tag = replaces previous
      ["daily_word_goal", settings.dailyWordGoal.toString()],
      ["reward_per_completion", settings.rewardPerCompletion.toString()],
      ["current_balance", settings.currentBalance.toString()],
      ["stake_created_at", (settings.stakeCreatedAt || Date.now()).toString()],
      ["status", settings.status || "active"],
      ["last_updated", Date.now().toString()]
    ],
    content: "",
    pubkey: userPubkey
  }
  
  const signedEvent = await signEventWithRemote(event, authData)
  
  // pool is already available at module level
  await pool.publish(RELAYS, signedEvent)
  
  console.log('[Nostr] ✅ Stake settings saved')
}

/**
 * Get progress for specific date
 */
export async function getDailyProgress(
  userPubkey: string,
  date: string = new Date().toISOString().split('T')[0]
): Promise<DailyProgress | null> {
  console.log('[Nostr] Fetching progress for:', date)
  
  // pool is already available at module level
  
  const events = await pool.querySync(RELAYS, {
    kinds: [30078],
    authors: [userPubkey],
    "#d": [`progress-${date}`],  // Specific day's progress
    limit: 1
  })
  
  if (events.length === 0) {
    console.log('[Nostr] No progress found for', date)
    return null
  }
  
  const event = events[0]
  const getTags = (name: string) => event.tags.find(t => t[0] === name)?.[1]
  
  return {
    date: getTags('date') || date,
    wordCount: parseInt(getTags('word_count') || '0'),
    goalMet: getTags('goal_met') === 'true',
    rewardSent: getTags('reward_sent') === 'true',
    rewardAmount: parseInt(getTags('reward_amount') || '0'),
    rewardTimestamp: parseInt(getTags('reward_timestamp') || '0')
  }
}

/**
 * Record daily progress (creates or updates today's progress event)
 */
export async function recordDailyProgress(
  userPubkey: string,
  wordCount: number,
  goalMet: boolean,
  rewardSent: boolean,
  rewardAmount: number,
  authData: any
): Promise<void> {
  const today = new Date().toISOString().split('T')[0]
  
  console.log('[Nostr] Recording daily progress:', { wordCount, goalMet, rewardSent })
  
  const event = {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", `progress-${today}`],  // Today's unique progress event
      ["date", today],
      ["word_count", wordCount.toString()],
      ["goal_met", goalMet.toString()],
      ["reward_sent", rewardSent.toString()],
      ["reward_amount", rewardAmount.toString()],
      ["reward_timestamp", rewardSent ? Date.now().toString() : "0"]
    ],
    content: "",
    pubkey: userPubkey
  }
  
  const signedEvent = await signEventWithRemote(event, authData)
  
  // pool is already available at module level
  await pool.publish(RELAYS, signedEvent)
  
  console.log('[Nostr] ✅ Daily progress recorded')
}

/**
 * Record a transaction (deposit, reward, refund, etc.)
 */
export async function recordTransaction(
  userPubkey: string,
  tx: {
    type: 'deposit' | 'reward' | 'refund' | 'cancel'
    amount: number  // Positive for deposits, negative for debits
    paymentHash?: string
    balanceBefore: number
    balanceAfter: number
    description: string
  },
  authData: any
): Promise<void> {
  console.log('[Nostr] Recording transaction:', tx)
  
  const txId = `tx-${Date.now()}-${Math.random().toString(36).substring(7)}`
  
  const event = {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", txId],
      ["tx_type", tx.type],
      ["amount", tx.amount.toString()],
      ["payment_hash", tx.paymentHash || ""],
      ["balance_before", tx.balanceBefore.toString()],
      ["balance_after", tx.balanceAfter.toString()],
      ["timestamp", Date.now().toString()],
      ["description", tx.description]
    ],
    content: "",
    pubkey: userPubkey
  }
  
  const signedEvent = await signEventWithRemote(event, authData)
  
  // pool is already available at module level
  await pool.publish(RELAYS, signedEvent)
  
  console.log('[Nostr] ✅ Transaction recorded:', txId)
}

/**
 * Get all transactions for a user (for debugging/history)
 */
export async function getTransactionHistory(userPubkey: string, limit: number = 50): Promise<Transaction[]> {
  console.log('[Nostr] Fetching transaction history for:', userPubkey.substring(0, 8))
  
  // pool is already available at module level
  
  // Query for transaction events
  const events = await pool.querySync(RELAYS, {
    kinds: [30078],
    authors: [userPubkey],
    "#d": ["tx-"],  // All transaction events
    limit
  })
  
  // Filter and sort transactions
  const transactions: Transaction[] = events
    .filter(event => {
      const dTag = event.tags.find(t => t[0] === 'd')?.[1]
      return dTag && dTag.startsWith('tx-')
    })
    .sort((a, b) => b.created_at - a.created_at)  // Most recent first
    .map(event => {
      const getTags = (name: string) => event.tags.find(t => t[0] === name)?.[1]
      
      return {
        type: getTags('tx_type') as Transaction['type'],
        amount: parseInt(getTags('amount') || '0'),
        paymentHash: getTags('payment_hash'),
        balanceBefore: parseInt(getTags('balance_before') || '0'),
        balanceAfter: parseInt(getTags('balance_after') || '0'),
        description: getTags('description') || '',
        timestamp: parseInt(getTags('timestamp') || '0')
      }
    })
  
  console.log('[Nostr] ✅ Found', transactions.length, 'transactions')
  
  return transactions
}

/**
 * Get progress history for a user (last 30 days)
 */
export async function getProgressHistory(userPubkey: string, days: number = 30): Promise<DailyProgress[]> {
  console.log('[Nostr] Fetching progress history for:', userPubkey.substring(0, 8))
  
  // pool is already available at module level
  
  // Generate date range
  const dates: string[] = []
  for (let i = 0; i < days; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    dates.push(date.toISOString().split('T')[0])
  }
  
  // Query for progress events
  const events = await pool.querySync(RELAYS, {
    kinds: [30078],
    authors: [userPubkey],
    "#d": dates.map(date => `progress-${date}`),
    limit: days
  })
  
  // Parse and sort progress events
  const progress: DailyProgress[] = events
    .map(event => {
      const getTags = (name: string) => event.tags.find(t => t[0] === name)?.[1]
      
      return {
        date: getTags('date') || '',
        wordCount: parseInt(getTags('word_count') || '0'),
        goalMet: getTags('goal_met') === 'true',
        rewardSent: getTags('reward_sent') === 'true',
        rewardAmount: parseInt(getTags('reward_amount') || '0'),
        rewardTimestamp: parseInt(getTags('reward_timestamp') || '0')
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))  // Most recent first
  
  console.log('[Nostr] ✅ Found', progress.length, 'progress records')
  
  return progress
}
