"use client"

import { useState } from "react"
import { Circle, LogOut, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"

interface UserMenuProps {
  pubkey: string
  onLogout: () => void
}

export default function UserMenu({ pubkey, onLogout }: UserMenuProps) {
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
        className="w-full justify-start text-slate-300 hover:text-white hover:bg-slate-700 p-3"
      >
        <Circle className="w-3 h-3 text-green-500 fill-current mr-2" />
        <span className="text-sm font-mono truncate mr-2">{getTruncatedNpub(pubkey)}</span>
        <ChevronDown className="w-3 h-3 ml-auto" />
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

          {/* Dropdown Menu */}
          <div className="absolute top-full left-0 right-0 mt-1 bg-slate-700 rounded-lg shadow-lg border border-slate-600 z-20">
            <Button
              onClick={handleLogout}
              variant="ghost"
              className="w-full justify-start text-slate-300 hover:text-red-400 hover:bg-slate-600 p-3 rounded-lg"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
