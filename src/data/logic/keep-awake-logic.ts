// When the app keeps the screen awake, and how. Pure.

/** Keep the screen on during a session, while sharing, or while in a Live Group. */
export function shouldKeepAwake(s: { sessionActive: boolean; liveSharing: boolean; inLiveGroup: boolean }): boolean {
  return s.sessionActive || s.liveSharing || s.inLiveGroup
}

/** iOS / iPadOS version from a user agent ("OS 17_5" or, on iPad, "Version/17.5"), or null. */
export function iosVersion(ua: string): number | null {
  const m = ua.match(/OS (\d+)_(\d+)/) ?? ua.match(/Version\/(\d+)\.(\d+)/)
  return m ? Number(m[1]) + Number(m[2]) / 100 : null
}

export function isIOS(ua: string, maxTouchPoints: number): boolean {
  // iPadOS reports a Mac user agent; a touch screen gives it away
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)
}

/**
 * Also play the silent video? Yes when there's no Wake Lock API, or in an iOS
 * Home Screen app before 18.4 — there the request succeeds but the screen
 * still sleeps (WebKit bug, fixed in iOS 18.4) — or when the version is unknown.
 */
export function needsVideoFallback(p: { ua: string; maxTouchPoints: number; standalone: boolean; hasWakeLock: boolean }): boolean {
  if (!p.hasWakeLock) return true
  if (!isIOS(p.ua, p.maxTouchPoints) || !p.standalone) return false
  const v = iosVersion(p.ua)
  return v == null || v < 18.04
}
