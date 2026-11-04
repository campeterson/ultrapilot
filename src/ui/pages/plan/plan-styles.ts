import { theme } from '../../theme'

export const sectionStyle: React.CSSProperties = {
  background: theme.colors.darkCard,
  border: `1px solid ${theme.colors.darkBorder}`,
  borderRadius: '10px',
  padding: '12px',
  marginBottom: '12px',
}

export const sectionTitle: React.CSSProperties = {
  fontSize: theme.size.tiny,
  color: theme.colors.dim,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: '8px',
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: theme.tapTarget,
  padding: '10px 12px',
  borderRadius: '8px',
  border: `1px solid ${theme.colors.darkBorder}`,
  background: 'rgba(255,255,255,0.05)',
  color: theme.colors.cream,
  fontFamily: theme.font.primary,
  fontSize: theme.size.body,
  boxSizing: 'border-box',
  colorScheme: 'dark',
}

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: theme.size.tiny,
  color: theme.colors.dim,
  marginBottom: '4px',
}

export function buttonStyle(primary = false, disabled = false): React.CSSProperties {
  return {
    minHeight: theme.tapTarget,
    minWidth: theme.tapTarget,
    padding: '10px 14px',
    borderRadius: '8px',
    border: primary ? 'none' : `1px solid ${theme.colors.darkBorder}`,
    background: primary ? (disabled ? theme.colors.darkBorder : theme.colors.red) : 'none',
    color: primary ? '#fff' : theme.colors.light,
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: theme.font.primary,
    fontSize: theme.size.body,
    fontWeight: primary ? 700 : 400,
    opacity: disabled && !primary ? 0.5 : 1,
  }
}

/** Segmented-control chip. */
export function chipStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    minHeight: theme.tapTarget,
    minWidth: theme.tapTarget,
    padding: '6px 8px',
    borderRadius: '8px',
    border: `1px solid ${active ? theme.colors.red : theme.colors.darkBorder}`,
    background: active ? theme.colors.redDim : 'none',
    color: active ? theme.colors.cream : theme.colors.light,
    cursor: 'pointer',
    fontFamily: theme.font.primary,
    fontSize: theme.size.small,
  }
}

export function driftColor(index: number): string {
  const c = theme.colors.driftLevels
  return c[index % c.length]
}

export function siteColor(index: number): string {
  const c = theme.colors.planSites
  return c[index % c.length]
}
