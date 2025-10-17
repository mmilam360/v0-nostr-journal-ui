export async function onRequestGet(context: any) {
  try {
    const hasNWC = !!context.env.NWC_CONNECTION_URL
    const preview = context.env.NWC_CONNECTION_URL?.substring(0, 40) + '...'
    
    return new Response(JSON.stringify({
      success: true,
      has_nwc: hasNWC,
      preview: preview,
      environment: 'Cloudflare Pages Functions',
      timestamp: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
    
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      has_nwc: false
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}
