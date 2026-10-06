import { theme } from '../../theme'
import { useWindreaderStore } from '../../../state/windreader-store'
import { useSessionStore } from '../../../state/session-store'
import { useWindBands } from '../../hooks/useWindBands'
import { WindreaderTable, RELATION_COLORS } from './WindreaderTable'
import { useUnits } from '../../hooks/useUnits'
import { altitudeText } from '../../../data/logic/units-logic'
import { bandSizeLabel } from '../../../data/logic/windreader-logic'

export function WindreaderPage() {
  const { bands, currentAltFt } = useWindBands()
  const { bandStep, clear } = useWindreaderStore()
  const units = useUnits()
  const { session } = useSessionStore()

  function handleClear() {
    if (confirm('Clear all wind readings for this flight?')) clear()
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.colors.dark, fontFamily: theme.font.primary }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', borderBottom: `1px solid ${theme.colors.darkBorder}`,
      }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: theme.colors.cream, letterSpacing: '0.04em' }}>WINDREADER</div>
          <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, marginTop: '2px' }}>
            {currentAltFt !== null ? `You: ${altitudeText(currentAltFt, units.altitude)} MSL · ` : ''}{bandSizeLabel(bandStep, units.altitude)} bands
          </div>
        </div>
        <button
          onClick={handleClear}
          disabled={bands.length === 0}
          style={{
            padding: '8px 16px', borderRadius: '6px', border: `1px solid ${theme.colors.darkBorder}`,
            background: theme.colors.darkCard, color: bands.length ? theme.colors.cream : theme.colors.dim,
            cursor: bands.length ? 'pointer' : 'default', fontFamily: theme.font.primary,
            fontSize: theme.size.small, minHeight: theme.tapTarget,
          }}
        >
          Clear
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {bands.length === 0 ? (
          <div style={{ padding: '32px 20px', color: theme.colors.dim, fontSize: theme.size.body, lineHeight: 1.6, textAlign: 'center' }}>
            {session
              ? 'No readings yet. A band fills in once you hold its altitude with steady drift for about 15 seconds.'
              : 'Start a session to begin reading winds.'}
          </div>
        ) : (
          <WindreaderTable bands={bands} />
        )}

        <div style={{ padding: '16px', fontSize: theme.size.small, color: theme.colors.dim, lineHeight: 1.6 }}>
          <div style={{ display: 'flex', gap: '14px', marginBottom: '10px' }}>
            <span style={{ color: RELATION_COLORS.above }}>■ above you</span>
            <span style={{ color: RELATION_COLORS.current }}>■ your level</span>
            <span style={{ color: RELATION_COLORS.below }}>■ below you</span>
          </div>
          TRK is the direction you drift <em>toward</em> (true). A reading is only taken
          after you've held a level (within {units.altitude === 'm' ? '15 m' : '50 ft'}) with steady drift for about 15 seconds,
          then every 5 seconds while you stay. Each row is the vector average of the last
          20 readings in that band. "min" is how long since
          that band was last sampled; older rows may no longer be accurate.
        </div>
      </div>
    </div>
  )
}
