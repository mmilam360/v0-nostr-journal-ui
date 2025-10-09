"use client"

import { useMutation, type UseMutationResult } from "@tanstack/react-query"
import { useNostr } from "@/lib/nostr-provider"
import { RELAYS } from "@/lib/nostr-provider"
import { signEventWithRemote } from "@/lib/signer-manager"
import type { AuthData } from "@/components/main-app"

interface NostrEventTemplate {
  kind: number
  content?: string
  tags?: string[][]
  created_at?: number
}

export function useNostrPublish(authData: AuthData): UseMutationResult<any, Error, NostrEventTemplate> {
  const { pool } = useNostr()

  return useMutation({
    mutationFn: async (template: NostrEventTemplate) => {
      if (!authData) {
        throw new Error("User is not logged in")
      }

      const unsignedEvent = {
        kind: template.kind,
        content: template.content ?? "",
        tags: template.tags ?? [],
        created_at: template.created_at ?? Math.floor(Date.now() / 1000),
        pubkey: authData.pubkey,
      }

      // Sign the event using our existing signer
      const signedEvent = await signEventWithRemote(unsignedEvent, authData)

      // Publish to relays - simple approach
      const relays = await pool.publish(RELAYS, signedEvent)
      
      return signedEvent
    },
    onError: (error) => {
      console.error("Failed to publish event:", error)
    },
    onSuccess: (data) => {
      console.log("Event published successfully:", data.id)
    },
  })
}
