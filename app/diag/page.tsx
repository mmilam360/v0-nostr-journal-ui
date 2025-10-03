"use client"

import { NetworkConnectivityTester } from "@/components/network-connectivity-tester"

export default function DiagnosticPage() {
  return (
    <main className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <NetworkConnectivityTester />
    </main>
  )
}
