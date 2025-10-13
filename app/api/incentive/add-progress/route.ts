import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { pubkey, wordCount, noteContent } = await request.json()
    
    if (!pubkey || !wordCount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }
    
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
