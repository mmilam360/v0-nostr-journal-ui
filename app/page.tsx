"use client"
import { useState } from "react"
import { LoginPage } from "@/components/login-page"
import { MainApp } from "@/components/main-app"

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [authData, setAuthData] = useState(null)

  const handleLoginSuccess = (data) => {
    console.log("[v0] Login successful:", data)
    setAuthData(data)
    setIsLoggedIn(true)
  }

  const handleLogout = () => {
    console.log("[v0] Logging out")
    setAuthData(null)
    setIsLoggedIn(false)
  }

  return (
    <main className="min-h-screen bg-slate-900">
      {isLoggedIn && authData ? (
        <MainApp authData={authData} onLogout={handleLogout} />
      ) : (
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      )}
    </main>
  )
}
