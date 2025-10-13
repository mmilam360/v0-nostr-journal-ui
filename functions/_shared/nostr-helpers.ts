interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

const RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band'
]

export async function fetchIncentiveSettings(userPubkey: string): Promise<NostrEvent | null> {
  try {
    // Simple WebSocket query to Nostr relays
    for (const relay of RELAYS) {
      try {
        const ws = new WebSocket(relay)
        
        const eventPromise = new Promise<NostrEvent | null>((resolve) => {
          const timeout = setTimeout(() => {
            ws.close()
            resolve(null)
          }, 5000)
          
          ws.onopen = () => {
            const subscriptionId = Math.random().toString(36).substring(7)
            ws.send(JSON.stringify([
              'REQ',
              subscriptionId,
              {
                kinds: [30078],
                authors: [userPubkey],
                '#d': ['journal-incentive-settings'],
                limit: 1
              }
            ]))
          }
          
          ws.onmessage = (event) => {
            const data = JSON.parse(event.data)
            if (data[0] === 'EVENT') {
              clearTimeout(timeout)
              ws.close()
              resolve(data[2])
            }
          }
        })
        
        const result = await eventPromise
        if (result) return result
        
      } catch (relayError) {
        console.error('Relay error:', relay, relayError)
        continue
      }
    }
    
    return null
  } catch (error) {
    console.error('Error fetching settings:', error)
    return null
  }
}

export async function fetchTodayProgress(userPubkey: string, date: string): Promise<NostrEvent | null> {
  try {
    for (const relay of RELAYS) {
      try {
        const ws = new WebSocket(relay)
        
        const eventPromise = new Promise<NostrEvent | null>((resolve) => {
          const timeout = setTimeout(() => {
            ws.close()
            resolve(null)
          }, 5000)
          
          ws.onopen = () => {
            const subscriptionId = Math.random().toString(36).substring(7)
            ws.send(JSON.stringify([
              'REQ',
              subscriptionId,
              {
                kinds: [30078],
                authors: [userPubkey],
                '#d': [`journal-progress-${date}`],
                limit: 1
              }
            ]))
          }
          
          ws.onmessage = (event) => {
            const data = JSON.parse(event.data)
            if (data[0] === 'EVENT') {
              clearTimeout(timeout)
              ws.close()
              resolve(data[2])
            }
          }
        })
        
        const result = await eventPromise
        if (result) return result
        
      } catch (relayError) {
        console.error('Relay error:', relay, relayError)
        continue
      }
    }
    
    return null
  } catch (error) {
    console.error('Error fetching progress:', error)
    return null
  }
}
