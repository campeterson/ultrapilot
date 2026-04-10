import { useState, useEffect } from 'react'

export type LayoutMode = 'phone' | 'tablet-portrait' | 'tablet-landscape'

function getMode(width: number): LayoutMode {
  if (width >= 1024) return 'tablet-landscape'
  if (width >= 768) return 'tablet-portrait'
  return 'phone'
}

export function useResponsiveLayout(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(() => getMode(window.innerWidth))

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width ?? window.innerWidth
      setMode(getMode(width))
    })
    observer.observe(document.documentElement)
    return () => observer.disconnect()
  }, [])

  return mode
}
