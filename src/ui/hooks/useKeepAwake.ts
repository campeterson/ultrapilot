import { useCallback, useEffect, useRef, useState } from 'react'
import { needsVideoFallback } from '../../data/logic/keep-awake-logic'
import { KEEP_AWAKE_MP4, KEEP_AWAKE_WEBM } from './keep-awake-media'

/** 'off' = not needed; 'awake' = held; 'needs-tap' = the browser refused until the user touches the screen. */
export type KeepAwakeState = 'off' | 'awake' | 'needs-tap'

const RECHECK_MS = 10_000

/**
 * Keep the screen on while `active`.
 *
 * - Screen Wake Lock API, re-requested whenever it's lost: the system can drop
 *   it at any time (calls, notifications, power saving), and it always drops
 *   when the page is hidden. Re-checked on visibility, focus, page show, any
 *   touch, and every 10 s.
 * - Silent looping video as a fallback where the API is missing or doesn't
 *   hold (iOS Home Screen apps before 18.4), or after the API refuses.
 * - If both are refused (e.g. playback needs a touch first), reports
 *   'needs-tap'; the next touch anywhere retries with a user gesture.
 */
export function useKeepAwake(active: boolean): { state: KeepAwakeState; retry: () => void } {
  const [state, setState] = useState<KeepAwakeState>('off')
  const lock = useRef<WakeLockSentinel | null>(null)
  const video = useRef<HTMLVideoElement | null>(null)
  const videoPlaying = useRef(false)
  const lockFailed = useRef(false)
  const activeRef = useRef(active)
  activeRef.current = active

  const wantVideo = () => lockFailed.current || needsVideoFallback({
    ua: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone: window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    hasWakeLock: 'wakeLock' in navigator,
  })

  const update = useCallback(() => {
    if (!activeRef.current) { setState('off'); return }
    const lockHeld = !!lock.current && !lock.current.released
    const held = wantVideo() ? videoPlaying.current : lockHeld
    setState(held ? 'awake' : 'needs-tap')
  }, [])

  const startVideo = useCallback(async () => {
    if (!video.current) {
      const v = document.createElement('video')
      v.setAttribute('playsinline', '')
      v.setAttribute('muted', '')
      v.setAttribute('aria-hidden', 'true')
      v.muted = true
      v.loop = true
      v.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;pointer-events:none;'
      for (const [src, type] of [[KEEP_AWAKE_WEBM, 'video/webm'], [KEEP_AWAKE_MP4, 'video/mp4']]) {
        const s = document.createElement('source'); s.src = src; s.type = type; v.appendChild(s)
      }
      v.addEventListener('pause', () => { videoPlaying.current = false; update() })
      v.addEventListener('playing', () => { videoPlaying.current = true; update() })
      document.body.appendChild(v)
      video.current = v
    }
    if (!video.current.paused) return
    try { await video.current.play(); videoPlaying.current = true } catch { videoPlaying.current = false }
  }, [update])

  const ensure = useCallback(async () => {
    if (!activeRef.current || document.visibilityState !== 'visible') { update(); return }
    if ('wakeLock' in navigator && (!lock.current || lock.current.released)) {
      try {
        const l = await navigator.wakeLock.request('screen')
        lockFailed.current = false
        lock.current = l
        // Dropped by the system → take it back while still wanted
        l.addEventListener('release', () => { update(); if (activeRef.current) setTimeout(() => void ensure(), 1000) })
      } catch {
        lockFailed.current = true
      }
    }
    if (wantVideo()) await startVideo()
    update()
  }, [startVideo, update])

  useEffect(() => {
    if (!active) {
      lock.current?.release().catch(() => {})
      lock.current = null
      if (video.current) { video.current.pause(); video.current.remove(); video.current = null }
      videoPlaying.current = false
      setState('off')
      return
    }
    void ensure()
    const again = () => void ensure()
    const onVis = () => { if (document.visibilityState === 'visible') again() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pageshow', again)
    window.addEventListener('focus', again)
    // A touch is a user gesture: lets playback start and the lock be retried
    document.addEventListener('pointerdown', again, { capture: true, passive: true })
    const t = setInterval(again, RECHECK_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pageshow', again)
      window.removeEventListener('focus', again)
      document.removeEventListener('pointerdown', again, { capture: true })
      clearInterval(t)
    }
  }, [active, ensure])

  // Release everything on unmount
  useEffect(() => () => {
    lock.current?.release().catch(() => {})
    video.current?.remove()
  }, [])

  return { state, retry: () => void ensure() }
}
