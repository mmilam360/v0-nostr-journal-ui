"use client"

import React, { createContext, useContext, useEffect, useRef } from 'react'
import { SimplePool } from 'nostr-tools/pool'

interface NostrContextType {
  pool: SimplePool
}

const NostrContext = createContext<NostrContextType | null>(null)

// Simple relay list for reliable communication
const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol", 
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
  "wss://relay.snort.social",
]

interface NostrProviderProps {
  children: React.ReactNode
}

export function NostrProvider({ children }: NostrProviderProps) {
  // Create pool instance only once
  const pool = useRef<SimplePool | undefined>(undefined)

  // Initialize pool only once
  if (!pool.current) {
    pool.current = new SimplePool()
  }

  return (
    <NostrContext.Provider value={{ pool: pool.current }}>
      {children}
    </NostrContext.Provider>
  )
}

export function useNostr() {
  const context = useContext(NostrContext)
  if (!context) {
    throw new Error('useNostr must be used within a NostrProvider')
  }
  return context
}

export { RELAYS }
