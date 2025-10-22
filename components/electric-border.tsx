'use client'

import { useEffect, useState } from 'react'

interface ElectricBorderProps {
  show: boolean
  duration?: number // in milliseconds, default 2000
}

export function ElectricBorder({ show, duration = 2000 }: ElectricBorderProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (show) {
      setIsVisible(true)
      const timer = setTimeout(() => {
        setIsVisible(false)
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [show, duration])

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {/* Electric border animation */}
      <div className="absolute inset-0 rounded-lg animate-electric-border">
        <style jsx>{`
          @keyframes electric-border {
            0% {
              box-shadow:
                0 0 10px rgba(59, 130, 246, 0.5),
                0 0 20px rgba(59, 130, 246, 0.3),
                0 0 30px rgba(59, 130, 246, 0.2),
                inset 0 0 10px rgba(59, 130, 246, 0.5),
                inset 0 0 20px rgba(59, 130, 246, 0.3);
            }
            25% {
              box-shadow:
                0 0 20px rgba(251, 191, 36, 0.7),
                0 0 40px rgba(251, 191, 36, 0.5),
                0 0 60px rgba(251, 191, 36, 0.3),
                inset 0 0 20px rgba(251, 191, 36, 0.7),
                inset 0 0 40px rgba(251, 191, 36, 0.5);
            }
            50% {
              box-shadow:
                0 0 30px rgba(251, 146, 60, 0.8),
                0 0 60px rgba(251, 146, 60, 0.6),
                0 0 90px rgba(251, 146, 60, 0.4),
                inset 0 0 30px rgba(251, 146, 60, 0.8),
                inset 0 0 60px rgba(251, 146, 60, 0.6);
            }
            75% {
              box-shadow:
                0 0 20px rgba(251, 191, 36, 0.7),
                0 0 40px rgba(251, 191, 36, 0.5),
                0 0 60px rgba(251, 191, 36, 0.3),
                inset 0 0 20px rgba(251, 191, 36, 0.7),
                inset 0 0 40px rgba(251, 191, 36, 0.5);
            }
            100% {
              box-shadow:
                0 0 10px rgba(59, 130, 246, 0.5),
                0 0 20px rgba(59, 130, 246, 0.3),
                0 0 30px rgba(59, 130, 246, 0.2),
                inset 0 0 10px rgba(59, 130, 246, 0.5),
                inset 0 0 20px rgba(59, 130, 246, 0.3);
            }
          }

          .animate-electric-border {
            animation: electric-border ${duration}ms ease-in-out;
            border: 3px solid transparent;
            border-radius: 1rem;
          }
        `}</style>
      </div>

      {/* Lightning bolts effect */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-1 h-full bg-gradient-to-b from-transparent via-yellow-400 to-transparent opacity-50 animate-lightning-1" />
        <div className="absolute top-0 right-1/4 w-1 h-full bg-gradient-to-b from-transparent via-blue-400 to-transparent opacity-50 animate-lightning-2" />
        <div className="absolute left-0 top-1/4 w-full h-1 bg-gradient-to-r from-transparent via-orange-400 to-transparent opacity-50 animate-lightning-3" />

        <style jsx>{`
          @keyframes lightning-1 {
            0%, 100% { opacity: 0; transform: translateY(-100%); }
            10%, 90% { opacity: 0.5; }
            50% { opacity: 1; transform: translateY(100%); }
          }

          @keyframes lightning-2 {
            0%, 100% { opacity: 0; transform: translateY(100%); }
            20%, 80% { opacity: 0.5; }
            50% { opacity: 1; transform: translateY(-100%); }
          }

          @keyframes lightning-3 {
            0%, 100% { opacity: 0; transform: translateX(-100%); }
            15%, 85% { opacity: 0.5; }
            50% { opacity: 1; transform: translateX(100%); }
          }

          .animate-lightning-1 {
            animation: lightning-1 ${duration}ms ease-in-out;
          }

          .animate-lightning-2 {
            animation: lightning-2 ${duration}ms ease-in-out 0.2s;
          }

          .animate-lightning-3 {
            animation: lightning-3 ${duration}ms ease-in-out 0.4s;
          }
        `}</style>
      </div>
    </div>
  )
}
