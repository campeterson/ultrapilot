// iOS 26 Home Screen apps with a translucent status bar (black-translucent +
// viewport-fit=cover) lay out fixed elements in a box that stops short of the
// screen bottom by about the status-bar height (47 pt on iPhone 12 Pro, 59 pt
// with a Dynamic Island) — a dark strip under the nav bar. A probe pinned
// top:0 / bottom:0 shows where iOS thinks the bottom is; the real screen
// height is known in a Home Screen app. Their difference is the gap. Pure.

export interface ViewportSample {
  isIOS: boolean
  standalone: boolean
  /** screen.width / screen.height — on iOS always the portrait values. */
  screenW: number
  screenH: number
  /** window.innerWidth / innerHeight — tells portrait from landscape. */
  innerW: number
  innerH: number
  /** Height of a position: fixed; top: 0; bottom: 0 element. */
  probeH: number
}

/** Largest gap treated as this bug; anything bigger is something else — leave it. */
export const MAX_VIEWPORT_GAP = 80

/** Pixels to extend bottom-anchored layers by (0 when there's no bug). */
export function viewportGap(s: ViewportSample): number {
  // Only iOS Home Screen apps: a browser tab's screen size includes Safari's
  // own toolbars, and Android's includes its navigation bar
  if (!s.isIOS || !s.standalone || s.probeH <= 0) return 0
  const landscape = s.innerW > s.innerH
  const realH = landscape ? Math.min(s.screenW, s.screenH) : Math.max(s.screenW, s.screenH)
  const gap = Math.round(realH - s.probeH)
  return gap > 0 && gap <= MAX_VIEWPORT_GAP ? gap : 0
}
