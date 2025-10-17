declare global {
  interface Window {
    webln?: {
      enabled: boolean
      getInfo: () => Promise<{
        alias?: string
        lightningAddress?: string
        methods?: string[]
      }>
      sendPayment: (invoice: string) => Promise<{
        preimage?: string
        payment_hash?: string
      }>
      disconnect: () => void
    }
    customElements?: {
      define: (name: string, constructor: CustomElementConstructor) => void
    }
  }
}

export {}
