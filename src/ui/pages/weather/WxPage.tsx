import { useEffect } from 'react'
import { useWeatherStore } from '../../../state/weather-store'
import { useAirportStore } from '../../../state/airport-store'
import { useGPSStore } from '../../../state/gps-store'
import { theme } from '../../theme'
import { useState } from 'react'

function MetarCard() {
  const { metar, fetchedAt, fetching, error, stationId, fetchByStation } = useWeatherStore()
  const [input, setInput] = useState(stationId)

  const ageMin = fetchedAt ? Math.round((Date.now() - fetchedAt) / 60_000) : null

  return (
    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.colors.darkBorder}` }}>
      <div style={{ marginBottom: '10px', display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          placeholder="ICAO (e.g. KJEF)"
          maxLength={4}
          style={{
            flex: 1, padding: '10px 12px',
            background: theme.colors.dark, border: `1px solid ${theme.colors.darkBorder}`,
            borderRadius: '8px', color: theme.colors.cream, fontFamily: theme.font.mono,
            fontSize: theme.size.body, letterSpacing: '0.1em',
          }}
        />
        <button
          onClick={() => input && fetchByStation(input)}
          disabled={fetching || !input}
          style={{
            padding: '10px 16px', borderRadius: '8px', border: 'none',
            background: theme.colors.red, color: '#fff', cursor: 'pointer',
            fontFamily: theme.font.primary, fontSize: theme.size.body,
            minHeight: theme.tapTarget, opacity: fetching ? 0.6 : 1,
          }}
        >
          {fetching ? '…' : 'Get'}
        </button>
      </div>

      {error && (
        <div style={{ color: theme.colors.amber, fontSize: theme.size.small, marginBottom: '8px' }}>
          {error}
        </div>
      )}

      {metar && (
        <div style={{ background: theme.colors.darkCard, borderRadius: '8px', padding: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '16px', fontWeight: 700, color: theme.colors.cream, fontFamily: theme.font.mono }}>
              {metar.stationId}
            </span>
            <span style={{ fontSize: theme.size.small, fontWeight: 700, color: metar.categoryColor, padding: '2px 8px', borderRadius: '4px', background: `${metar.categoryColor}22` }}>
              {metar.category}
            </span>
          </div>

          <div style={{ fontFamily: theme.font.mono, fontSize: '11px', color: theme.colors.dim, marginBottom: '10px', wordBreak: 'break-all', lineHeight: 1.6 }}>
            {metar.raw}
          </div>

          {[
            { label: 'Wind', value: metar.wind },
            { label: 'Visibility', value: metar.visibility },
            { label: 'Ceiling', value: metar.ceiling },
            { label: 'Temp/Dew', value: metar.tempDewpoint },
            { label: 'Altimeter', value: metar.altimeter },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${theme.colors.darkBorder}` }}>
              <span style={{ fontSize: theme.size.small, color: theme.colors.dim }}>{row.label}</span>
              <span style={{ fontSize: theme.size.small, color: theme.colors.light, fontFamily: theme.font.mono }}>{row.value}</span>
            </div>
          ))}

          {ageMin !== null && (
            <div style={{ marginTop: '8px', fontSize: theme.size.tiny, color: theme.colors.dim, textAlign: 'right' }}>
              Fetched {ageMin}m ago
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NearbyAirports() {
  const { nearby, loadDatabase, refreshNearby, loading } = useAirportStore()
  const { position } = useGPSStore()

  // Auto-load on mount
  useEffect(() => {
    const pos = useGPSStore.getState().position
    loadDatabase().then(() => {
      if (pos) refreshNearby(pos.lat, pos.lon)
    })
  }, [loadDatabase, refreshNearby])

  // Re-refresh when position changes
  useEffect(() => {
    if (!position) return
    const { loaded } = useAirportStore.getState()
    if (loaded) refreshNearby(position.lat, position.lon)
  }, [position, refreshNearby])

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontSize: theme.size.small, color: theme.colors.dim, letterSpacing: '0.06em' }}>NEARBY AIRPORTS</span>
        {loading && <span style={{ fontSize: theme.size.tiny, color: theme.colors.dim }}>Loading…</span>}
      </div>

      {!loading && nearby.length === 0 && (
        <div style={{ color: theme.colors.dim, fontSize: theme.size.body, textAlign: 'center', padding: '16px 0' }}>
          {position ? 'No airports found nearby' : 'Waiting for GPS…'}
        </div>
      )}

      {nearby.map(ap => (
        <div
          key={ap.id}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 0', borderBottom: `1px solid ${theme.colors.darkBorder}`,
            minHeight: theme.tapTarget, gap: '8px',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div>
              <span style={{ fontSize: theme.size.body, fontWeight: 700, color: theme.colors.cyan, fontFamily: theme.font.mono }}>{ap.id}</span>
              <span style={{ fontSize: theme.size.small, color: theme.colors.dim, marginLeft: '8px' }}>{ap.name}</span>
            </div>
            <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, fontFamily: theme.font.mono, marginTop: '2px' }}>
              {ap.distNM.toFixed(1)} nm · {ap.bearingLabel}
            </div>
          </div>
          <button
            onClick={() => useWeatherStore.getState().fetchByStation(ap.id)}
            style={{
              padding: '6px 12px', borderRadius: '6px', border: `1px solid ${theme.colors.darkBorder}`,
              background: theme.colors.darkCard, color: theme.colors.cream, cursor: 'pointer',
              fontFamily: theme.font.mono, fontSize: theme.size.small,
              minHeight: theme.tapTarget, flexShrink: 0, letterSpacing: '0.05em',
            }}
          >
            METAR
          </button>
        </div>
      ))}
    </div>
  )
}

export function WxPage() {
  return (
    <div style={{ height: '100%', overflowY: 'auto', background: theme.colors.dark, fontFamily: theme.font.primary }}>
      <MetarCard />
      <NearbyAirports />
    </div>
  )
}
