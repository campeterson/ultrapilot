import { useEffect } from 'react'

/**
 * The app never scrolls at the document level — every scrolling area is an
 * inner panel. But iOS (esp. installed PWAs) scrolls the page to keep a
 * focused input above the keyboard, and can leave it there: the whole UI
 * shifted up by about the notch height, a gap at the bottom, and the status
 * bar drawn over the instrument ribbon. iOS may scroll the window *or* the
 * html / body / #root elements (even with overflow: hidden), so reset all of
 * them, on every event that can leave it shifted, and snap back immediately
 * if any of them is ever scrolled.
 */
export function resetDocumentScroll() {
  const root = document.getElementById('root')
  if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0)
  for (const el of [document.scrollingElement, document.documentElement, document.body, root]) {
    if (el && (el.scrollTop !== 0 || el.scrollLeft !== 0)) { el.scrollTop = 0; el.scrollLeft = 0 }
  }
}

export function useIOSScrollReset() {
  useEffect(() => {
    const reset = () => resetDocumentScroll()
    // Twice: once now, once after iOS finishes its keyboard / rotation animation
    const resetSoon = () => { setTimeout(reset, 50); setTimeout(reset, 400) }
    const root = document.getElementById('root')
    // A scroll of the page itself (never an inner panel) is always iOS's doing
    const onScroll = (e: Event) => {
      const t = e.target
      if (t === document || t === document.documentElement || t === document.body || t === root) reset()
    }
    const onVisible = () => { if (document.visibilityState === 'visible') resetSoon() }

    window.addEventListener('focusout', resetSoon)
    window.addEventListener('orientationchange', resetSoon)
    window.addEventListener('resize', resetSoon)
    window.addEventListener('pageshow', resetSoon)
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    document.addEventListener('visibilitychange', onVisible)
    window.visualViewport?.addEventListener('resize', resetSoon)
    reset()
    return () => {
      window.removeEventListener('focusout', resetSoon)
      window.removeEventListener('orientationchange', resetSoon)
      window.removeEventListener('resize', resetSoon)
      window.removeEventListener('pageshow', resetSoon)
      window.removeEventListener('scroll', onScroll, { capture: true })
      document.removeEventListener('visibilitychange', onVisible)
      window.visualViewport?.removeEventListener('resize', resetSoon)
    }
  }, [])
}
