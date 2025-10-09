"use client"

import { useState, useEffect } from "react"
import { Loader2, Zap, Globe, Lock, RefreshCw, CheckCircle } from "lucide-react"

interface LoadingScreenProps {
  isLoading: boolean
}

const loadingMessages = [
  { text: "Connecting to Nostr relays...", icon: Zap },
  { text: "Querying decentralized network...", icon: Globe },
  { text: "Fetching encrypted events...", icon: Lock },
  { text: "Syncing with Nostr...", icon: RefreshCw },
  { text: "Ready to connect!", icon: CheckCircle },
]

const encouragingMessages = [
  "Decentralized and secure ✨",
  "Your data, your control 💫",
  "No servers, no limits 🌟",
  "Built on Nostr protocol 📡",
  "Censorship resistant 🛡️",
  "Open source freedom 🚀",
]

export function LoadingScreen({ isLoading }: LoadingScreenProps) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0)
  const [currentEncouragementIndex, setCurrentEncouragementIndex] = useState(0)
  const [dots, setDots] = useState("")

  useEffect(() => {
    if (!isLoading) return

    // Cycle through loading messages
    const messageInterval = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % loadingMessages.length)
    }, 2000)

    // Cycle through encouraging messages
    const encouragementInterval = setInterval(() => {
      setCurrentEncouragementIndex((prev) => (prev + 1) % encouragingMessages.length)
    }, 3000)

    // Animate dots
    const dotsInterval = setInterval(() => {
      setDots((prev) => {
        if (prev === "...") return ""
        return prev + "."
      })
    }, 500)

    return () => {
      clearInterval(messageInterval)
      clearInterval(encouragementInterval)
      clearInterval(dotsInterval)
    }
  }, [isLoading])

  if (!isLoading) return null

  const CurrentIcon = loadingMessages[currentMessageIndex].icon
  const currentMessage = loadingMessages[currentMessageIndex].text
  const currentEncouragement = encouragingMessages[currentEncouragementIndex]

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center space-y-8 max-w-md mx-auto px-6">
        {/* Logo/Icon */}
        <div className="relative">
          <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
            <BookOpen className="w-10 h-10 text-primary animate-pulse" />
          </div>
          <div className="absolute -top-2 -right-2 w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center">
            <Heart className="w-3 h-3 text-primary animate-bounce" />
          </div>
        </div>

        {/* Loading Message */}
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-3">
            <CurrentIcon className="w-5 h-5 text-primary animate-spin" />
            <span className="text-lg font-medium text-foreground">
              {currentMessage}
            </span>
          </div>
          
          <div className="flex items-center justify-center gap-1">
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
            <span className="text-sm text-muted-foreground">
              {dots}
            </span>
          </div>
        </div>

        {/* Encouraging Message */}
        <div className="space-y-2">
          <div className="w-full h-px bg-border"></div>
          <p className="text-sm text-muted-foreground animate-fade-in">
            {currentEncouragement}
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2">
          {loadingMessages.map((_, index) => (
            <div
              key={index}
              className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                index === currentMessageIndex
                  ? "bg-primary"
                  : index < currentMessageIndex
                  ? "bg-primary/60"
                  : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
