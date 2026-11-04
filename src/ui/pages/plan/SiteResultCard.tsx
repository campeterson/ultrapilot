import { theme } from '../../theme'
import { useUnits } from '../../hooks/useUnits'
import type { SitePlan } from '../../../data/logic/plan-logic'
import { altitudeText, formatAltitude, speedText, distanceText } from '../../../data/logic/units-logic'
import { formatDeg } from '../../../data/logic/gps-logic'
import { sectionStyle, driftColor } from './plan-styles'

const cell: React.CSSProperties = { padding: '6px 4px', fontFamily: theme.font.mono, fontSize: theme.size.small, color: theme.colors.cream }
const head: React.CSSProperties = { ...cell, color: theme.colors.dim, fontFamily: theme.font.primary, fontSize: theme.size.tiny, textAlign: 'left' }

/** One site's winds at the plan altitudes and where each drift ends up. */
export function SiteResultCard({ plan, number }: { plan: SitePlan; number: number }) {
  const units = useUnits()
  const h = plan.hour
  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <span style={{ color: theme.colors.launchSite, fontWeight: 700 }}>{number}</span>
        <span style={{ color: theme.colors.cream, fontWeight: 700, fontSize: theme.size.body }}>{plan.site.name}</span>
        <span style={{ color: theme.colors.dim, fontSize: theme.size.tiny, marginLeft: 'auto' }}>ground {altitudeText(plan.groundFt, units.altitude)}</span>
      </div>
      {h && (
        <div style={{ color: theme.colors.light, fontSize: theme.size.small, marginTop: '4px' }}>
          Surface {h.surfaceDirFrom != null && h.surfaceSpeedKt != null ? `${formatDeg(h.surfaceDirFrom)} @ ${speedText(h.surfaceSpeedKt, units.speed)}` : '—'}
          {h.gustKt != null && ` · gust ${speedText(h.gustKt, units.speed)}`}
          {h.precipProb != null && ` · precip ${Math.round(h.precipProb)}%`}
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '6px' }}>
        <thead>
          <tr>
            <th style={head}>Alt AGL / MSL</th>
            <th style={head}>Wind</th>
            <th style={head}>Drift → end</th>
          </tr>
        </thead>
        <tbody>
          {[...plan.levels].reverse().map(l => (
            <tr key={l.index} style={{ borderTop: `1px solid ${theme.colors.darkBorder}` }}>
              <td style={{ ...cell, borderLeft: `4px solid ${driftColor(l.index)}`, paddingLeft: '8px' }}>
                {formatAltitude(l.aglFt, units.altitude)} / {formatAltitude(l.mslFt, units.altitude)}
              </td>
              {l.belowGround ? (
                <td style={{ ...cell, color: theme.colors.dim }} colSpan={2}>below ground</td>
              ) : (
                <>
                  <td style={cell}>{l.wind ? `${formatDeg(l.wind.dirFrom)} ${speedText(l.wind.speedKt, units.speed)}` : '—'}</td>
                  <td style={cell}>
                    {l.track ? `${formatDeg(l.track.bearingDeg)} ${distanceText(l.track.distNM, units.distance)}` : '—'}
                    {l.track && l.track.minutes > 0 && <span style={{ color: theme.colors.dim }}> /{l.track.minutes}m</span>}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
