import { SimplePool } from "nostr-tools"
import { signEventWithRemote } from "./signer-manager"

const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://purplepag.es'
]

// Create a simple pool for this module
const pool = new SimplePool()

export interface IncentiveSettings {
  dailyWordGoal: number
  dailyRewardSats: number
  stakeBalanceSats: number
  lightningAddress: string
  createdDate: string
  lastUpdated: string
}

/**
 * Create or update user's incentive settings
 */
export async function saveIncentiveSettings(
  userPubkey: string,
  settings: IncentiveSettings,
  authData: any
): Promise<void> {
  const event = {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", "journal-incentive-settings"],
      ["app", "nostr-journal"],
      ["daily_word_goal", settings.dailyWordGoal.toString()],
      ["daily_reward_sats", settings.dailyRewardSats.toString()],
      ["stake_balance_sats", settings.stakeBalanceSats.toString()],
      ["lightning_address", settings.lightningAddress],
      ["created_date", settings.createdDate],
      ["last_updated", settings.lastUpdated]
    ],
    content: "",
    pubkey: userPubkey
  }
  
  const signedEvent = await signEventWithRemote(event, authData)
  await pool.publish(RELAYS, signedEvent)
}

/**
 * Fetch user's current incentive settings
 */
export async function fetchIncentiveSettings(
  userPubkey: string
): Promise<any | null> {
  const events = await pool.querySync(RELAYS, {
    kinds: [30078],
    authors: [userPubkey],
    "#d": ["journal-incentive-settings"],
    limit: 1
  })
  
  return events[0] || null
}

/**
 * Update just the stake balance
 */
export async function updateStakeBalance(
  userPubkey: string,
  newBalance: number,
  authData: any
): Promise<void> {
  const currentSettings = await fetchIncentiveSettings(userPubkey)
  
  if (!currentSettings) {
    throw new Error('No incentive settings found')
  }
  
  const event = {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: currentSettings.tags.map((tag: string[]) => {
      if (tag[0] === 'stake_balance_sats') {
        return ['stake_balance_sats', newBalance.toString()]
      }
      if (tag[0] === 'last_updated') {
        return ['last_updated', new Date().toISOString().split('T')[0]]
      }
      return tag
    }),
    content: "",
    pubkey: userPubkey
  }
  
  const signedEvent = await signEventWithRemote(event, authData)
  await pool.publish(RELAYS, signedEvent)
}

/**
 * Record daily progress
 */
export async function recordDailyProgress(
  userPubkey: string,
  date: string,
  wordCount: number,
  goalMet: boolean,
  authData: any
): Promise<void> {
  const event = {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", `journal-progress-${date}`],
      ["app", "nostr-journal"],
      ["date", date],
      ["word_count", wordCount.toString()],
      ["goal_met", goalMet.toString()],
      ["reward_claimed", "false"]
    ],
    content: "",
    pubkey: userPubkey
  }
  
  const signedEvent = await signEventWithRemote(event, authData)
  await pool.publish(RELAYS, signedEvent)
}

/**
 * Fetch today's progress
 */
export async function fetchTodayProgress(
  userPubkey: string,
  date: string
): Promise<any | null> {
  const events = await pool.querySync(RELAYS, {
    kinds: [30078],
    authors: [userPubkey],
    "#d": [`journal-progress-${date}`],
    limit: 1
  })
  
  return events[0] || null
}

/**
 * Mark reward as claimed
 */
export async function markRewardClaimed(
  userPubkey: string,
  date: string,
  paymentHash: string,
  amountSats: number,
  authData: any
): Promise<void> {
  const event = {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", `journal-progress-${date}`],
      ["app", "nostr-journal"],
      ["date", date],
      ["reward_claimed", "true"],
      ["reward_payment_hash", paymentHash],
      ["reward_amount_sats", amountSats.toString()]
    ],
    content: "",
    pubkey: userPubkey
  }
  
  const signedEvent = await signEventWithRemote(event, authData)
  await pool.publish(RELAYS, signedEvent)
}

/**
 * Record transaction
 */
export async function recordTransaction(
  userPubkey: string,
  txType: 'deposit' | 'reward_payout' | 'refund',
  amountSats: number,
  paymentHash: string,
  authData: any,
  invoice?: string
): Promise<void> {
  const tags = [
    ["d", `journal-tx-${Date.now()}`],
    ["app", "nostr-journal"],
    ["tx_type", txType],
    ["amount_sats", amountSats.toString()],
    ["payment_hash", paymentHash],
    ["date", new Date().toISOString().split('T')[0]]
  ]
  
  if (invoice) {
    tags.push(["invoice", invoice])
  }
  
  const event = {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
    pubkey: userPubkey
  }
  
  const signedEvent = await signEventWithRemote(event, authData)
  await pool.publish(RELAYS, signedEvent)
}

/**
 * Fetch transaction history
 */
export async function fetchTransactionHistory(
  userPubkey: string,
  limit: number = 50
): Promise<any[]> {
  const events = await pool.querySync(RELAYS, {
    kinds: [30078],
    authors: [userPubkey],
    "#app": ["nostr-journal"],
    limit: limit * 2
  })
  
  return events.filter(e => 
    e.tags.some(t => t[0] === 'd' && t[1].startsWith('journal-tx-'))
  )
}

/**
 * Calculate current streak
 */
export async function calculateStreak(userPubkey: string): Promise<number> {
  const events = await pool.querySync(RELAYS, {
    kinds: [30078],
    authors: [userPubkey],
    "#app": ["nostr-journal"],
    limit: 365
  })
  
  const progressEvents = events.filter(e =>
    e.tags.some(t => t[0] === 'd' && t[1].startsWith('journal-progress-'))
  )
  
  let streak = 0
  const today = new Date()
  
  for (let i = 0; i < 365; i++) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    
    const dayProgress = progressEvents.find(e =>
      e.tags.some(t => t[0] === 'date' && t[1] === dateStr)
    )
    
    if (!dayProgress) break
    
    const goalMet = dayProgress.tags.some(t => 
      t[0] === 'goal_met' && t[1] === 'true'
    )
    
    if (goalMet) {
      streak++
    } else {
      break
    }
  }
  
  return streak
}
