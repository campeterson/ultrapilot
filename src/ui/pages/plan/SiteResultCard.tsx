import { theme } from '../../theme'
import { useUnits } from '../../hooks/useUnits'
import { planHasNoData, type SitePlan } from '../../../data/logic/plan-logic'
import { modelLabel } from '../../../data/logic/forecast-logic'
import { altitudeText, formatAltitude, speedText, distanceText } from '../../../data/logic/units-logic'
import { compassPoint, formatDeg } from '../../../data/logic/gps-logic'
import { sectionStyle, driftColor, siteColor } from './plan-styles'
import { ZONE_COLORS } from '../map/place-layers'
import { zoneRatingLabel } from '../../../data/logic/zone-logic'

const cell: React.CSSProperties = { padding: '6px 4px', fontFamily: theme.font.mono, fontSize: theme.size.small, color: theme.colors.cream, verticalAlign: 'top' }
const head: React.CSSProperties = { ...cell, color: theme.colors.dim, fontFamily: theme.font.primary, fontSize: theme.size.tiny, textAlign: 'left' }
const tile: React.CSSProperties = { flex: '1 1 40%', border: `1px solid ${theme.colors.darkBorder}`, borderRadius: '8px', padding: '6px 10px' }

function Stat({ label, value, color, wide }: { label: string; value: string; color?: string; wide?: boolean }) {
  return (
    <div style={wide ? { ...tile, flex: '1 1 100%' } : tile}>
      <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: theme.size.body, color: color ?? theme.colors.cream, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

/** One site: cruise-altitude drift stats, then wind + drift at every altitude. */
export function SiteResultCard({ plan, number, cruiseIndex, compare, model, hasZones }: { plan: SitePlan; number: number; cruiseIndex: number; compare: boolean; model: string; hasZones: boolean }) {
  const units = useUnits()
  const h = plan.hour
  const cruise = plan.levels.find(l => l.index === cruiseIndex)
  const noData = planHasNoData(plan)
  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: siteColor(number - 1), color: '#fff', fontWeight: 700, fontSize: theme.size.small, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{number}</span>
        <span style={{ color: theme.colors.cream, fontWeight: 700, fontSize: theme.size.body }}>{plan.site.name}</span>
        <span style={{ color: theme.colors.dim, fontSize: theme.size.tiny, marginLeft: 'auto' }}>ground {altitudeText(plan.groundFt, units.altitude)}</span>
      </div>
      {noData && (
        <div style={{ color: theme.colors.amber, fontSize: theme.size.small, marginTop: '6px' }}>
          No {modelLabel(model)} data for this time — it may be past the model’s horizon. Try GFS or Best match.
        </div>
      )}
      {h && !noData && (
        <div style={{ color: theme.colors.light, fontSize: theme.size.small, marginTop: '4px' }}>
          Surface {h.surfaceDirFrom != null && h.surfaceSpeedKt != null ? `${formatDeg(h.surfaceDirFrom)} @ ${speedText(h.surfaceSpeedKt, units.speed)}` : '—'}
          {h.gustKt != null && ` · gust ${speedText(h.gustKt, units.speed)}`}
          {h.precipProb != null && ` · precip ${Math.round(h.precipProb)}%`}
        </div>
      )}
      {cruise?.track && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
          <Stat label="TRACK LENGTH" value={distanceText(cruise.track.trackNM, units.distance)} />
          <Stat label="CROW LINE" value={distanceText(cruise.track.distNM, units.distance)} />
          <Stat label="BEARING" value={`${formatDeg(cruise.track.bearingDeg)} ${compassPoint(cruise.track.bearingDeg)}`} />
          <Stat label="CRUISE ALT" value={`${altitudeText(cruise.aglFt, units.altitude)} AGL`} />
          {hasZones && (
            <Stat wide label="ENDS IN" value={cruise.endZone ? `${cruise.endZone.name} · ${zoneRatingLabel(cruise.endZone.rating)}` : 'No zone'}
              color={cruise.endZone ? ZONE_COLORS[cruise.endZone.rating] : theme.colors.dim} />
          )}
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '8px' }}>
        <thead>
          <tr><th style={head}>AGL / MSL</th><th style={head}>Wind</th><th style={head}>Drift</th></tr>
        </thead>
        <tbody>
          {[...plan.levels].reverse().map(l => {
            const drawn = compare || l.index === cruiseIndex
            const stripe = drawn ? (compare ? driftColor(l.index) : siteColor(number - 1)) : 'transparent'
            return (
              <tr key={l.index} style={{ borderTop: `1px solid ${theme.colors.darkBorder}`, background: l.index === cruiseIndex ? 'rgba(255,255,255,0.04)' : 'none' }}>
                <td style={{ ...cell, borderLeft: `4px solid ${stripe}`, paddingLeft: '8px' }}>
                  {formatAltitude(l.aglFt, units.altitude)} / {formatAltitude(l.mslFt, units.altitude)}
                </td>
                {l.belowGround ? (
                  <td style={{ ...cell, color: theme.colors.dim }} colSpan={2}>below ground</td>
                ) : (
                  <>
                    <td style={cell}>{l.wind ? `${formatDeg(l.wind.dirFrom)} ${speedText(l.wind.speedKt, units.speed)}` : '—'}</td>
                    <td style={cell}>
                      {l.track ? `${formatDeg(l.track.bearingDeg)} ${compassPoint(l.track.bearingDeg)} · ${distanceText(l.track.distNM, units.distance)}` : '—'}
                      {l.endZone && <span title={l.endZone.name} style={{ color: ZONE_COLORS[l.endZone.rating] }}> ■</span>}
                    </td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
