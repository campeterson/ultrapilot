import { useEffect, useRef } from 'react'
import { useGPSStore } from '../../state/gps-store'
import { useSessionStore } from '../../state/session-store'
import { useInstrumentStore } from '../../state/instrument-store'
import { useDirectToStore } from '../../state/direct-to-store'
import { useRouteStore } from '../../state/route-store'
import { useMapSettingsStore } from '../../state/map-settings-store'
import { bulkAddTrackPoints } from '../../data/db'
import { verticalSpeedFpm, msToKnots } from '../../data/logic/gps-logic'
import { deriveInstruments } from '../../data/logic/instrument-logic'
import type { GPSPosition } from '../../data/models'

const TRACK_INTERVAL_MS = 5_000
const BUFFER_FLUSH_INTERVAL_MS = 30_000

export function useGPS() {
  const watchRef = useRef<number | null>(null)
  const flushTimerRef = useRef<number | null>(null)

  const { setPosition, setStatus } = useGPSStore()
  const { pushTrackPoint, clearTrackBuffer } = useSessionStore()
  const { setValues, updateMaxAGL } = useInstrumentStore()

  const lastTrackTs = useRef<number>(0)

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('unavailable')
      return
    }

    setStatus('waiting')

    watchRef.current = navigator.geolocation.watchPosition(
      (geoPos) => {
        const pos: GPSPosition = {
          lat: geoPos.coords.latitude,
          lon: geoPos.coords.longitude,
          altMSL: geoPos.coords.altitude ?? 0,
          speed: geoPos.coords.speed ?? 0,
          heading: geoPos.coords.heading ?? 0,
          accuracy: geoPos.coords.accuracy,
          ts: geoPos.timestamp,
        }

        setPosition(pos)

        // Always read session state fresh — avoid stale closure
        const { session: currentSession, sessionStatus: currentStatus } = useSessionStore.getState()

        // Update instruments if session is active
        if (currentSession && currentStatus === 'active') {
          const recent = useGPSStore.getState().recentPositions
          const vsFpm = verticalSpeedFpm(
            recent.map(p => ({ altMSL: p.altMSL, ts: p.ts }))
          )

          const instStore = useInstrumentStore.getState()
          const { maxAGLft } = instStore
          if (!currentSession) return

          // Push rolling samples BEFORE deriving so wind/avgs reflect this tick
          instStore.updateRolling(msToKnots(pos.speed), vsFpm, pos.heading)
          const rolling = useInstrumentStore.getState().getRollingStats()

          const { target: directTo } = useDirectToStore.getState()
          const values = deriveInstruments(
            { lat: pos.lat, lon: pos.lon, altMSL: pos.altMSL, speed: pos.speed, heading: pos.heading, ts: pos.ts },
            currentSession.originLat,
            currentSession.originLon,
            currentSession.originAltMSL,
            vsFpm,
            new Date(currentSession.startTime).getTime(),
            null,  // flight timer managed separately
            maxAGLft,
            rolling,
            directTo,
          )
          setValues(values)
          updateMaxAGL(values.agl)

          // Auto-advance route leg when close enough to current waypoint
          useRouteStore.getState().checkAutoAdvance(values.dte, pos.lat, pos.lon)

          // Buffer track points at TRACK_INTERVAL_MS (if recording enabled)
          const { recordTrack } = useMapSettingsStore.getState()
          if (recordTrack && pos.ts - lastTrackTs.current >= TRACK_INTERVAL_MS) {
            pushTrackPoint({
              ts: pos.ts,
              lat: pos.lat,
              lon: pos.lon,
              altMSL: pos.altMSL,
              speed: pos.speed,
              heading: pos.heading,
              accuracy: pos.accuracy,
            })
            lastTrackTs.current = pos.ts
          }
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied', 'GPS permission denied')
        } else {
          setStatus('error', err.message)
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10_000,
      }
    )

    // Periodic DB flush
    flushTimerRef.current = window.setInterval(async () => {
      const buf = clearTrackBuffer()
      if (buf.length > 0) {
        await bulkAddTrackPoints(buf)
      }
    }, BUFFER_FLUSH_INTERVAL_MS)

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current)
      }
      if (flushTimerRef.current !== null) {
        clearInterval(flushTimerRef.current)
      }
    }
  }, []) // Only mount/unmount — stores are accessed via getState() inside handlers
}
