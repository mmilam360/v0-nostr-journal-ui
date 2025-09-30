"use client"

import { useState, useEffect } from "react"
import { NostrFetcher } from "nostr-fetch"

const RELAYS_TO_TEST = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
  "wss://nostr.mutinywallet.com",
]

export function NostrFetchTester() {
  const [log, setLog] = useState<string[]>(["Initializing test with nostr-fetch..."])
  const [testStatus, setTestStatus] = useState<"running" | "success" | "failure">("running")

  const addLog = (message: string) => {
    setLog((prev) => [...prev, message])
  }

  useEffect(() => {
    const runTest = async () => {
      try {
        addLog("Attempting to initialize NostrFetcher...")
        const fetcher = NostrFetcher.init()
        addLog("✅ NostrFetcher initialized.")

        // Fetch a single, well-known event to test the connection
        const jackDorseyPubkey = "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2"

        addLog(`Fetching latest note from Jack Dorsey via ${RELAYS_TO_TEST.length} relays...`)

        const latestEvent = await fetcher.fetchLastEvent(RELAYS_TO_TEST, {
          authors: [jackDorseyPubkey],
          kinds: [1],
        })

        if (latestEvent) {
          addLog("✅ SUCCESS! Received an event from the network.")
          addLog(`Event ID: ${latestEvent.id.substring(0, 10)}...`)
          addLog(`Content: ${latestEvent.content.substring(0, 50)}...`)
          setTestStatus("success")
        } else {
          addLog("❌ TEST FAILED: No event was returned. Relays might be connected but found no data.")
          setTestStatus("failure")
        }

        fetcher.shutdown()
      } catch (e) {
        addLog("❌ TEST FAILED: An unexpected error occurred.")
        if (e instanceof Error) {
          addLog(`Error: ${e.message}`)
        }
        setTestStatus("failure")
      }
    }

    runTest()
  }, [])

  const getStatusColor = () => {
    if (testStatus === "success") return "text-green-400"
    if (testStatus === "failure") return "text-red-400"
    return "text-yellow-400"
  }

  const getStatusBgColor = () => {
    if (testStatus === "success") return "bg-green-400/20"
    if (testStatus === "failure") return "bg-red-400/20"
    return "bg-yellow-400/20"
  }

  const getStatusDotColor = () => {
    if (testStatus === "success") return "bg-green-400"
    if (testStatus === "failure") return "bg-red-400"
    return "bg-yellow-400"
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="w-full max-w-lg rounded-lg bg-slate-900 p-6 text-white shadow-lg font-mono text-xs">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-white">Nostr Network Diagnostic (nostr-fetch)</h2>
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${getStatusBgColor()}`}>
            <span className={`h-2 w-2 rounded-full ${getStatusDotColor()}`}></span>
            <span className={`font-bold ${getStatusColor()}`}>{testStatus.toUpperCase()}</span>
          </div>
        </div>
        <div className="h-64 overflow-y-auto bg-black p-4 rounded-md">
          {log.map((entry, i) => (
            <p
              key={i}
              className={
                entry.startsWith("✅") ? "text-green-400" : entry.startsWith("❌") ? "text-red-400" : "text-slate-300"
              }
            >
              <span className="text-slate-500 mr-2">{i}:</span>
              {entry}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}
