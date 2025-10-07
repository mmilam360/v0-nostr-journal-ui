"use client"

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react'

interface RelayCheckerProps {
  eventId: string
}

interface RelayResult {
  url: string
  hasEvent: boolean
  loading: boolean
  error?: string
}

export default function RelayChecker({ eventId }: RelayCheckerProps) {
  const [relayResults, setRelayResults] = useState<RelayResult[]>([])
  const [isChecking, setIsChecking] = useState(false)

  const relays = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band',
    'wss://relay.snort.social',
    'wss://relay.primal.net',
    'wss://relay.nsec.app'
  ]

  const checkRelays = async () => {
    setIsChecking(true)
    setRelayResults(relays.map(url => ({ url, hasEvent: false, loading: true })))

    const results = await Promise.allSettled(
      relays.map(async (relayUrl) => {
        try {
          const hasEvent = await checkEventOnRelay(relayUrl, eventId)
          return { url: relayUrl, hasEvent, loading: false }
        } catch (error) {
          return { 
            url: relayUrl, 
            hasEvent: false, 
            loading: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          }
        }
      })
    )

    const finalResults = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value
      } else {
        return {
          url: relays[index],
          hasEvent: false,
          loading: false,
          error: result.reason?.message || 'Failed to check'
        }
      }
    })

    setRelayResults(finalResults)
    setIsChecking(false)
  }

  const checkEventOnRelay = async (relayUrl: string, eventId: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(relayUrl)
      let resolved = false

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          ws.close()
          reject(new Error('Timeout'))
        }
      }, 5000)

      ws.onopen = () => {
        ws.send(JSON.stringify(['REQ', 'check-event', { ids: [eventId] }]))
      }

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data)
          
          if (data[0] === 'EVENT' && data[2]?.id === eventId) {
            if (!resolved) {
              resolved = true
              clearTimeout(timeout)
              ws.close()
              resolve(true)
            }
          } else if (data[0] === 'EOSE') {
            if (!resolved) {
              resolved = true
              clearTimeout(timeout)
              ws.close()
              resolve(false)
            }
          }
        } catch (error) {
          // Ignore parsing errors
        }
      }

      ws.onerror = () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          ws.close()
          reject(new Error('Connection error'))
        }
      }

      ws.onclose = () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve(false)
        }
      }
    })
  }

  useEffect(() => {
    if (eventId) {
      checkRelays()
    }
  }, [eventId])

  const successfulRelays = relayResults.filter(r => r.hasEvent && !r.loading)
  const failedRelays = relayResults.filter(r => !r.hasEvent && !r.loading && !r.error)
  const errorRelays = relayResults.filter(r => r.error)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {isChecking ? 'Checking relays...' : `Found on ${successfulRelays.length} of ${relays.length} relays`}
        </div>
        <Button
          onClick={checkRelays}
          disabled={isChecking}
          variant="outline"
          size="sm"
        >
          {isChecking ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </div>

      <div className="space-y-2">
        {relayResults.map((result) => (
          <div key={result.url} className="flex items-center justify-between p-2 border rounded">
            <div className="flex items-center gap-2">
              {result.loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
              ) : result.hasEvent ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : result.error ? (
                <XCircle className="w-4 h-4 text-red-500" />
              ) : (
                <XCircle className="w-4 h-4 text-gray-400" />
              )}
              <span className="text-sm font-mono">{result.url}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {result.loading ? 'Checking...' : 
               result.hasEvent ? 'Found' : 
               result.error ? 'Error' : 'Not found'}
            </div>
          </div>
        ))}
      </div>

      {successfulRelays.length > 0 && (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm text-green-700 dark:text-green-300">
            ✅ Your note is successfully stored on {successfulRelays.length} relay(s) and should be visible on Nostr explorers.
          </p>
        </div>
      )}

      {successfulRelays.length === 0 && !isChecking && (
        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            ⚠️ Note not found on any checked relays. This might indicate a sync issue.
          </p>
        </div>
      )}
    </div>
  )
}
