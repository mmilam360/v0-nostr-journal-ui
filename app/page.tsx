"use client"

import { useAuthManager } from "@/hooks/useAuthManager"
import OnboardingScreen from "@/components/onboarding-screen"
import UnlockScreen from "@/components/unlock-screen"
import MainApp from "@/components/main-app"

export default function Home() {
  const { authState, userPubkey, nostrSigner, createNewAccount, importAccount, unlockAccount, logout, forgetAccount } =
    useAuthManager()

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

  // No account state - show onboarding
  if (authState === "no_account") {
    return <OnboardingScreen onCreateAccount={createNewAccount} onImportAccount={importAccount} />
  }

  // Locked state - show unlock screen
  if (authState === "locked") {
    return <UnlockScreen userPubkey={userPubkey} onUnlock={unlockAccount} onForgetAccount={forgetAccount} />
  }

  // Unlocked state - show main app
  if (authState === "unlocked" && userPubkey && nostrSigner) {
    // Convert Uint8Array to hex string for compatibility with existing MainApp
    const privateKeyHex = Array.from(nostrSigner, (byte) => byte.toString(16).padStart(2, "0")).join("")

    const authData = {
      pubkey: userPubkey,
      authMethod: "nsec" as const,
      privateKey: privateKeyHex,
    }

    return (
      <MainApp
        authData={authData}
        onLogout={logout}
        encryptionKey={null} // We'll handle encryption differently now
      />
    )
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
