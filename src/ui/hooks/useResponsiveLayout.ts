import { useState, useEffect } from 'react'

export type LayoutMode = 'phone' | 'tablet-portrait' | 'tablet-landscape'

/** Phones are identified by their short dimension being under 600px.
 *  This catches phones in both portrait and landscape without misidentifying
 *  tablets as phones just because they're narrow. */
function getMode(width: number, height: number): LayoutMode {
  const shortSide = Math.min(width, height)
  if (shortSide < 600) return 'phone'
  return width > height ? 'tablet-landscape' : 'tablet-portrait'
}

export function useResponsiveLayout(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>(() =>
    getMode(window.innerWidth, window.innerHeight)
  )

  useEffect(() => {
    const update = () => setMode(getMode(window.innerWidth, window.innerHeight))

    // ResizeObserver catches window resize and orientation changes
    const ro = new ResizeObserver(update)
    ro.observe(document.documentElement)

    // Also listen to orientationchange for faster response on mobile
    window.addEventListener('orientationchange', update)

    return () => {
      ro.disconnect()
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return mode
}
