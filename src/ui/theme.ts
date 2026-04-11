export const theme = {
  colors: {
    red: '#C0392B',
    redDim: 'rgba(192, 57, 43, 0.18)',
    cream: '#FDF6E3',
    dark: '#141418',
    darkCard: '#1e1e24',
    darkBorder: 'rgba(255, 255, 255, 0.10)',
    dim: '#8899aa',       // secondary labels — was #667788
    light: '#d8e4ec',     // primary UI text — was #ccd
    green: '#27ae60',
    amber: '#e67e22',
    blue: '#3498db',
    cyan: '#00acc1',
    purple: '#8e44ad',
    magenta: '#e040fb',
    navBg: '#0c0c12',
    stripBg: 'rgba(14, 14, 20, 0.96)',
  },
  font: {
    primary: '"B612", monospace',
    mono: '"B612 Mono", monospace',
  },
  size: {
    instrumentValue: '22px',  // was 18px
    instrumentLabel: '11px',  // was 9px
    heroValue: '42px',        // was 36px
    body: '15px',             // was 13px
    small: '13px',            // was 11px
    tiny: '11px',             // was 9px
  },
  tapTarget: '44px',
  navHeight: '60px',
  stripHeight: '58px',        // was 52px
  // Safe-area-aware heights for use in inline styles
  safeNavHeight: 'calc(60px + env(safe-area-inset-bottom, 0px))',
  safeStripHeight: 'calc(58px + env(safe-area-inset-top, 0px))',  // was 52px
} as const

export type Theme = typeof theme
