"use client"

import { useState, useEffect } from "react"

interface LoadingScreenProps {
  isLoading: boolean
}

export function LoadingScreen({ isLoading }: LoadingScreenProps) {
  if (!isLoading) return null

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md mx-auto px-6">
        {/* Loading Message */}
        <div className="space-y-6">
          <h2 className="text-lg font-medium text-foreground">
            Loading your notes...
          </h2>
          
          {/* Bouncing Ball Loader */}
          <div className="bouncing-loader">
            <div></div>
            <div></div>
            <div></div>
          </div>
        </div>
      </div>
      
      <style jsx>{`
        .bouncing-loader {
          display: flex;
          justify-content: center;
        }

        .bouncing-loader > div {
          width: 16px;
          height: 16px;
          margin: 0 4px;
          background: hsl(var(--primary));
          border-radius: 50%;
          animation: bouncing-loader 0.6s infinite alternate;
        }

        .bouncing-loader > div:nth-child(2) {
          animation-delay: 0.2s;
        }

        .bouncing-loader > div:nth-child(3) {
          animation-delay: 0.4s;
        }

        @keyframes bouncing-loader {
          to {
            opacity: 0.1;
            transform: translate3d(0, -16px, 0);
          }
        }
      `}</style>
    </div>
  )
}
