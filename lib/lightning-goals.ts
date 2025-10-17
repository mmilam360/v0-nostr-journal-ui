import { SimplePool } from 'nostr-tools'

// Create pool instance
const pool = new SimplePool()
const RELAYS = ['wss://relay.damus.io', 'wss://relay.snort.social', 'wss://nos.lol', 'wss://relay.nostr.band']

// Import signer
import { signEventWithRemote } from './signer-manager'

// Add debug mode
const DEBUG = true
const log = (msg: string, data?: any) => {
  if (DEBUG) {
    console.log(`[LightningGoals] ${msg}`, data || '')
  }
}

export interface LightningGoals {
  // Goal settings
  dailyWordGoal: number
  dailyReward: number
  
  // Balance
  currentBalance: number
  initialStake: number
  totalDeposited: number
  totalWithdrawn: number
  
  // Status
  status: 'active' | 'paused' | 'cancelled' | 'pending_payment'
  createdAt: number
  lastUpdated: number
  
  // NEW: Track when stake was created and what word count was at that time
  stakeCreatedAt: number           // Unix timestamp
  baselineWordCount: number        // Words at stake creation (don't count these)
  totalWordCountAtLastUpdate: number // Track total word count for incremental updates
  
  // Payment
  lightningAddress: string
  
  // Today's tracking
  todayDate: string
  todayWords: number
  todayGoalMet: boolean
  todayRewardSent: boolean
  todayRewardAmount: number
  
  // History (last 7 days)
  history: DayHistory[]
  
  // Stats
  currentStreak: number
  totalGoalsMet: number
  totalRewardsEarned: number
  lastRewardDate: string
  missedDays: number
  lastMissedDate: string
}

export interface DayHistory {
  date: string
  words: number
  goalMet: boolean
  rewardSent: boolean
  amount: number
}

/**
 * Get the master Lightning Goals event
 * This is FAST - only fetches ONE event
 */
export async function getLightningGoals(userPubkey: string): Promise<LightningGoals | null> {
  console.log('[LightningGoals] 🔍 Fetching master event for:', userPubkey.substring(0, 8))
  
  const events = await pool.querySync(RELAYS, {
    kinds: [30078],
    authors: [userPubkey],
    "#d": ["lightning-goals"],
    limit: 1
  })
  
  if (events.length === 0) {
    console.log('[LightningGoals] No goals found')
    return null
  }
  
  const event = events[0]
  const getTag = (name: string) => event.tags.find(t => t[0] === name)?.[1] || ''
  
  // Parse history
  const history: DayHistory[] = []
  for (let i = 1; i <= 7; i++) {
    const dayData = getTag(`day_${i}`)
    if (dayData) {
      const [date, words, goalMet, rewardSent, amount] = dayData.split('|')
      history.push({
        date,
        words: parseInt(words),
        goalMet: goalMet === 'true',
        rewardSent: rewardSent === 'true',
        amount: parseInt(amount)
      })
    }
  }
  
  const goals: LightningGoals = {
    dailyWordGoal: parseInt(getTag('daily_word_goal') || '500'),
    dailyReward: parseInt(getTag('daily_reward') || '100'),
    
    currentBalance: parseInt(getTag('current_balance') || '0'),
    initialStake: parseInt(getTag('initial_stake') || '0'),
    totalDeposited: parseInt(getTag('total_deposited') || '0'),
    totalWithdrawn: parseInt(getTag('total_withdrawn') || '0'),
    
    status: (getTag('status') || 'active') as any,
    createdAt: parseInt(getTag('created_at') || '0'),
    lastUpdated: parseInt(getTag('last_updated') || '0'),
    
    // NEW: Parse baseline fields
    stakeCreatedAt: parseInt(getTag('stake_created_at') || '0'),
    baselineWordCount: parseInt(getTag('baseline_word_count') || '0'),
    totalWordCountAtLastUpdate: parseInt(getTag('total_word_count_at_last_update') || '0'),
    
    lightningAddress: getTag('lightning_address'),
    
    todayDate: getTag('today_date'),
    todayWords: parseInt(getTag('today_words') || '0'),
    todayGoalMet: getTag('today_goal_met') === 'true',
    todayRewardSent: getTag('today_reward_sent') === 'true',
    todayRewardAmount: parseInt(getTag('today_reward_amount') || '0'),
    
    history,
    
    currentStreak: parseInt(getTag('current_streak') || '0'),
    totalGoalsMet: parseInt(getTag('total_goals_met') || '0'),
    totalRewardsEarned: parseInt(getTag('total_rewards_earned') || '0'),
    lastRewardDate: getTag('last_reward_date'),
    missedDays: parseInt(getTag('missed_days') || '0'),
    lastMissedDate: getTag('last_missed_date')
  }
  
  console.log('[LightningGoals] ✅ Loaded:', {
    balance: goals.currentBalance,
    goal: goals.dailyWordGoal,
    todayWords: goals.todayWords,
    status: goals.status
  })
  
  return goals
}

/**
 * Update the master event
 * This REPLACES the previous event on relays
 */
export async function updateLightningGoals(
  userPubkey: string,
  updates: Partial<LightningGoals>,
  authData: any
): Promise<void> {
  console.log('[LightningGoals] 📝 Updating master event')
  
  // Get current state
  const current = await getLightningGoals(userPubkey)
  
  // Merge with updates
  const updated: LightningGoals = {
    ...(current || {
      dailyWordGoal: 500,
      dailyReward: 100,
      currentBalance: 0,
      initialStake: 0,
      totalDeposited: 0,
      totalWithdrawn: 0,
      status: 'active',
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      lightningAddress: '',
      todayDate: new Date().toISOString().split('T')[0],
      todayWords: 0,
      todayGoalMet: false,
      todayRewardSent: false,
      todayRewardAmount: 0,
      history: [],
      currentStreak: 0,
      totalGoalsMet: 0,
      totalRewardsEarned: 0,
      lastRewardDate: '',
      missedDays: 0,
      lastMissedDate: ''
    }),
    ...updates,
    lastUpdated: Date.now()
  }
  
  // Check if date changed - if so, archive today and reset
  const today = new Date().toISOString().split('T')[0]
  if (current && current.todayDate !== today) {
    console.log('[LightningGoals] 📅 New day detected, archiving previous day')
    
    // Add yesterday to history
    updated.history = [
      {
        date: current.todayDate,
        words: current.todayWords,
        goalMet: current.todayGoalMet,
        rewardSent: current.todayRewardSent,
        amount: current.todayRewardAmount
      },
      ...current.history.slice(0, 6) // Keep only last 7 days
    ]
    
    // Reset today's tracking
    updated.todayDate = today
    updated.todayWords = 0
    updated.todayGoalMet = false
    updated.todayRewardSent = false
    updated.todayRewardAmount = 0
    
    // Update streak
    if (current.todayGoalMet) {
      updated.currentStreak = (current.currentStreak || 0) + 1
    } else {
      updated.currentStreak = 0
      updated.missedDays = (current.missedDays || 0) + 1
      updated.lastMissedDate = current.todayDate
    }
  }
  
  // Build tags
  const tags: string[][] = [
    ["d", "lightning-goals"],
    ["daily_word_goal", updated.dailyWordGoal.toString()],
    ["daily_reward", updated.dailyReward.toString()],
    ["current_balance", updated.currentBalance.toString()],
    ["initial_stake", updated.initialStake.toString()],
    ["total_deposited", updated.totalDeposited.toString()],
    ["total_withdrawn", updated.totalWithdrawn.toString()],
    ["status", updated.status],
    ["created_at", updated.createdAt.toString()],
    ["last_updated", updated.lastUpdated.toString()],
    
    // NEW: Baseline fields
    ["stake_created_at", updated.stakeCreatedAt.toString()],
    ["baseline_word_count", updated.baselineWordCount.toString()],
    ["total_word_count_at_last_update", updated.totalWordCountAtLastUpdate.toString()],
    ["lightning_address", updated.lightningAddress],
    ["today_date", updated.todayDate],
    ["today_words", updated.todayWords.toString()],
    ["today_goal_met", updated.todayGoalMet.toString()],
    ["today_reward_sent", updated.todayRewardSent.toString()],
    ["today_reward_amount", updated.todayRewardAmount.toString()],
    ["current_streak", updated.currentStreak.toString()],
    ["total_goals_met", updated.totalGoalsMet.toString()],
    ["total_rewards_earned", updated.totalRewardsEarned.toString()],
    ["last_reward_date", updated.lastRewardDate],
    ["missed_days", updated.missedDays.toString()],
    ["last_missed_date", updated.lastMissedDate]
  ]
  
  // Add history
  updated.history.forEach((day, i) => {
    tags.push([
      `day_${i + 1}`,
      `${day.date}|${day.words}|${day.goalMet}|${day.rewardSent}|${day.amount}`
    ])
  })
  
  // Create event
  const event = {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
    pubkey: userPubkey
  }
  
  console.log('[LightningGoals] Signing and publishing...')
  
  const signedEvent = await signEventWithRemote(event, authData)
  
  await pool.publish(RELAYS, signedEvent)
  
  console.log('[LightningGoals] ✅ Master event updated')
}

/**
 * Create initial stake (with 0 balance until payment confirmed)
 */
export async function createStake(
  userPubkey: string,
  config: {
    dailyWordGoal: number
    dailyReward: number
    depositAmount: number
    lightningAddress: string
    currentWordCount: number  // NEW: Pass current word count
    paymentHash?: string
  },
  authData: any
): Promise<void> {
  console.log('[LightningGoals] Creating new stake...')
  console.log('[LightningGoals] Current word count:', config.currentWordCount)
  console.log('[LightningGoals] This will be the baseline (words before stake)')
  
  const today = new Date().toISOString().split('T')[0]
  const now = Date.now()
  
  await updateLightningGoals(userPubkey, {
    dailyWordGoal: config.dailyWordGoal,
    dailyReward: config.dailyReward,
    currentBalance: config.paymentHash ? config.depositAmount : 0, // Only credit if payment confirmed
    initialStake: config.depositAmount,
    totalDeposited: config.paymentHash ? config.depositAmount : 0, // Only count if payment confirmed
    totalWithdrawn: 0,
    status: config.paymentHash ? 'active' : 'pending_payment', // Pending until payment confirmed
    createdAt: now,
    stakeCreatedAt: now,  // When stake was created
    baselineWordCount: config.currentWordCount,  // NEW: Baseline to subtract
    totalWordCountAtLastUpdate: config.currentWordCount,  // Track current word count for incremental updates
    lightningAddress: config.lightningAddress,
    todayDate: today,
    todayWords: 0,  // Start with 0 - we'll track incremental progress
    todayGoalMet: false,
    todayRewardSent: false,
    todayRewardAmount: 0,
    history: [],
    currentStreak: 0,
    totalGoalsMet: 0,
    totalRewardsEarned: 0,
    lastRewardDate: '',
    missedDays: 0,
    lastMissedDate: ''
  }, authData)
  
  console.log('[LightningGoals] ✅ Stake created with baseline:', config.currentWordCount, config.paymentHash ? 'with payment confirmed' : 'pending payment')
}

/**
 * Confirm payment and activate stake
 */
export async function confirmPayment(
  userPubkey: string,
  paymentHash: string,
  authData: any
): Promise<void> {
  console.log('[LightningGoals] Confirming payment:', paymentHash)
  
  const goals = await getLightningGoals(userPubkey)
  
  if (!goals) {
    throw new Error('No pending stake found')
  }
  
  if (goals.status !== 'pending_payment') {
    throw new Error('Stake is not in pending payment state')
  }
  
  // Update to active with confirmed balance
  await updateLightningGoals(userPubkey, {
    status: 'active',
    currentBalance: goals.initialStake,
    totalDeposited: goals.initialStake
  }, authData)
  
  console.log('[LightningGoals] ✅ Payment confirmed, stake activated')
}


/**
 * Record reward sent
 */
export async function recordRewardSent(
  userPubkey: string,
  amount: number,
  authData: any
): Promise<void> {
  console.log('[LightningGoals] Recording reward sent:', amount)
  
  const goals = await getLightningGoals(userPubkey)
  
  if (!goals) return
  
  const today = new Date().toISOString().split('T')[0]
  
  await updateLightningGoals(userPubkey, {
    currentBalance: goals.currentBalance - amount,
    totalWithdrawn: goals.totalWithdrawn + amount,
    todayRewardSent: true,
    todayRewardAmount: amount,
    todayGoalMet: true,
    totalGoalsMet: goals.totalGoalsMet + 1,
    totalRewardsEarned: goals.totalRewardsEarned + amount,
    lastRewardDate: today
  }, authData)
  
  console.log('[LightningGoals] ✅ Reward recorded')
}

/**
 * Add to stake (top up)
 */
export async function addToStake(
  userPubkey: string,
  amount: number,
  authData: any
): Promise<void> {
  console.log('[LightningGoals] Adding to stake:', amount)
  
  const goals = await getLightningGoals(userPubkey)
  
  if (!goals) throw new Error('No goals found')
  
  await updateLightningGoals(userPubkey, {
    currentBalance: goals.currentBalance + amount,
    totalDeposited: goals.totalDeposited + amount
  }, authData)
  
  console.log('[LightningGoals] ✅ Stake topped up')
}

/**
 * Cancel stake - NO REFUND (stake is forfeited)
 * This completely resets the system for the user
 */
export async function cancelStake(
  userPubkey: string,
  authData: any
): Promise<{ forfeited: number }> {
  console.log('[LightningGoals] ⚠️ Cancelling stake (NO REFUND)...')
  
  const goals = await getLightningGoals(userPubkey)
  
  if (!goals) throw new Error('No goals found')
  
  const forfeitedAmount = goals.currentBalance
  
  console.log('[LightningGoals] 💸 Forfeiting:', forfeitedAmount, 'sats')
  
  // Reset EVERYTHING - complete abandonment
  const today = new Date().toISOString().split('T')[0]
  
  await updateLightningGoals(userPubkey, {
    // Reset balance to 0 (forfeited)
    currentBalance: 0,
    initialStake: 0,
    // Don't update totalDeposited - keep for history
    // Don't update totalWithdrawn - no refund given
    
    // Mark as cancelled
    status: 'cancelled',
    
    // Reset all daily tracking
    todayDate: today,
    todayWords: 0,
    todayGoalMet: false,
    todayRewardSent: false,
    todayRewardAmount: 0,
    
    // Clear history
    history: [],
    
    // Reset stats
    currentStreak: 0,
    // Keep totalGoalsMet and totalRewardsEarned for lifetime stats
    lastRewardDate: '',
    missedDays: 0,
    lastMissedDate: ''
  }, authData)
  
  console.log('[LightningGoals] ✅ Stake cancelled and forfeited')
  console.log('[LightningGoals] 💰 User forfeited', forfeitedAmount, 'sats')
  
  return { forfeited: forfeitedAmount }
}

/**
 * Update Lightning address for existing stake
 */
export async function updateLightningAddress(
  userPubkey: string,
  lightningAddress: string,
  authData: any
): Promise<void> {
  console.log('[LightningGoals] Updating Lightning address:', lightningAddress)
  
  const goals = await getLightningGoals(userPubkey)
  
  if (!goals) throw new Error('No goals found')
  
  await updateLightningGoals(userPubkey, {
    lightningAddress: lightningAddress
  }, authData)
  
  console.log('[LightningGoals] ✅ Lightning address updated')
}

/**
 * Update word count and check if reward should be sent
 */
export async function updateWordCount(
  userPubkey: string,
  totalWordCount: number,  // Total words across all notes
  authData: any
): Promise<{ shouldSendReward: boolean; rewardAmount: number }> {
  console.log('[LightningGoals] 📝 Updating word count')
  console.log('[LightningGoals] Total word count:', totalWordCount)
  
  const goals = await getLightningGoals(userPubkey)
  
  console.log('[LightningGoals] 📊 Goals loaded for updateWordCount:', goals ? {
    status: goals.status,
    todayWords: goals.todayWords,
    dailyWordGoal: goals.dailyWordGoal,
    todayGoalMet: goals.todayGoalMet,
    todayRewardSent: goals.todayRewardSent,
    baselineWordCount: goals.baselineWordCount
  } : 'null')
  
  if (!goals) {
    console.log('[LightningGoals] ❌ No goals found for user:', userPubkey.substring(0, 8))
    return { shouldSendReward: false, rewardAmount: 0 }
  }
  
  if (goals.status !== 'active') {
    console.log('[LightningGoals] ❌ Goals not active, status:', goals.status)
    return { shouldSendReward: false, rewardAmount: 0 }
  }
  
  // ⚠️ CRITICAL: Subtract baseline to get words written SINCE stake creation
  const wordsWrittenSinceStake = totalWordCount - goals.baselineWordCount
  
  console.log('[LightningGoals] Baseline (words before stake):', goals.baselineWordCount)
  console.log('[LightningGoals] Words written since stake:', wordsWrittenSinceStake)
  console.log('[LightningGoals] Daily goal:', goals.dailyWordGoal)
  
  // Check if goal met based on words SINCE stake
  const goalMet = wordsWrittenSinceStake >= goals.dailyWordGoal
  
  console.log('[LightningGoals] Goal met:', goalMet)
  
  const today = new Date().toISOString().split('T')[0]
  
  // Update with total words (for tracking) but check goal using adjusted count
  await updateLightningGoals(userPubkey, {
    todayWords: totalWordCount,  // Store total
    todayGoalMet: goalMet
  }, authData)
  
  // Check if we already sent reward today (after updating word count)
  if (goals.todayRewardSent) {
    console.log('[LightningGoals] ✅ Reward already sent today')
    return { shouldSendReward: false, rewardAmount: 0 }
  }
  
  // Check if goal met (already calculated above)
  if (!goalMet) {
    console.log('[LightningGoals] 📊 Goal not met yet')
    return { shouldSendReward: false, rewardAmount: 0 }
  }
  
  // Check if we have sufficient balance
  if (goals.currentBalance < goals.dailyReward) {
    console.log('[LightningGoals] ❌ Insufficient balance:', goals.currentBalance, '<', goals.dailyReward)
    return { shouldSendReward: false, rewardAmount: 0 }
  }
  
  // Word count already updated above
  
  console.log('[LightningGoals] ✅ Goal met! Should send reward:', goals.dailyReward, 'sats')
  
  return { 
    shouldSendReward: true, 
    rewardAmount: goals.dailyReward 
  }
}
