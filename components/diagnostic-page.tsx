"use client"

import { useState } from "react"
import { CheckCircle2, AlertCircle, Loader2, RefreshCw, Wifi, WifiOff, Server, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DetailedConnectionStatus } from "@/components/connection-status"
import { testRelayHealth, getHealthyRelays, getDefaultRelays } from "@/lib/relay-manager"

export function DiagnosticPage() {
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false)
  const [diagnosticResults, setDiagnosticResults] = useState<{
    networkConnectivity: boolean
    relayHealth: Array<{url: string, healthy: boolean, responseTime?: number, error?: string}>
    nostrConnectivity: boolean
    timestamp: Date
  } | null>(null)

  const runFullDiagnostics = async () => {
    setIsRunningDiagnostics(true)
    setDiagnosticResults(null)

    try {
      console.log("[v0] 🔍 Running full diagnostics...")
      
      // Test basic network connectivity
      const networkTest = await testNetworkConnectivity()
      
      // Test relay health
      const relayHealth = await testAllRelays()
      
      // Test Nostr protocol connectivity
      const nostrTest = await testNostrConnectivity()
      
      setDiagnosticResults({
        networkConnectivity: networkTest,
        relayHealth,
        nostrConnectivity: nostrTest,
        timestamp: new Date()
      })
      
      console.log("[v0] ✅ Diagnostics complete")
    } catch (error) {
      console.error("[v0] ❌ Diagnostics failed:", error)
    } finally {
      setIsRunningDiagnostics(false)
    }
  }

  const testNetworkConnectivity = async (): Promise<boolean> => {
    try {
      const response = await fetch('https://httpbin.org/get', { 
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache'
      })
      return response.ok
    } catch {
      return false
    }
  }

  const testAllRelays = async () => {
    const relays = getDefaultRelays()
    const healthChecks = await Promise.allSettled(
      relays.map(async (relay) => {
        const health = await testRelayHealth(relay)
        return {
          url: relay,
          healthy: health.isHealthy,
          responseTime: health.responseTime,
          error: health.error
        }
      })
    )
    
    return healthChecks.map((result, index) => {
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
  }

  const testNostrConnectivity = async (): Promise<boolean> => {
    try {
      const healthyRelays = await getHealthyRelays()
      return healthyRelays.length > 0
    } catch {
      return false
    }
  }

  const getOverallStatus = () => {
    if (!diagnosticResults) return null
    
    const { networkConnectivity, relayHealth, nostrConnectivity } = diagnosticResults
    const healthyRelays = relayHealth.filter(r => r.healthy).length
    
    if (networkConnectivity && nostrConnectivity && healthyRelays > 0) {
      return { status: "healthy", color: "text-green-600", icon: CheckCircle2 }
    } else if (networkConnectivity && healthyRelays > 0) {
      return { status: "partial", color: "text-yellow-600", icon: AlertCircle }
    } else {
      return { status: "unhealthy", color: "text-red-600", icon: WifiOff }
    }
  }

  const overallStatus = getOverallStatus()

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Connection Diagnostics</h1>
            <p className="text-muted-foreground mt-1">
              Comprehensive network and relay connectivity testing
            </p>
          </div>
          
          <Button
            onClick={runFullDiagnostics}
            disabled={isRunningDiagnostics}
            className="flex items-center gap-2"
          >
            {isRunningDiagnostics ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isRunningDiagnostics ? "Running..." : "Run Diagnostics"}
          </Button>
        </div>

        {/* Overall Status */}
        {overallStatus && (
          <div className={`p-4 rounded-lg border-2 ${
            overallStatus.status === "healthy" ? "border-green-200 bg-green-50" :
            overallStatus.status === "partial" ? "border-yellow-200 bg-yellow-50" :
            "border-red-200 bg-red-50"
          }`}>
            <div className="flex items-center gap-3">
              <overallStatus.icon className={`h-6 w-6 ${overallStatus.color}`} />
              <div>
                <h3 className="font-semibold text-foreground">
                  Overall Status: {overallStatus.status.charAt(0).toUpperCase() + overallStatus.status.slice(1)}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {diagnosticResults && (
                    <>
                      Network: {diagnosticResults.networkConnectivity ? "✅" : "❌"} • 
                      Nostr: {diagnosticResults.nostrConnectivity ? "✅" : "❌"} • 
                      Relays: {diagnosticResults.relayHealth.filter(r => r.healthy).length}/{diagnosticResults.relayHealth.length}
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Diagnostic Results */}
        {diagnosticResults && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Network Connectivity */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Wifi className="h-5 w-5" />
                <h3 className="font-semibold">Network Connectivity</h3>
              </div>
              <div className="flex items-center gap-2">
                {diagnosticResults.networkConnectivity ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm">
                  {diagnosticResults.networkConnectivity ? "Internet connection working" : "No internet connection"}
                </span>
              </div>
            </div>

            {/* Nostr Connectivity */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Server className="h-5 w-5" />
                <h3 className="font-semibold">Nostr Protocol</h3>
              </div>
              <div className="flex items-center gap-2">
                {diagnosticResults.nostrConnectivity ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm">
                  {diagnosticResults.nostrConnectivity ? "Nostr protocol accessible" : "Nostr protocol blocked"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Relay Status */}
        <div className="p-4 border rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <Server className="h-5 w-5" />
            <h3 className="font-semibold">Relay Health Status</h3>
            <span className="text-sm text-muted-foreground">
              {diagnosticResults && (
                `Last checked: ${diagnosticResults.timestamp.toLocaleTimeString()}`
              )}
            </span>
          </div>
          <DetailedConnectionStatus />
        </div>

        {/* Troubleshooting Tips */}
        <div className="p-4 border rounded-lg bg-muted/50">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Troubleshooting Tips
          </h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>• <strong>No internet connection:</strong> Check your network settings and try refreshing the page</p>
            <p>• <strong>Nostr protocol blocked:</strong> Your network may be blocking WebSocket connections. Try using a VPN or different network</p>
            <p>• <strong>All relays unhealthy:</strong> Try adding different relays in the relay manager, or wait a few minutes and retry</p>
            <p>• <strong>Some relays healthy:</strong> The app should work with at least one healthy relay</p>
            <p>• <strong>Still having issues:</strong> Try clearing your browser cache and localStorage, then refresh the page</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-3">
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh Page
          </Button>
          
          <Button
            onClick={() => {
              localStorage.clear()
              window.location.reload()
            }}
            variant="outline"
            className="flex items-center gap-2"
          >
            <AlertCircle className="h-4 w-4" />
            Clear Cache & Reload
          </Button>
        </div>
      </div>
    </div>
  )
}
