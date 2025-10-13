import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const pubkey = url.searchParams.get('pubkey')
    
    if (!pubkey) {
      return NextResponse.json(
        { error: 'Missing pubkey parameter' },
        { status: 400 }
      )
    }
    
    // Get user account from global store (would be database in production)
    const userAccounts = global.userAccounts || {}
    const userAccount = userAccounts[pubkey]
    
    if (!userAccount) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      settings: userAccount.settings,
      balance: userAccount.balance,
      streak: userAccount.streak
    })
    
  } catch (error) {
    console.error('[Get Settings] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get settings' },
      { status: 500 }
    )
  }
}
