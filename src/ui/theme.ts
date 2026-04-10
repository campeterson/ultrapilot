export const theme = {
  colors: {
    red: '#C0392B',
    redDim: 'rgba(192, 57, 43, 0.18)',
    cream: '#FDF6E3',
    dark: '#141418',
    darkCard: '#1e1e24',
    darkBorder: 'rgba(255, 255, 255, 0.07)',
    dim: '#667788',
    light: '#ccd',
    green: '#27ae60',
    amber: '#e67e22',
    blue: '#3498db',
    purple: '#8e44ad',
    navBg: '#0c0c12',
    stripBg: 'rgba(14, 14, 20, 0.96)',
  },
  font: {
    primary: '"B612", monospace',
    mono: '"B612 Mono", monospace',
  },
  size: {
    instrumentValue: '18px',
    instrumentLabel: '9px',
    heroValue: '36px',
    body: '13px',
    small: '11px',
    tiny: '9px',
  },
  tapTarget: '44px',
  navHeight: '60px',
  stripHeight: '52px',
} as const

export type Theme = typeof theme
