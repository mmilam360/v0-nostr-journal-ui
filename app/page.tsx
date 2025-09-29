"use client"

import { useAuthManager } from "@/hooks/useAuthManager"
import UnifiedLoginScreen from "@/components/unified-login-screen"
import UnlockScreen from "@/components/unlock-screen"
import MainApp from "@/components/main-app"

export default function Home() {
  const {
    authState,
    userPubkey,
    nostrSigner,
    authMethod,
    createNewAccount,
    importAccount,
    connectBunker,
    connectExtension,
    unlockAccount,
    logout,
    forgetAccount,
  } = useAuthManager()

  // Loading state
  if (authState === "loading") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (authState === "no_account") {
    return (
      <UnifiedLoginScreen
        onCreateAccount={createNewAccount}
        onBunkerConnect={connectBunker}
        onExtensionLogin={connectExtension}
      />
    )
  }

  // Locked state - show unlock screen
  if (authState === "locked") {
    return <UnlockScreen userPubkey={userPubkey} onUnlock={unlockAccount} onForgetAccount={forgetAccount} />
  }

  if (authState === "unlocked" && userPubkey) {
    // Prepare auth data based on authentication method
    let authData

    if (authMethod === "nsec" && nostrSigner) {
      // Convert Uint8Array to hex string for nsec method
      const privateKeyHex = Array.from(nostrSigner, (byte) => byte.toString(16).padStart(2, "0")).join("")
      authData = {
        pubkey: userPubkey,
        authMethod: "nsec" as const,
        privateKey: privateKeyHex,
      }
    } else if (authMethod === "extension") {
      authData = {
        pubkey: userPubkey,
        authMethod: "extension" as const,
      }
    } else if (authMethod === "bunker") {
      authData = {
        pubkey: userPubkey,
        authMethod: "nwc" as const, // Use "nwc" for bunker connections in MainApp
      }
    } else {
      // Fallback - should not happen
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <div className="text-center">
            <p className="text-slate-400">Authentication method not recognized. Please try logging in again.</p>
          </div>
        </div>
      )
    }

    return <MainApp authData={authData} onLogout={logout} />
  }

  // Fallback - should never reach here
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <p className="text-slate-400">Something went wrong. Please refresh the page.</p>
      </div>
    </div>
  )
}
