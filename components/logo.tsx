import React from 'react'

interface LogoProps {
  className?: string
}

export function Logo({ className = "h-8 w-auto" }: LogoProps) {
  return (
    <img 
      src="/Nostr Journal Logo - Dark Mode.svg" 
      alt="Nostr Journal" 
      className={className}
      onError={(e) => {
        // Fallback to placeholder if logo not found
        e.currentTarget.src = "/placeholder-logo.png"
      }}
    />
  )
}
