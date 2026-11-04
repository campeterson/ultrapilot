import { useEffect, useMemo } from 'react'
import { theme } from '../../theme'
import { useOfflineImageryStore, tilesForSites } from '../../../state/offline-imagery-store'
import { usePlacesStore } from '../../../state/places-store'
import { useFlightPlanStore } from '../../../state/flight-plan-store'
import { useBasemapStore } from '../../../state/basemap-store'
import { AVG_SAT_TILE_BYTES, OFFLINE_RADIUS_OPTIONS_NM } from '../../../data/logic/tile-logic'
import { formatBytes } from '../../../data/logic/tileset-download'

const btn = (primary: boolean, disabled = false): React.CSSProperties => ({
  flex: 1, minHeight: theme.tapTarget, borderRadius: '8px', cursor: disabled ? 'default' : 'pointer',
  fontFamily: theme.font.primary, fontSize: theme.size.small, fontWeight: primary ? 700 : 400,
  border: primary ? 'none' : `1px solid ${theme.colors.darkBorder}`,
  background: primary ? (disabled ? theme.colors.darkBorder : theme.colors.red) : 'none',
  color: primary ? '#fff' : theme.colors.light, opacity: disabled && !primary ? 0.5 : 1,
})

/** Download satellite imagery around launch sites for offline flying, and confirm it's there. */
export function OfflineImagery() {
  const { radiusNM, setRadius, downloading, progress, message, coverage, checking, stats, download, cancel, checkCoverage, refreshStats, clear } = useOfflineImageryStore()
  const { launchSites: allSites, load } = usePlacesStore()
  const selected = useFlightPlanStore(s => s.selectedSiteIds)
  const provider = useBasemapStore(s => s.provider)

  useEffect(() => { load(); refreshStats() }, [load, refreshStats])

  // Chosen plan sites if any, otherwise every saved site
  const chosen = allSites.filter(s => selected.includes(s.id))
  const sites = chosen.length ? chosen : allSites
  const tileCount = useMemo(() => tilesForSites(sites, radiusNM).length, [sites, radiusNM, provider])
  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0
  const small: React.CSSProperties = { fontSize: theme.size.small, color: theme.colors.dim, marginTop: '8px', lineHeight: 1.4 }

  return (
    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.colors.darkBorder}` }}>
      <div style={{ fontSize: theme.size.body, color: theme.colors.light }}>Download for offline</div>
      <div style={small}>
        {sites.length === 0 ? 'Add launch sites first — imagery is downloaded around them.'
          : `Around ${chosen.length ? `your ${chosen.length} chosen` : `all ${sites.length} saved`} launch site${sites.length === 1 ? '' : 's'}: ${sites.map(s => s.name).join(', ')}`}
      </div>
      <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
        {OFFLINE_RADIUS_OPTIONS_NM.map(nm => (
          <button key={nm} onClick={() => setRadius(nm)} disabled={downloading}
            style={{ ...btn(false), border: `1px solid ${radiusNM === nm ? theme.colors.red : theme.colors.darkBorder}`, background: radiusNM === nm ? theme.colors.redDim : 'none' }}>
            {nm} nm radius
          </button>
        ))}
      </div>
      {sites.length > 0 && (
        <div style={small}>≈ {tileCount.toLocaleString()} tiles · ~{formatBytes(tileCount * AVG_SAT_TILE_BYTES)} (already-saved tiles are skipped)</div>
      )}

      {downloading && progress && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ height: '8px', borderRadius: '4px', background: theme.colors.darkCard, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: theme.colors.green }} />
          </div>
          <div style={small}>{progress.done.toLocaleString()} / {progress.total.toLocaleString()} ({pct}%) · {formatBytes(progress.bytes)} new{progress.failed ? ` · ${progress.failed} failed` : ''}</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        {downloading
          ? <button onClick={cancel} style={btn(false)}>Cancel</button>
          : <button onClick={() => download(sites)} disabled={sites.length === 0} style={btn(true, sites.length === 0)}>Download imagery</button>}
        <button onClick={() => checkCoverage(sites)} disabled={downloading || checking || sites.length === 0} style={btn(false, downloading || checking || sites.length === 0)}>
          {checking ? 'Checking…' : 'Check saved'}
        </button>
      </div>
      {message && <div style={{ ...small, color: theme.colors.light }}>{message}</div>}

      {coverage && (
        <div style={{ marginTop: '8px' }}>
          {coverage.map(c => {
            const full = c.cached >= c.total
            return (
              <div key={c.siteId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: theme.size.small, padding: '4px 0', color: full ? theme.colors.green : theme.colors.amber }}>
                <span>{full ? '✓' : '!'} {c.name}</span>
                <span style={{ fontFamily: theme.font.mono }}>{Math.floor((c.cached / Math.max(1, c.total)) * 100)}% ({c.cached}/{c.total})</span>
              </div>
            )
          })}
        </div>
      )}

      {stats && (
        <div style={small}>
          On this device: {stats.tiles.toLocaleString()} satellite tiles · app storage {formatBytes(stats.usage)}
          {stats.quota ? ` of ${formatBytes(stats.quota)}` : ''} · {stats.persisted ? 'protected from automatic clearing' : 'may be cleared by the browser if storage runs low'}
        </div>
      )}
      <div style={small}>
        On iPad/iPhone, use UltraPilot from the Home Screen (Share → Add to Home Screen). In a Safari tab, saved data can be cleared after 7 days without a visit.
      </div>
      {stats && stats.tiles > 0 && !downloading && (
        <button onClick={clear} style={{ ...btn(false), width: '100%', marginTop: '8px', color: theme.colors.dim }}>Clear saved imagery</button>
      )}
    </div>
  )
}
