"use client"

import { useState, useEffect } from "react"

// The most reliable public relays
const RELAYS_TO_TEST = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
  "wss://nostr.mutinywallet.com",
]

interface LogEntry {
  message: string
  isError: boolean
  time: string
}

export function NetworkConnectivityTester() {
  const [log, setLog] = useState<LogEntry[]>([])
  const [finalStatus, setFinalStatus] = useState("Testing...")

  const addLog = (message: string, isError = false) => {
    setLog((prev) => [...prev, { message, isError, time: new Date().toLocaleTimeString() }])
  }

  useEffect(() => {
    addLog("--- Starting WebSocket Connectivity Test ---")

    const testPromises = RELAYS_TO_TEST.map((url) => {
      return new Promise<boolean>((resolve) => {
        addLog(`Attempting to connect to: ${url}`)
        try {
          const ws = new WebSocket(url)
          const timeout = setTimeout(() => {
            addLog(`❌ [${url.replace("wss://", "")}] FAILED: Connection timed out after 10 seconds.`, true)
            ws.close()
            resolve(false)
          }, 10000)

          ws.onopen = () => {
            clearTimeout(timeout)
            addLog(`✅ [${url.replace("wss://", "")}] SUCCESS: Connection opened.`)
            ws.close()
            resolve(true)
          }

          ws.onerror = () => {
            clearTimeout(timeout)
            addLog(`❌ [${url.replace("wss://", "")}] FAILED: WebSocket error occurred.`, true)
            ws.close()
            resolve(false)
          }
        } catch (e) {
          addLog(`❌ [${url.replace("wss://", "")}] FAILED: Could not create WebSocket.`, true)
          resolve(false)
        }
      })
    })

    Promise.all(testPromises).then((results) => {
      const anySuccess = results.some((success) => success === true)
      if (anySuccess) {
        addLog("--- ✅ TEST COMPLETE: At least one relay connection was successful. ---")
        setFinalStatus("Success!")
      } else {
        addLog("--- ❌ TEST FAILED: Could not connect to ANY relays. ---", true)
        addLog("This indicates a deep environmental issue (network, Vercel, or browser blocking).", true)
        setFinalStatus("Complete Failure")
      }
    })
  }, [])

  return (
    <div className="w-full max-w-2xl rounded-lg bg-slate-900 p-6 text-white shadow-lg font-mono text-xs">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-white">Network Connectivity Diagnostic</h2>
        <p
          className={`font-bold text-lg ${
            finalStatus === "Success!"
              ? "text-green-400"
              : finalStatus === "Complete Failure"
                ? "text-red-400"
                : "text-yellow-400"
          }`}
        >
          Status: {finalStatus}
        </p>
      </div>
      <div className="h-96 overflow-y-auto bg-black p-4 rounded-md">
        {log.map((entry, i) => (
          <div
            key={i}
            className={`flex ${
              entry.isError ? "text-red-400" : entry.message.startsWith("✅") ? "text-green-400" : "text-slate-300"
            }`}
          >
            <span className="text-slate-600 mr-2">{entry.time}</span>
            <span>{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
