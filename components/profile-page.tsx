"use client"

import { useState, useEffect } from "react"
import { X, Copy, Check, User, Zap, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AuthData } from "./main-app"

interface ProfilePageProps {
  authData: AuthData
  onClose: () => void
  onLightningAddressUpdate?: (address: string) => void
}

export default function ProfilePage({ authData, onClose, onLightningAddressUpdate }: ProfilePageProps) {
  const [npub, setNpub] = useState<string>("")
  const [profilePicture, setProfilePicture] = useState<string>("")
  const [displayName, setDisplayName] = useState<string>("")
  const [lightningAddress, setLightningAddress] = useState<string>("")
  const [copiedNpub, setCopiedNpub] = useState(false)
  const [copiedNsec, setCopiedNsec] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    console.log('[Profile] 🔄 Profile page loading for user:', authData.pubkey)
    const loadProfile = async () => {
      try {
        const { npubEncode } = await import("nostr-tools/nip19")
        const encodedNpub = npubEncode(authData.pubkey)
        setNpub(encodedNpub)

        // Fetch profile metadata from Nostr
        try {
          const { SimplePool } = await import("nostr-tools/pool")
          const pool = new SimplePool()

          const RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"]

          const events = await pool.querySync(RELAYS, {
            kinds: [0],
            authors: [authData.pubkey],
            limit: 1,
          })

          if (events.length > 0) {
            const metadata = JSON.parse(events[0].content)
            console.log('[Profile] 📋 Profile metadata:', metadata)
            
            if (metadata.picture) {
              setProfilePicture(metadata.picture)
            }
            if (metadata.name || metadata.display_name) {
              setDisplayName(metadata.display_name || metadata.name)
            }
            if (metadata.lud16 || metadata.lightning_address) {
              const lnAddress = metadata.lud16 || metadata.lightning_address
              console.log('[Profile] ⚡ Found Lightning address in profile:', lnAddress)
              setLightningAddress(lnAddress)
            }
          }

          // Load Lightning address from localStorage as fallback
          const savedLightningAddress = localStorage.getItem(`lightning-address-${authData.pubkey}`)
          console.log('[Profile] 🔍 Checking localStorage for Lightning address:', savedLightningAddress)
          if (savedLightningAddress) {
            console.log('[Profile] ✅ Using Lightning address from localStorage:', savedLightningAddress)
            setLightningAddress(savedLightningAddress)
          }

          pool.close(RELAYS)
        } catch (err) {
          console.error("Failed to fetch profile metadata:", err)
        }
      } catch (err) {
        console.error("Failed to encode npub:", err)
      } finally {
        setIsLoading(false)
      }
    }

    loadProfile()
  }, [authData.pubkey])

  const handleCopyNpub = async () => {
    try {
      await navigator.clipboard.writeText(npub)
      setCopiedNpub(true)
      setTimeout(() => setCopiedNpub(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const handleCopyNsec = async () => {
    if (!authData.nsec) return
    try {
      await navigator.clipboard.writeText(authData.nsec)
      setCopiedNsec(true)
      setTimeout(() => setCopiedNsec(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const handleSaveLightningAddress = async () => {
    console.log('[Profile] 💾 Saving Lightning address:', lightningAddress)
    setIsSaving(true)
    try {
      // Save to localStorage for immediate use
      localStorage.setItem(`lightning-address-${authData.pubkey}`, lightningAddress)
      console.log('[Profile] ✅ Lightning address saved to localStorage')
      
      // Update Nostr profile metadata
      const { SimplePool } = await import("nostr-tools/pool")
      const pool = new SimplePool()
      
      const RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band"]
      
      // Get existing metadata
      const events = await pool.querySync(RELAYS, {
        kinds: [0],
        authors: [authData.pubkey],
        limit: 1,
      })
      
      let metadata = {}
      if (events.length > 0) {
        metadata = JSON.parse(events[0].content)
      }
      
      // Update with new Lightning address
      metadata.lud16 = lightningAddress
      metadata.lightning_address = lightningAddress
      
      // Create new profile event
      const profileEvent = {
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify(metadata),
        pubkey: authData.pubkey
      }
      
      // Sign and publish
      const { signEventWithRemote } = await import("@/lib/signer-manager")
      const signedEvent = await signEventWithRemote(profileEvent, authData)
      await pool.publish(RELAYS, signedEvent)
      
      console.log("✅ Lightning address saved:", lightningAddress)
      
      // Update Lightning address in active stake if one exists
      try {
        const { updateStakeLightningAddress } = await import("@/lib/incentive-nostr-new")
        await updateStakeLightningAddress(authData.pubkey, lightningAddress, authData)
        console.log('[Profile] ✅ Lightning address updated in active stake')
      } catch (error) {
        console.log('[Profile] ℹ️ No active stake to update Lightning address:', error.message)
      }
      
      // Notify parent component of the update
      if (onLightningAddressUpdate) {
        onLightningAddressUpdate(lightningAddress)
      }
      
    } catch (error) {
      console.error("Failed to save Lightning address:", error)
      alert("Failed to save Lightning address. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  console.log('[Profile] 🎨 Rendering ProfilePage component')
  console.log('[Profile] 🔍 Profile page state:', {
    isLoading,
    isSaving,
    lightningAddress,
    hasAuthData: !!authData
  })
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-md border border-slate-700">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">Account Profile</h2>
          <Button onClick={onClose} variant="ghost" size="sm" className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-slate-400">Loading profile...</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center overflow-hidden">
                  {profilePicture ? (
                    <img
                      src={profilePicture || "/placeholder.svg"}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-8 h-8 text-slate-400" />
                  )}
                </div>
                <div className="flex-1">
                  {displayName && <p className="text-white font-medium">{displayName}</p>}
                  <p className="text-slate-400 text-sm">
                    {authData.authMethod === "extension"
                      ? "Extension"
                      : authData.authMethod === "remote"
                        ? "Remote Signer"
                        : "Private Key"}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Public Key (npub)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={npub}
                      readOnly
                      className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-300 font-mono overflow-x-auto"
                    />
                    <Button
                      onClick={handleCopyNpub}
                      variant="ghost"
                      size="sm"
                      className="text-slate-400 hover:text-white"
                      title="Copy to clipboard"
                    >
                      {copiedNpub ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {authData.nsec && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Private Key (nsec) - Keep this secret!
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={authData.nsec}
                        readOnly
                        className="flex-1 bg-slate-900 border border-red-900/50 rounded-lg px-3 py-2 text-sm text-red-300 font-mono overflow-x-auto"
                      />
                      <Button
                        onClick={handleCopyNsec}
                        variant="ghost"
                        size="sm"
                        className="text-slate-400 hover:text-white"
                        title="Copy to clipboard"
                      >
                        {copiedNsec ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Click the copy button to reveal and copy your private key
                    </p>
                  </div>
                )}

                <div className="bg-yellow-100 p-4 rounded-lg border-2 border-yellow-500">
                  <label className="block text-sm font-medium text-slate-800 mb-2">
                    <Zap className="inline w-4 h-4 mr-1" />
                    Lightning Address (DEBUG: Field is rendered)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={lightningAddress}
                      onChange={(e) => {
                        console.log('[Profile] 📝 Lightning address input changed:', e.target.value)
                        setLightningAddress(e.target.value)
                      }}
                      placeholder="your@lightning.address"
                      className="flex-1 bg-white border-gray-300 text-gray-900"
                    />
                    <Button
                      onClick={handleSaveLightningAddress}
                      disabled={isSaving}
                      variant="outline"
                      size="sm"
                      className="border-blue-500 text-blue-600 hover:bg-blue-50"
                    >
                      {isSaving ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-300"></div>
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-700 mt-1">
                    Where Lightning rewards will be sent. This updates your Nostr profile.
                  </p>
                  <p className="text-xs text-blue-600 mt-1 font-bold">
                    Current value: {lightningAddress || 'empty'}
                  </p>
                </div>

                {!authData.nsec && authData.authMethod !== "extension" && (
                  <div className="bg-yellow-900/20 border border-yellow-500/50 rounded-lg p-3">
                    <p className="text-xs text-yellow-400">
                      Your private key is not stored in this session. If you used a remote signer, your keys are managed
                      by that app.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
