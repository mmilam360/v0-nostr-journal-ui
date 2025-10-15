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
  // First, get all incentive settings events
  const settingsEvents = await pool.querySync(RELAYS, {
    kinds: [30078],
    authors: [userPubkey],
    "#d": ["journal-incentive-settings"]
  })
  
  if (settingsEvents.length === 0) {
    return null
  }
  
  // Get all deletion events (kind 5) for this user
  const deletionEvents = await pool.querySync(RELAYS, {
    kinds: [5],
    authors: [userPubkey]
  })
  
  // Check if the latest settings event has been deleted
  const latestSettings = settingsEvents[0] // Most recent settings event
  
  // Look for deletion events that reference this settings event
  const isDeleted = deletionEvents.some(deletionEvent => {
    return deletionEvent.tags.some(tag => 
      tag[0] === 'e' && tag[1] === latestSettings.id
    )
  })
  
  if (isDeleted) {
    console.log('[IncentiveNostr] Settings event has been deleted, returning null')
    return null
  }
  
  console.log('[IncentiveNostr] Found valid settings event:', latestSettings.id)
  return latestSettings
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
  // First, get all progress events for this date
  const progressEvents = await pool.querySync(RELAYS, {
    kinds: [30078],
    authors: [userPubkey],
    "#d": [`journal-progress-${date}`]
  })
  
  if (progressEvents.length === 0) {
    return null
  }
  
  // Get all deletion events (kind 5) for this user
  const deletionEvents = await pool.querySync(RELAYS, {
    kinds: [5],
    authors: [userPubkey]
  })
  
  // Check if the latest progress event has been deleted
  const latestProgress = progressEvents[0] // Most recent progress event
  
  // Look for deletion events that reference this progress event
  const isDeleted = deletionEvents.some(deletionEvent => {
    return deletionEvent.tags.some(tag => 
      tag[0] === 'e' && tag[1] === latestProgress.id
    )
  })
  
  if (isDeleted) {
    console.log('[IncentiveNostr] Progress event has been deleted, returning null')
    return null
  }
  
  console.log('[IncentiveNostr] Found valid progress event:', latestProgress.id)
  return latestProgress
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
  txType: 'deposit' | 'reward_payout' | 'forfeit',
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

/**
 * Reset/Cancel user's incentive settings (delete the settings event)
 */
export async function resetIncentiveSettings(
  userPubkey: string,
  authData: any
): Promise<void> {
  console.log('[IncentiveNostr] Resetting incentive settings for user:', userPubkey)
  
  try {
    // Find the existing settings event to delete
    const settingsEvent = await pool.querySync(RELAYS, {
      kinds: [30078],
      authors: [userPubkey],
      "#d": ["journal-incentive-settings"]
    })
    
    if (settingsEvent.length > 0) {
      console.log('[IncentiveNostr] Found existing settings event, deleting...')
      
      // Create a deletion event (kind 5)
      const deleteEvent = {
        kind: 5,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["e", settingsEvent[0].id],
          ["p", userPubkey]
        ],
        content: "Deleted incentive settings",
        pubkey: userPubkey
      }
      
      const signedDeleteEvent = await signEventWithRemote(deleteEvent, authData)
      await pool.publish(RELAYS, signedDeleteEvent)
      
      console.log('[IncentiveNostr] ✅ Incentive settings reset successfully')
    } else {
      console.log('[IncentiveNostr] No existing settings found to reset')
    }
    
    // Also clear all progress events for this user
    await clearAllProgressEvents(userPubkey, authData)
    
  } catch (error) {
    console.error('[IncentiveNostr] ❌ Error resetting incentive settings:', error)
    throw error
  }
}

/**
 * Clear all progress events for a user when they cancel their stake
 */
export async function clearAllProgressEvents(
  userPubkey: string,
  authData: any
): Promise<void> {
  console.log('[IncentiveNostr] Clearing all progress events for user:', userPubkey)
  
  try {
    // Get all progress events for this user
    const progressEvents = await pool.querySync(RELAYS, {
      kinds: [30078],
      authors: [userPubkey],
      "#d": ["journal-progress-"] // This will match any progress events
    })
    
    console.log('[IncentiveNostr] Found', progressEvents.length, 'progress events to delete')
    
    // Create deletion events for each progress event
    for (const progressEvent of progressEvents) {
      const deleteEvent = {
        kind: 5,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["e", progressEvent.id],
          ["p", userPubkey]
        ],
        content: "Deleted progress event due to stake cancellation",
        pubkey: userPubkey
      }
      
      const signedDeleteEvent = await signEventWithRemote(deleteEvent, authData)
      await pool.publish(RELAYS, signedDeleteEvent)
      
      console.log('[IncentiveNostr] Deleted progress event:', progressEvent.id)
    }
    
    console.log('[IncentiveNostr] ✅ All progress events cleared successfully')
    
  } catch (error) {
    console.error('[IncentiveNostr] ❌ Error clearing progress events:', error)
    throw error
  }
}
