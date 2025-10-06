"use client"

import { useState } from "react"
import { Circle, LogOut, ChevronDown, User, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"

interface UserMenuProps {
  pubkey: string
  onLogout: () => void
  onShowProfile?: () => void
}

export default function UserMenu({ pubkey, onLogout, onShowProfile }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false)

  const getTruncatedNpub = (pubkey: string) => {
    try {
      // Simple truncation for display (in real implementation, would use nip19.npubEncode)
      return `npub1${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`
    } catch {
      return `npub1${pubkey.slice(0, 8)}...`
    }
  }

  const handleLogout = () => {
    localStorage.removeItem("nostrUserNsec")
    console.log("[v0] Cleared session data on logout")
    setIsOpen(false)
    onLogout()
  }

  return (
    <div className="relative">
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground hover:bg-muted"
      >
        <Circle className="w-3 h-3 text-green-500 fill-current mr-2" />
        <span className="text-sm font-mono truncate mr-2 hidden sm:inline">{getTruncatedNpub(pubkey)}</span>
        <ChevronDown className="w-3 h-3" />
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

          {/* Dropdown Menu */}
          <div className="absolute top-full right-0 mt-1 bg-card rounded-lg shadow-lg border border-border z-20 min-w-[200px]">
            <div className="p-2">
              <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border mb-1">
                {getTruncatedNpub(pubkey)}
              </div>
              
              {onShowProfile && (
                <Button
                  onClick={() => {
                    onShowProfile()
                    setIsOpen(false)
                  }}
                  variant="ghost"
                  className="w-full justify-start text-foreground hover:bg-muted p-2 rounded-md"
                >
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </Button>
              )}
              
              <Button
                onClick={handleLogout}
                variant="ghost"
                className="w-full justify-start text-destructive hover:bg-destructive/10 p-2 rounded-md"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
