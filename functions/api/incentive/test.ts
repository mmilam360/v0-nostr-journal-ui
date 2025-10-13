export async function onRequestGet(context: any) {
  return new Response(
    JSON.stringify({
      success: true,
      message: 'Cloudflare Functions working!',
      hasAlbyUrl: !!context.env.APP_LIGHTNING_NODE_URL,
      environment: context.env.ENVIRONMENT || 'production',
      timestamp: Date.now()
    }),
    { 
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    }
  )
}

export async function onRequestPost(context: any) {
  try {
    const body = await context.request.json()
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'POST test working!',
        receivedData: body,
        timestamp: Date.now()
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
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
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
