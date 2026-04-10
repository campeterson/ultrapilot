// Fathom Analytics — thin wrapper so call sites don't need to know about window.fathom

declare global {
  interface Window {
    fathom?: {
      trackEvent: (name: string, opts?: { _value?: number }) => void
    }
  }
}

export function trackEvent(name: string) {
  window.fathom?.trackEvent(name)
}
