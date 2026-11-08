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
    trackGreen: '#00E676',
    navBg: '#0c0c12',
    stripBg: 'rgba(14, 14, 20, 0.96)',
    // Flight-plan drift tracks, one per altitude (low → high)
    driftLevels: ['#00acc1', '#2e7d32', '#e67e22', '#8e44ad'],
    launchSite: '#ff6f00',
    poi: '#ab47bc',
    // Chosen launch sites 1–5 (markers, and tracks when not comparing altitudes)
    planSites: ['#d81b60', '#1e88e5', '#00897b', '#3949ab', '#6d4c41'],
    // Imported zones: good landing / caution / do not land
    zoneGood: '#2ecc71',
    zoneCaution: '#f1c40f',
    zoneNogo: '#e74c3c',
    // Live Group member markers, by role
    liveRoles: {
      balloon: '#e91e63',
      chase: '#00bcd4',
      ppc: '#5c6bc0',
      ppg: '#26a69a',
      aircraft: '#8d6e63',
      ground: '#78909c',
    },
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
  // iOS 26 Home Screen bug: iOS lays the app out --vp-gap short of the screen
  // bottom (set by useViewportGap; 0 elsewhere) and won't paint fixed elements
  // below that. Its shortened box already ends above the home indicator, so the
  // home-indicator padding shrinks by the gap; the strip below is painted by
  // the page background, which is the nav bar's colour (index.html).
  /** Bottom padding inside the nav bar (home indicator, less the iOS gap). */
  navPad: 'max(0px, calc(env(safe-area-inset-bottom, 0px) - var(--vp-gap, 0px)))',
  safeNavHeight: 'calc(60px + max(0px, calc(env(safe-area-inset-bottom, 0px) - var(--vp-gap, 0px))))',
  /** `bottom` for things on the bottom edge (nav bar, full-screen overlays). */
  screenBottom: '0px',
  /** `bottom` for things that sit just above the nav bar. */
  aboveNav: 'calc(60px + max(0px, calc(env(safe-area-inset-bottom, 0px) - var(--vp-gap, 0px))))',
  safeStripHeight: 'calc(58px + env(safe-area-inset-top, 0px))',  // was 52px
  // Landscape notch / rounded corners (≈47px each side on iPhone 12+)
  safeLeft: 'env(safe-area-inset-left, 0px)',
  safeRight: 'env(safe-area-inset-right, 0px)',
} as const

export type Theme = typeof theme
