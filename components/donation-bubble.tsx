"use client"

import { Zap } from "lucide-react"

interface DonationBubbleProps {
  onClick: () => void
}

export default function DonationBubble({ onClick }: DonationBubbleProps) {
  return (
    <div className="relative">
          <button
        onClick={onClick}
        className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium"
        aria-label="Support development with Lightning"
      >
        <Zap className="w-4 h-4" />
        <span>⚡ Support</span>
          </button>
    </div>
  )
}
