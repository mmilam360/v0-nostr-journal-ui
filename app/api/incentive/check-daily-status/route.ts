import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { pubkey } = await request.json()
    
    if (!pubkey) {
      return NextResponse.json(
        { error: 'Missing pubkey parameter' },
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
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    
    // Check yesterday's progress
    global.dailyProgress = global.dailyProgress || {}
    const yesterdayProgress = global.dailyProgress[`${pubkey}-${yesterday}`]
    
    let newBalance = userAccount.balance
    let newStreak = userAccount.streak
    
    // If user missed yesterday's goal, apply penalty
    if (yesterdayProgress && !yesterdayProgress.goalMet) {
      // Deduct penalty from balance (reward amount as penalty)
      newBalance = Math.max(0, newBalance - userAccount.settings.dailyRewardSats)
      newStreak = 0 // Reset streak
      
      console.log(`[Penalty] User ${pubkey} missed goal yesterday. Deducted ${userAccount.settings.dailyRewardSats} sats. New balance: ${newBalance}`)
    } else if (yesterdayProgress && yesterdayProgress.goalMet) {
      // Goal was met, maintain streak
      newStreak = Math.max(newStreak, 1)
    }
    
    // Update user account
    userAccount.balance = newBalance
    userAccount.streak = newStreak
    userAccounts[pubkey] = userAccount
    
    return NextResponse.json({
      balance: newBalance,
      streak: newStreak,
      penaltyApplied: yesterdayProgress && !yesterdayProgress.goalMet
    })
    
  } catch (error) {
    console.error('[Check Daily Status] Error:', error)
    return NextResponse.json(
      { error: 'Failed to check daily status' },
      { status: 500 }
    )
  }
}
