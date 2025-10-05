"use client"

import { useState, useEffect } from "react"
import { CheckCircle2, AlertCircle, Loader2, RefreshCw, Wifi, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { testRelayHealth, getHealthyRelays } from "@/lib/relay-manager"

interface ConnectionStatusProps {
  onRetry?: () => void
  className?: string
}

export function ConnectionStatus({ onRetry, className = "" }: ConnectionStatusProps) {
  const [isChecking, setIsChecking] = useState(false)
  const [lastCheck, setLastCheck] = useState<Date | null>(null)
  const [healthyRelays, setHealthyRelays] = useState<string[]>([])
  const [unhealthyRelays, setUnhealthyRelays] = useState<string[]>([])
  const [isConnected, setIsConnected] = useState<boolean | null>(null)

  const checkConnection = async () => {
    setIsChecking(true)
    try {
      console.log("[v0] 🔍 Checking relay connectivity...")
      const relays = await getHealthyRelays()
      
      setHealthyRelays(relays)
      setIsConnected(relays.length > 0)
      setLastCheck(new Date())
      
      console.log(`[v0] ✅ Connection check complete: ${relays.length} healthy relays`)
    } catch (error) {
      console.error("[v0] ❌ Connection check failed:", error)
      setIsConnected(false)
      setHealthyRelays([])
      setLastCheck(new Date())
    } finally {
      setIsChecking(false)
    }
  }

  useEffect(() => {
    checkConnection()
  }, [])

  const getStatusIcon = () => {
    if (isChecking) return <Loader2 className="h-4 w-4 animate-spin" />
    if (isConnected === null) return <Wifi className="h-4 w-4 text-gray-400" />
    if (isConnected) return <CheckCircle2 className="h-4 w-4 text-green-500" />
    return <WifiOff className="h-4 w-4 text-red-500" />
  }

  const getStatusText = () => {
    if (isChecking) return "Checking connection..."
    if (isConnected === null) return "Connection status unknown"
    if (isConnected) return `Connected (${healthyRelays.length} relays)`
    return "No relay connection"
  }

  const getStatusColor = () => {
    if (isChecking) return "text-yellow-600"
    if (isConnected === null) return "text-gray-600"
    if (isConnected) return "text-green-600"
    return "text-red-600"
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {getStatusIcon()}
      <span className={`text-sm font-medium ${getStatusColor()}`}>
        {getStatusText()}
      </span>
      
      {lastCheck && (
        <span className="text-xs text-gray-500">
          ({lastCheck.toLocaleTimeString()})
        </span>
      )}
      
      <Button
        onClick={checkConnection}
        disabled={isChecking}
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0"
      >
        <RefreshCw className={`h-3 w-3 ${isChecking ? 'animate-spin' : ''}`} />
      </Button>
      
      {onRetry && !isConnected && (
        <Button
          onClick={onRetry}
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
        >
          Retry
        </Button>
      )}
    </div>
  )
}

interface DetailedConnectionStatusProps {
  className?: string
}

export function DetailedConnectionStatus({ className = "" }: DetailedConnectionStatusProps) {
  const [relayHealth, setRelayHealth] = useState<Array<{url: string, healthy: boolean, error?: string}>>([])
  const [isChecking, setIsChecking] = useState(false)

  const checkAllRelays = async () => {
    setIsChecking(true)
    setRelayHealth([])
    
    const relays = [
      "wss://relay.damus.io",
      "wss://relay.primal.net", 
      "wss://relay.nostr.band",
      "wss://nos.lol",
      "wss://relay.nsec.app",
      "wss://nostr.mutinywallet.com"
    ]
    
    const healthChecks = await Promise.allSettled(
      relays.map(async (relay) => {
        try {
          const health = await testRelayHealth(relay)
          return {
            url: relay,
            healthy: health.isHealthy,
            error: health.error
          }
        } catch (error) {
          return {
            url: relay,
            healthy: false,
            error: error instanceof Error ? error.message : "Unknown error"
          }
        }
      })
    )
    
    const results = healthChecks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value
      } else {
        return {
          url: relays[index],
          healthy: false,
          error: "Test failed"
        }
      }
    })
    
    setRelayHealth(results)
    setIsChecking(false)
  }

  useEffect(() => {
    checkAllRelays()
  }, [])

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Relay Status</h3>
        <Button
          onClick={checkAllRelays}
          disabled={isChecking}
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
        >
          {isChecking ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <RefreshCw className="h-3 w-3 mr-1" />
          )}
          Refresh
        </Button>
      </div>
      
      <div className="space-y-2">
        {relayHealth.map((relay) => (
          <div key={relay.url} className="flex items-center justify-between text-xs">
            <span className="font-mono text-gray-600 truncate flex-1 mr-2">
              {relay.url.replace('wss://', '')}
            </span>
            <div className="flex items-center gap-1">
              {relay.healthy ? (
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              ) : (
                <AlertCircle className="h-3 w-3 text-red-500" />
              )}
              {relay.error && (
                <span className="text-red-500 text-xs truncate max-w-20">
                  {relay.error}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {relayHealth.length > 0 && (
        <div className="text-xs text-gray-500 pt-2 border-t">
          {relayHealth.filter(r => r.healthy).length} of {relayHealth.length} relays healthy
        </div>
      )}
    </div>
  )
}
