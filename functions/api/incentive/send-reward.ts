import { NostrWebLNProvider } from '@getalby/sdk'
import { fetchIncentiveSettings, fetchTodayProgress } from '../../_shared/nostr-helpers'

export async function onRequestPost(context: any) {
  console.log('[Reward] Function called')
  
  try {
    const body = await context.request.json()
    const { userPubkey } = body
    
    console.log('[Reward] Request for user:', userPubkey)
    
    if (!userPubkey) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Missing userPubkey' 
        }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      )
    }
    
    // Get settings from Nostr
    console.log('[Reward] Fetching settings from Nostr...')
    const settings = await fetchIncentiveSettings(userPubkey)
    
    if (!settings) {
      console.error('[Reward] No settings found')
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'No incentive settings found for this user' 
        }),
        { 
          status: 404, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      )
    }
    
    console.log('[Reward] Settings found, parsing...')
    
    // Parse settings
    const rewardAmount = parseInt(
      settings.tags.find((t: string[]) => t[0] === 'daily_reward_sats')?.[1] || '0'
    )
    const stakeBalance = parseInt(
      settings.tags.find((t: string[]) => t[0] === 'stake_balance_sats')?.[1] || '0'
    )
    const lightningAddress = settings.tags.find(
      (t: string[]) => t[0] === 'lightning_address'
    )?.[1]
    
    console.log('[Reward] Parsed:', { rewardAmount, stakeBalance, lightningAddress })
    
    if (!lightningAddress) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'No Lightning address configured' 
        }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      )
    }
    
    // Verify sufficient balance
    if (stakeBalance < rewardAmount) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Insufficient stake balance. Have: ${stakeBalance} sats, Need: ${rewardAmount} sats` 
        }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      )
    }
    
    // Verify goal was met today
    const today = new Date().toISOString().split('T')[0]
    console.log('[Reward] Checking today\'s progress:', today)
    
    const todayProgress = await fetchTodayProgress(userPubkey, today)
    
    if (!todayProgress) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'No progress recorded for today' 
        }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      )
    }
    
    const goalMet = todayProgress.tags.some(
      (t: string[]) => t[0] === 'goal_met' && t[1] === 'true'
    )
    
    if (!goalMet) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Daily goal not met' 
        }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      )
    }
    
    const alreadyClaimed = todayProgress.tags.some(
      (t: string[]) => t[0] === 'reward_claimed' && t[1] === 'true'
    )
    
    if (alreadyClaimed) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Reward already claimed today' 
        }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      )
    }
    
    console.log('[Reward] All checks passed, connecting to Alby Hub...')
    
    // Connect to Alby Hub
    const albyUrl = context.env.APP_LIGHTNING_NODE_URL
    
    if (!albyUrl) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Server configuration error: Missing Lightning node connection' 
        }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      )
    }
    
    const nwc = new NostrWebLNProvider({
      nostrWalletConnectUrl: albyUrl
    })
    
    await nwc.enable()
    
    console.log('[Reward] Getting invoice from Lightning address...')
    
    // Get invoice from Lightning address
    const [username, domain] = lightningAddress.split('@')
    const lnurlResponse = await fetch(
      `https://${domain}/.well-known/lnurlp/${username}`
    )
    
    if (!lnurlResponse.ok) {
      throw new Error(`Failed to fetch LNURL data: ${lnurlResponse.status}`)
    }
    
    const lnurlData = await lnurlResponse.json()
    
    const callbackResponse = await fetch(
      `${lnurlData.callback}?amount=${rewardAmount * 1000}`
    )
    
    if (!callbackResponse.ok) {
      throw new Error(`Failed to get invoice: ${callbackResponse.status}`)
    }
    
    const callbackData = await callbackResponse.json()
    const invoice = callbackData.pr
    
    if (!invoice) {
      throw new Error('No invoice returned from Lightning address')
    }
    
    console.log('[Reward] Sending payment...')
    
    // Send payment
    const result = await nwc.sendPayment(invoice)
    
    console.log('[Reward] ✅ Payment successful!', result.preimage)
    
    return new Response(
      JSON.stringify({
        success: true,
        paymentHash: result.paymentHash,
        preimage: result.preimage,
        amountSats: rewardAmount
      }),
      { 
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    )
    
  } catch (error) {
    console.error('[Reward] ❌ Error:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send reward',
        details: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    )
  }
}

// Handle OPTIONS for CORS
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}
