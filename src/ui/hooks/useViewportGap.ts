import { useEffect } from 'react'
import { viewportGap } from '../../data/logic/viewport-logic'
import { isIOS } from '../../data/logic/keep-awake-logic'

let lastGap = 0
/** The current gap in px (for the Settings readout). */
export function currentViewportGap(): number { return lastGap }

/** Measure where iOS thinks the bottom of the screen is and set --vp-gap. */
export function measureViewportGap(): number {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;bottom:0;left:0;width:0;visibility:hidden;pointer-events:none;'
  document.body.appendChild(probe)
  const probeH = probe.getBoundingClientRect().height
  probe.remove()
  lastGap = viewportGap({
    isIOS: isIOS(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    standalone: window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    screenW: screen.width, screenH: screen.height,
    innerW: window.innerWidth, innerH: window.innerHeight,
    probeH,
  })
  document.documentElement.style.setProperty('--vp-gap', `${lastGap}px`)
  return lastGap
}

/** Keep --vp-gap current: on start (and again after iOS settles), resize,
 *  rotation, and returning to the app. */
export function useViewportGap() {
  useEffect(() => {
    const m = () => { measureViewportGap() }
    const soon = () => { m(); setTimeout(m, 500) }
    const onVis = () => { if (document.visibilityState === 'visible') soon() }
    soon()
    window.addEventListener('resize', soon)
    window.addEventListener('orientationchange', soon)
    window.addEventListener('pageshow', soon)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('resize', soon)
      window.removeEventListener('orientationchange', soon)
      window.removeEventListener('pageshow', soon)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
}
