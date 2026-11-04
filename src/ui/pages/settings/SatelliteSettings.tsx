import { theme } from '../../theme'
import { useBasemapStore } from '../../../state/basemap-store'
import { SATELLITE_PROVIDERS } from '../../../data/logic/basemap-logic'

/** Satellite imagery provider + optional API key. */
export function SatelliteSettings() {
  const { provider, keys, setProvider, setKey } = useBasemapStore()
  const info = SATELLITE_PROVIDERS.find(p => p.id === provider)!
  return (
    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${theme.colors.darkBorder}` }}>
      <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', outline: `1px solid ${theme.colors.darkBorder}` }}>
        {SATELLITE_PROVIDERS.map(p => (
          <button key={p.id} onClick={() => setProvider(p.id)}
            style={{ flex: 1, minHeight: theme.tapTarget, border: 'none', cursor: 'pointer', fontFamily: theme.font.primary, fontSize: theme.size.small,
              background: p.id === provider ? theme.colors.red : theme.colors.darkCard, color: p.id === provider ? '#fff' : theme.colors.light }}>
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: theme.size.small, color: theme.colors.dim, marginTop: '8px' }}>{info.note}</div>
      {info.needsKey && provider !== 'usgs' && (
        <input
          value={keys[provider]}
          onChange={e => setKey(provider, e.target.value)}
          placeholder={`${info.label} API key`}
          autoComplete="off" spellCheck={false}
          style={{ width: '100%', boxSizing: 'border-box', marginTop: '8px', minHeight: theme.tapTarget, padding: '10px 12px', borderRadius: '8px',
            border: `1px solid ${keys[provider].trim() ? theme.colors.darkBorder : theme.colors.amber}`, background: 'rgba(255,255,255,0.05)',
            color: theme.colors.cream, fontFamily: theme.font.mono, fontSize: theme.size.small }}
        />
      )}
      <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, marginTop: '8px', lineHeight: 1.4 }}>
        Turn satellite on per map with the 🛰 button. Imagery you view is cached for offline use at the field.
      </div>
    </div>
  )
}
