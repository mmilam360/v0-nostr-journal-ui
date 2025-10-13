import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { pubkey, wordCount, noteContent } = await request.json()
    
    if (!pubkey || !wordCount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
    // SECURITY: Validate word count is reasonable (prevent gaming)
    if (wordCount <= 0 || wordCount > 10000) {
      return NextResponse.json(
        { error: 'Invalid word count. Must be between 1 and 10,000 words.' },
        { status: 400 }
      )
    }
    
    // SECURITY: Rate limiting - prevent rapid submissions
    const now = Date.now()
    global.userRateLimit = global.userRateLimit || {}
    const userRateLimit = global.userRateLimit[pubkey]
    
    if (userRateLimit && (now - userRateLimit.lastSubmission) < 5000) { // 5 second cooldown
      return NextResponse.json(
        { error: 'Please wait 5 seconds between submissions' },
        { status: 429 }
      )
    }
    
    global.userRateLimit[pubkey] = { lastSubmission: now }
    
    // Get user account
    const userAccounts = global.userAccounts || {}
    const userAccount = userAccounts[pubkey]
    
    if (!userAccount) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }
    
    const today = new Date().toISOString().split('T')[0]
    
    // Get today's progress
    global.dailyProgress = global.dailyProgress || {}
    global.dailyProgress[`${pubkey}-${today}`] = global.dailyProgress[`${pubkey}-${today}`] || {
      wordCount: 0,
      goalMet: false,
      rewardSent: false
    }
    
    // Add word count
    const progress = global.dailyProgress[`${pubkey}-${today}`]
    progress.wordCount += wordCount
    
    // Check if goal is met
    const goalMet = progress.wordCount >= userAccount.settings.dailyWordGoal
    let newBalance = userAccount.balance
    let newStreak = userAccount.streak
    let rewardSent = false
    
    if (goalMet && !progress.goalMet) {
      // Goal just met - send reward
      progress.goalMet = true
      
      // Simulate sending Lightning payment (would use real Lightning in production)
      newBalance = Math.max(0, newBalance - userAccount.settings.dailyRewardSats)
      newStreak += 1
      
      // In production, this would actually send Lightning payment
      console.log(`[Reward] Sending ${userAccount.settings.dailyRewardSats} sats to ${userAccount.settings.lightningAddress}`)
      
      progress.rewardSent = true
      rewardSent = true
    }
    
    // Update user account
    userAccount.balance = newBalance
    userAccount.streak = newStreak
    userAccounts[pubkey] = userAccount
    
    return NextResponse.json({
      totalProgress: progress.wordCount,
      goalMet: goalMet,
      rewardSent: rewardSent,
      balance: newBalance,
      streak: newStreak
    })
    
  } catch (error) {
    console.error('[Add Progress] Error:', error)
    return NextResponse.json(
      { error: 'Failed to add progress' },
      { status: 500 }
    )
  }
}
