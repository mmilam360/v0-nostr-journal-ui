"use client"

import { useState, useEffect } from "react"

interface LoadingScreenProps {
  isLoading: boolean
}

export function LoadingScreen({ isLoading }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!isLoading) {
      setProgress(0)
      return
    }

    // Rapid progress bar animation
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) return 0
        return prev + Math.random() * 15 + 5 // Random increment between 5-20%
      })
    }, 100) // Update every 100ms for rapid animation

    return () => clearInterval(interval)
  }, [isLoading])

  if (!isLoading) return null

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md mx-auto px-6">
        {/* Loading Message */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-foreground">
            Loading your notes...
          </h2>
          
          {/* Progress Bar */}
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-300 ease-out rounded-full"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          
          <p className="text-sm text-muted-foreground">
            {Math.round(Math.min(progress, 100))}%
          </p>
        </div>
      </div>
    </div>
  )
}
