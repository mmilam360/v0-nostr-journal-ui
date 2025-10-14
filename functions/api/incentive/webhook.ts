export async function onRequestPost(context: any) {
  const { request, env } = context
  
  try {
    console.log('[Webhook] Received payment webhook')
    
    const webhookData = await request.json()
    console.log('[Webhook] Webhook data:', JSON.stringify(webhookData, null, 2))
    
    // Check if this is an invoice settled event
    if (webhookData.type === 'invoice.settled' || webhookData.event_type === 'invoice.settled') {
      const { payment_hash, amount, payer_pubkey } = webhookData
      
      console.log('[Webhook] ✅ Invoice settled!')
      console.log('[Webhook] Payment hash:', payment_hash)
      console.log('[Webhook] Amount:', amount)
      console.log('[Webhook] Payer pubkey:', payer_pubkey)
      
      // TODO: Update user's stake balance in Nostr
      // This would involve:
      // 1. Finding the user's incentive settings event
      // 2. Updating their stake balance
      // 3. Publishing the updated event
      
      console.log('[Webhook] Payment confirmed - user balance should be credited')
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Webhook processed successfully' 
      }), {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    } else {
      console.log('[Webhook] Non-settlement event:', webhookData.type || webhookData.event_type)
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Webhook received but not a settlement event' 
      }), {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }
    
  } catch (error) {
    console.error('[Webhook] ❌ Error processing webhook:', error)
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Webhook processing failed',
      details: error.message 
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}

export const onRequest = onRequestPost
