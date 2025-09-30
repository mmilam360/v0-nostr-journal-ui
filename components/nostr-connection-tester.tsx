"use client"

import { useState, useEffect } from "react"
import * as nostrTools from "nostr-tools"

// A list of reliable public relays to test against.
const RELAYS_TO_TEST = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
  "wss://nostr.mutinywallet.com",
]

export function NostrConnectionTester() {
  // A log of events to display on the screen.
  const [log, setLog] = useState(["Initializing test..."])
  const [testStatus, setTestStatus] = useState<"running" | "success" | "failure">("running")

  const addLog = (message: string) => {
    setLog((prev) => [...prev, message])
  }

  useEffect(() => {
    let pool: nostrTools.SimplePool | null = null
    let sub: any = null

    const runTest = async () => {
      try {
        addLog("Attempting to initialize SimplePool...")
        pool = new nostrTools.SimplePool()
        addLog("✅ SimplePool initialized.")

        // We will try to fetch a well-known, recent event (e.g., a note from Jack Dorsey).
        // This is a simple, reliable way to test if we can receive data.
        const jackDorseyPubkey = "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2"
        const filters = [{ authors: [jackDorseyPubkey], kinds: [1], limit: 1 }]

        addLog(`Connecting to ${RELAYS_TO_TEST.length} relays...`)

        // This is a simple subscription.
        sub = pool.sub(RELAYS_TO_TEST, filters)

        const timeout = setTimeout(() => {
          addLog("❌ TEST FAILED: Timeout reached. No event received after 15 seconds.")
          setTestStatus("failure")
          if (sub) sub.unsub()
          if (pool) pool.close(RELAYS_TO_TEST)
        }, 15000) // 15 second timeout

        sub.on("event", (event: any) => {
          clearTimeout(timeout)
          addLog("✅ SUCCESS! Received an event from the network.")
          addLog(`Event ID: ${event.id.substring(0, 10)}...`)
          addLog(`Content: ${event.content.substring(0, 50)}...`)
          setTestStatus("success")
          sub.unsub()
          pool?.close(RELAYS_TO_TEST)
        })

        sub.on("eose", () => {
          addLog("ℹ️ EOSE received. Subscription is active and listening.")
        })
      } catch (e) {
        addLog("❌ TEST FAILED: An unexpected error occurred during initialization.")
        if (e instanceof Error) {
          addLog(`Error: ${e.message}`)
        }
        setTestStatus("failure")
        if (sub) sub.unsub()
        if (pool) pool.close(RELAYS_TO_TEST)
      }
    }

    runTest()

    // Cleanup function
    return () => {
      if (sub) sub.unsub()
      if (pool) pool.close(RELAYS_TO_TEST)
    }
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
          <h2 className="text-lg font-bold text-white">Nostr Network Diagnostic</h2>
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
