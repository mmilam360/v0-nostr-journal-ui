import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const pubkey = url.searchParams.get('pubkey')
    const date = url.searchParams.get('date')
    
    if (!pubkey) {
      return NextResponse.json(
        { error: 'Missing pubkey parameter' },
        { status: 400 }
      )
    }
    
    const targetDate = date || new Date().toISOString().split('T')[0]
    
    // Get today's progress
    global.dailyProgress = global.dailyProgress || {}
    const progress = global.dailyProgress[`${pubkey}-${targetDate}`] || {
      wordCount: 0,
      goalMet: false,
      rewardSent: false
    }
    
    return NextResponse.json({
      wordCount: progress.wordCount,
      goalMet: progress.goalMet,
      rewardSent: progress.rewardSent
    })
    
  } catch (error) {
    console.error('[Get Progress] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get progress' },
      { status: 500 }
    )
  }
}
