import { onRequestGet } from 'wrangler'

export const onRequestGet: onRequestGet = async (context) => {
  const results = {
    albyApi: { available: false, working: false, error: null },
    nwc: { available: false, working: false, error: null }
  }
  
  // Test Alby API
  if (context.env.ALBY_ACCESS_TOKEN) {
    results.albyApi.available = true
    
    try {
      const response = await fetch('https://api.getalby.com/user/me', {
        headers: {
          'Authorization': `Bearer ${context.env.ALBY_ACCESS_TOKEN}`
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        results.albyApi.working = true
        results.albyApi.info = {
          email: data.email,
          lightning_address: data.lightning_address
        }
      } else {
        results.albyApi.error = `API returned ${response.status}`
      }
    } catch (error) {
      results.albyApi.error = error.message
    }
  }
  
  // Test NWC
  if (context.env.NWC_CONNECTION_URL) {
    results.nwc.available = true
    
    try {
      const { webln } = await import('@getalby/sdk')
      const nwc = new webln.NostrWebLNProvider({
        nostrWalletConnectUrl: context.env.NWC_CONNECTION_URL
      })
      
      await nwc.enable()
      const info = await nwc.getInfo()
      
      results.nwc.working = true
      results.nwc.info = info
    } catch (error) {
      results.nwc.error = error.message
    }
  }
  
  return new Response(JSON.stringify(results, null, 2), {
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}
