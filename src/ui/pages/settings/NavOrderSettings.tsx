import { theme } from '../../theme'
import { useNavStore } from '../../../state/nav-store'
import { useFlightModeStore } from '../../../state/flight-mode-store'
import { NAV_BAR_COUNT, isAvailable, sectionInfo } from '../../../data/logic/nav-logic'

const arrowBtn = (disabled: boolean): React.CSSProperties => ({
  width: theme.tapTarget, height: theme.tapTarget, borderRadius: '8px', flexShrink: 0,
  border: `1px solid ${theme.colors.darkBorder}`, background: 'none',
  color: disabled ? theme.colors.darkBorder : theme.colors.light, cursor: disabled ? 'default' : 'pointer',
  fontSize: theme.size.body, fontFamily: theme.font.primary,
})

/** Reorder the bottom bar: Map is always first, then the first four sections; the rest go in More. */
export function NavOrderSettings() {
  const { order, move, reset } = useNavStore()
  const mode = useFlightModeStore(s => s.mode)
  const list = order.filter(id => isAvailable(id, mode))

  return (
    <div style={{ padding: '10px 16px 14px', borderBottom: `1px solid ${theme.colors.darkBorder}` }}>
      <div style={{ fontSize: theme.size.small, color: theme.colors.dim, lineHeight: 1.4, marginBottom: '8px' }}>
        Map is always first. The next {NAV_BAR_COUNT} are on the bar; the rest are under More.
      </div>
      {list.map((id, i) => {
        const s = sectionInfo(id)
        const onBar = i < NAV_BAR_COUNT
        return (
          <div key={id}>
            {i === NAV_BAR_COUNT && (
              <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, letterSpacing: '0.08em', padding: '10px 0 4px', borderTop: `1px dashed ${theme.colors.darkBorder}`, marginTop: '4px' }}>
                IN MORE ⋯
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0' }}>
              <span style={{ width: '24px', textAlign: 'center', fontSize: '18px', color: onBar ? theme.colors.cream : theme.colors.dim }}>{s.icon}</span>
              <span style={{ flex: 1, fontSize: theme.size.body, color: onBar ? theme.colors.cream : theme.colors.light }}>{s.title}</span>
              {onBar && <span style={{ fontSize: theme.size.tiny, color: theme.colors.red, letterSpacing: '0.06em' }}>BAR</span>}
              <button onClick={() => move(id, -1, mode)} disabled={i === 0} aria-label={`Move ${s.title} up`} style={arrowBtn(i === 0)}>▲</button>
              <button onClick={() => move(id, 1, mode)} disabled={i === list.length - 1} aria-label={`Move ${s.title} down`} style={arrowBtn(i === list.length - 1)}>▼</button>
            </div>
          </div>
        )
      })}
      <button onClick={reset}
        style={{ marginTop: '10px', width: '100%', minHeight: theme.tapTarget, borderRadius: '8px', border: `1px solid ${theme.colors.darkBorder}`, background: 'none', color: theme.colors.dim, cursor: 'pointer', fontFamily: theme.font.primary, fontSize: theme.size.small }}>
        Reset to default order
      </button>
    </div>
  )
}
