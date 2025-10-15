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

// Event structure for stake management using Nostr events
// All stake data is stored on Nostr, not locally

export interface StakeCreationEvent {
  kind: 30078
  d: "stake-creation"
  tags: string[][]
}

export interface BalanceUpdateEvent {
  kind: 30078
  d: "balance-update"
  tags: string[][]
}

export interface StakeCancellationEvent {
  kind: 30078
  d: "stake-cancellation"
  tags: string[][]
}

export interface DailyProgressEvent {
  kind: 30078
  d: "daily-progress"
  tags: string[][]
}

// Legacy interface for backward compatibility
export interface IncentiveSettings {
  dailyWordGoal: number
  dailyRewardSats: number
  stakeBalanceSats: number
  lightningAddress: string
  createdDate: string
  lastUpdated: string
}

/**
 * Create a new stake with proper event tracking
 */
export async function createStake(
  userPubkey: string,
  stakeData: {
    dailyWordGoal: number
    dailyRewardSats: number
    initialStakeSats: number
    lightningAddress: string
    paymentHash: string
  },
  authData: any
): Promise<string> {
  const stakeId = `stake-${userPubkey}-${Date.now()}`
  
  const event = {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", "stake-creation"],
      ["stake_id", stakeId],
      ["daily_word_goal", stakeData.dailyWordGoal.toString()],
      ["daily_reward_sats", stakeData.dailyRewardSats.toString()],
      ["initial_stake_sats", stakeData.initialStakeSats.toString()],
      ["lightning_address", stakeData.lightningAddress],
      ["created_at", new Date().toISOString()],
      ["payment_hash", stakeData.paymentHash]
    ],
    content: "",
    pubkey: userPubkey
  }
  
  const signedEvent = await signEventWithRemote(event, authData)
  await pool.publish(RELAYS, signedEvent)
  
  console.log('[IncentiveNostr] ✅ Stake created with ID:', stakeId)
  return stakeId
}

/**
 * Update stake balance with proper event tracking
 */
export async function updateStakeBalance(
  userPubkey: string,
  stakeId: string,
  previousBalance: number,
  newBalance: number,
  reason: "reward_sent" | "missed_day" | "refund",
  date: string,
  paymentHash?: string,
  authData?: any
): Promise<void> {
  const amountChanged = newBalance - previousBalance
  
  const event = {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", "balance-update"],
      ["stake_id", stakeId],
      ["previous_balance", previousBalance.toString()],
      ["new_balance", newBalance.toString()],
      ["amount_changed", amountChanged.toString()],
      ["reason", reason],
      ["date", date],
      ...(paymentHash ? [["payment_hash", paymentHash]] : [])
    ],
    content: "",
    pubkey: userPubkey
  }
  
  if (authData) {
    const signedEvent = await signEventWithRemote(event, authData)
    await pool.publish(RELAYS, signedEvent)
  } else {
    // For server-side balance updates (like missed days)
    await pool.publish(RELAYS, event)
  }
  
  console.log(`[IncentiveNostr] ✅ Balance updated: ${previousBalance} → ${newBalance} (${reason})`)
}

/**
 * Record daily progress with proper event tracking
 */
export async function recordDailyProgress(
  userPubkey: string,
  stakeId: string,
  date: string,
  wordCount: number,
  goalMet: boolean,
  rewardClaimed: boolean,
  paymentHash?: string,
  authData?: any
): Promise<void> {
  const event = {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", "daily-progress"],
      ["stake_id", stakeId],
      ["date", date],
      ["word_count", wordCount.toString()],
      ["goal_met", goalMet ? "true" : "false"],
      ["reward_claimed", rewardClaimed ? "true" : "false"],
      ...(paymentHash ? [["payment_hash", paymentHash]] : [])
    ],
    content: "",
    pubkey: userPubkey
  }
  
  if (authData) {
    const signedEvent = await signEventWithRemote(event, authData)
    await pool.publish(RELAYS, signedEvent)
  } else {
    // For server-side progress updates
    await pool.publish(RELAYS, event)
  }
  
  console.log(`[IncentiveNostr] ✅ Daily progress recorded: ${wordCount} words, goal met: ${goalMet}`)
}

/**
 * Cancel stake with proper event tracking and refund
 */
export async function cancelStake(
  userPubkey: string,
  stakeId: string,
  refundAmount: number,
  refundPaymentHash: string,
  reason: "user_cancelled" | "stake_exhausted",
  authData: any
): Promise<void> {
  const event = {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", "stake-cancellation"],
      ["stake_id", stakeId],
      ["refund_amount", refundAmount.toString()],
      ["refund_payment_hash", refundPaymentHash],
      ["cancelled_at", new Date().toISOString()],
      ["reason", reason]
    ],
    content: "",
    pubkey: userPubkey
  }
  
  const signedEvent = await signEventWithRemote(event, authData)
  await pool.publish(RELAYS, signedEvent)
  
  console.log(`[IncentiveNostr] ✅ Stake cancelled: ${stakeId}, refund: ${refundAmount} sats`)
}

/**
 * Get current stake data by reconstructing from events
 */
export async function getCurrentStake(userPubkey: string): Promise<{
  stakeId: string
  dailyWordGoal: number
  dailyRewardSats: number
  currentBalance: number
  lightningAddress: string
  createdAt: string
  isActive: boolean
} | null> {
  // Get all stake creation events
  const creationEvents = await pool.querySync(RELAYS, {
    kinds: [30078],
    authors: [userPubkey],
    "#d": ["stake-creation"]
  })
  
  if (creationEvents.length === 0) {
    // Fallback: Check for old settings events for migration
    console.log('[IncentiveNostr] No new stake events found, checking old settings...')
    const oldSettings = await fetchIncentiveSettings(userPubkey)
    
    if (oldSettings) {
      // Parse old settings and return as new format
      const dailyWordGoal = parseInt(oldSettings.tags.find(t => t[0] === 'daily_word_goal')?.[1] || '0')
      const dailyRewardSats = parseInt(oldSettings.tags.find(t => t[0] === 'daily_reward_sats')?.[1] || '0')
      const currentBalance = parseInt(oldSettings.tags.find(t => t[0] === 'stake_balance_sats')?.[1] || '0')
      const lightningAddress = oldSettings.tags.find(t => t[0] === 'lightning_address')?.[1] || ''
      const createdAt = oldSettings.tags.find(t => t[0] === 'created_date')?.[1] || new Date().toISOString().split('T')[0]
      
      console.log('[IncentiveNostr] Found old settings, returning as new format:', {
        dailyWordGoal, dailyRewardSats, currentBalance, lightningAddress
      })
      
      return {
        stakeId: `migrated-${oldSettings.id}`,
        dailyWordGoal,
        dailyRewardSats,
        currentBalance,
        lightningAddress,
        createdAt,
        isActive: currentBalance > 0
      }
    }
    
    return null
  }
  
  // Get all cancellation events
  const cancellationEvents = await pool.querySync(RELAYS, {
    kinds: [30078],
    authors: [userPubkey],
    "#d": ["stake-cancellation"]
  })
  
  // Find the most recent active stake
  const activeStakes = creationEvents.filter(creation => {
    const stakeId = creation.tags.find(t => t[0] === 'stake_id')?.[1]
    return !cancellationEvents.some(cancel => 
      cancel.tags.find(t => t[0] === 'stake_id')?.[1] === stakeId
    )
  })
  
  if (activeStakes.length === 0) {
    return null
  }
  
  const latestStake = activeStakes[0]
  const stakeId = latestStake.tags.find(t => t[0] === 'stake_id')?.[1] || ''
  
  // Calculate current balance from balance update events
  const balanceEvents = await pool.querySync(RELAYS, {
    kinds: [30078],
    authors: [userPubkey],
    "#d": ["balance-update"],
    "#stake_id": [stakeId]
  })
  
  const initialBalance = parseInt(latestStake.tags.find(t => t[0] === 'initial_stake_sats')?.[1] || '0')
  const latestBalanceEvent = balanceEvents[0]
  const currentBalance = latestBalanceEvent 
    ? parseInt(latestBalanceEvent.tags.find(t => t[0] === 'new_balance')?.[1] || '0')
    : initialBalance
  
  return {
    stakeId,
    dailyWordGoal: parseInt(latestStake.tags.find(t => t[0] === 'daily_word_goal')?.[1] || '0'),
    dailyRewardSats: parseInt(latestStake.tags.find(t => t[0] === 'daily_reward_sats')?.[1] || '0'),
    currentBalance,
    lightningAddress: latestStake.tags.find(t => t[0] === 'lightning_address')?.[1] || '',
    createdAt: latestStake.tags.find(t => t[0] === 'created_at')?.[1] || '',
    isActive: true
  }
}

/**
 * Check for missed days and deduct from balance
 * This should be called daily by a server process
 */
export async function processMissedDays(userPubkey: string): Promise<{
  missedDays: number
  totalDeducted: number
  newBalance: number
  stakeCancelled: boolean
}> {
  const stake = await getCurrentStake(userPubkey)
  if (!stake) {
    return { missedDays: 0, totalDeducted: 0, newBalance: 0, stakeCancelled: false }
  }
  
  // Get all progress events for this stake
  const progressEvents = await pool.querySync(RELAYS, {
    kinds: [30078],
    authors: [userPubkey],
    "#d": ["daily-progress"],
    "#stake_id": [stake.stakeId]
  })
  
  // Calculate missed days since stake creation
  const stakeDate = new Date(stake.createdAt)
  const today = new Date()
  const daysSinceStake = Math.floor((today.getTime() - stakeDate.getTime()) / (1000 * 60 * 60 * 24))
  
  // Get dates where progress was recorded
  const recordedDates = progressEvents.map(event => {
    const dateTag = event.tags.find(t => t[0] === 'date')
    return dateTag ? dateTag[1] : null
  }).filter(Boolean)
  
  // Calculate missed days (days without progress)
  let missedDays = 0
  for (let i = 1; i <= daysSinceStake; i++) {
    const checkDate = new Date(stakeDate)
    checkDate.setDate(checkDate.getDate() + i)
    const dateString = checkDate.toISOString().split('T')[0]
    
    if (!recordedDates.includes(dateString)) {
      missedDays++
    }
  }
  
  // Deduct missed day amounts from balance
  const totalDeducted = missedDays * stake.dailyRewardSats
  const newBalance = Math.max(0, stake.currentBalance - totalDeducted)
  
  // Update balance if there were missed days
  if (missedDays > 0) {
    await updateStakeBalance(
      userPubkey,
      stake.stakeId,
      stake.currentBalance,
      newBalance,
      "missed_day",
      today.toISOString().split('T')[0]
    )
    
    // If balance is exhausted, cancel the stake
    if (newBalance <= 0) {
      // Note: In a real implementation, you'd send a refund here
      // For now, we just cancel the stake
      await cancelStake(
        userPubkey,
        stake.stakeId,
        0, // No refund since balance was exhausted
        "", // No payment hash since no refund
        "stake_exhausted",
        {} as any // This would need proper auth data in real implementation
      )
    }
  }
  
  return {
    missedDays,
    totalDeducted,
    newBalance,
    stakeCancelled: newBalance <= 0
  }
}

/**
 * Legacy function - Create or update user's incentive settings
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
