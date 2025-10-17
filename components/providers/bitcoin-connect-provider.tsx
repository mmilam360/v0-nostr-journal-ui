'use client'

import { ClientOnly } from '../client-only'

export function BitcoinConnectProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClientOnly fallback={<div>{children}</div>}>
      {children}
    </ClientOnly>
  )
}
