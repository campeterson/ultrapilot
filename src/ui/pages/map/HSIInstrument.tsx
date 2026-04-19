interface HSIProps {
  /** Current ground track, degrees (0–360) */
  hdg: number
  /** Desired track to direct-to, degrees — null when no D→ active */
  dtk: number | null
  /** Cross-track error, nm — null when no D→ active */
  xtk: number | null
  /** Bearing to origin, degrees */
  brg: number
  /** Distance to origin, nm — shown as sub-label */
  dist: number
  /** Size of the instrument in px (square) */
  size?: number
}

// CDI full-scale deflection in nm — 0.3 nm per dot, 2 dots = full scale
const CDI_FULL_SCALE_NM = 0.3
const CDI_MAX_DEFLECT_R = 22  // px at full scale, in SVG units (viewBox ±60)
const R = 52                   // compass rose radius
const CDI_HALF_LEN = 18        // half-length of CDI bar in SVG units

const C = {
  rose:      '#8899aa',   // compass rose ticks + labels
  aircraft:  '#FDF6E3',   // aircraft symbol
  course:    '#e040fb',   // magenta course pointer + CDI (matches route line)
  bearing:   '#e67e22',   // amber bearing pointer (to origin)
  cdiDot:    '#8899aa',   // scale dots
  toFrom:    '#27ae60',   // TO flag
  bezel:     'rgba(14, 14, 20, 0.92)',
  border:    'rgba(255,255,255,0.12)',
}

/** Cardinal + intercardinal labels every 30°, short ticks every 10°, long every 30° */
function CompassRose({ hdg }: { hdg: number }) {
  const ticks = []
  for (let deg = 0; deg < 360; deg += 10) {
    const isMajor = deg % 30 === 0
    const rad = (deg * Math.PI) / 180
    const inner = isMajor ? R - 8 : R - 5
    const x1 = Math.sin(rad) * R
    const y1 = -Math.cos(rad) * R
    const x2 = Math.sin(rad) * inner
    const y2 = -Math.cos(rad) * inner
    ticks.push(<line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.rose} strokeWidth={isMajor ? 1.5 : 1} />)
  }

  const labels = [
    { deg: 0,   label: 'N' },
    { deg: 90,  label: 'E' },
    { deg: 180, label: 'S' },
    { deg: 270, label: 'W' },
    { deg: 30,  label: '3' },
    { deg: 60,  label: '6' },
    { deg: 120, label: '12' },
    { deg: 150, label: '15' },
    { deg: 210, label: '21' },
    { deg: 240, label: '24' },
    { deg: 300, label: '30' },
    { deg: 330, label: '33' },
  ]

  const labelEls = labels.map(({ deg, label }) => {
    const rad = (deg * Math.PI) / 180
    const lr = R - 15
    const x = Math.sin(rad) * lr
    const y = -Math.cos(rad) * lr
    const isCardinal = ['N', 'E', 'S', 'W'].includes(label)
    return (
      <text
        key={deg}
        x={x} y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={isCardinal ? 9 : 7}
        fontWeight={isCardinal ? 700 : 400}
        fill={isCardinal ? C.aircraft : C.rose}
        fontFamily="B612 Mono, monospace"
      >
        {label}
      </text>
    )
  })

  return (
    <g transform={`rotate(${-hdg})`}>
      <circle cx={0} cy={0} r={R} fill="none" stroke={C.rose} strokeWidth={1} opacity={0.4} />
      {ticks}
      {labelEls}
    </g>
  )
}

/** Course pointer + CDI bar, both in screen (non-rotating) frame */
function CoursePointer({ hdg, dtk, xtk }: { hdg: number; dtk: number; xtk: number | null }) {
  const courseAngle = ((dtk - hdg) + 360) % 360  // track-relative
  const rad = (courseAngle * Math.PI) / 180

  // CDI lateral deflection in SVG units (perpendicular to course line)
  const rawDeflect = xtk !== null ? xtk / CDI_FULL_SCALE_NM : 0
  const clampedDeflect = Math.max(-1, Math.min(1, rawDeflect))
  const deflectPx = clampedDeflect * CDI_MAX_DEFLECT_R

  // TO/FROM: if course angle < 90° or > 270°, we're heading roughly toward the waypoint
  const isTo = courseAngle < 90 || courseAngle > 270

  // Scale dot positions (perpendicular to course, at ±1 and ±2 dots)
  const dot1 = CDI_MAX_DEFLECT_R * 0.5
  const dot2 = CDI_MAX_DEFLECT_R

  return (
    <g transform={`rotate(${courseAngle})`}>
      {/* Scale dots — perpendicular to course pointer (on the horizontal axis before rotation) */}
      {[-dot2, -dot1, dot1, dot2].map(x => (
        <circle key={x} cx={x} cy={0} r={2} fill="none" stroke={C.cdiDot} strokeWidth={1.2} />
      ))}

      {/* Upper course pointer stub (TO end) */}
      <line x1={0} y1={-R + 2} x2={0} y2={-(CDI_HALF_LEN + 6)} stroke={C.course} strokeWidth={2} strokeLinecap="round" />
      {/* Arrowhead at TO end */}
      <polygon points="0,-{R-3} -4,-{R-10} 4,-{R-10}"
        transform={`translate(0,${-R + 8})`}
        fill={C.course}
      />

      {/* Lower course pointer stub (FROM end) */}
      <line x1={0} y1={CDI_HALF_LEN + 6} x2={0} y2={R - 2} stroke={C.course} strokeWidth={2} strokeLinecap="round" />
      {/* FROM notch */}
      <line x1={-4} y1={R - 8} x2={4} y2={R - 8} stroke={C.course} strokeWidth={2} />

      {/* CDI bar — offset perpendicular (horizontal before rotation) */}
      <line
        x1={deflectPx} y1={-(CDI_HALF_LEN)}
        x2={deflectPx} y2={CDI_HALF_LEN}
        stroke={C.course} strokeWidth={3} strokeLinecap="round"
      />

      {/* TO/FROM flag */}
      <text
        x={deflectPx}
        y={isTo ? -(CDI_HALF_LEN + 14) : (CDI_HALF_LEN + 14)}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={7}
        fontWeight={700}
        fill={C.toFrom}
        fontFamily="B612 Mono, monospace"
      >
        {isTo ? 'TO' : 'FR'}
      </text>
    </g>
  )
  void rad
}

/** Bearing pointer to origin (amber, thin needle) */
function BearingPointer({ hdg, brg }: { hdg: number; brg: number }) {
  const angle = ((brg - hdg) + 360) % 360
  return (
    <g transform={`rotate(${angle})`}>
      {/* Needle tip */}
      <line x1={0} y1={-R + 2} x2={0} y2={-(R - 18)} stroke={C.bearing} strokeWidth={1.5} strokeLinecap="round" />
      <polygon points="0,-50 -3,-40 3,-40" fill={C.bearing} />
      {/* Tail */}
      <line x1={0} y1={R - 2} x2={0} y2={R - 16} stroke={C.bearing} strokeWidth={1.5} strokeLinecap="round" strokeDasharray="3 2" />
    </g>
  )
}

/** Fixed aircraft symbol at center */
function AircraftSymbol() {
  return (
    <g>
      {/* Fuselage */}
      <line x1={0} y1={-10} x2={0} y2={8} stroke={C.aircraft} strokeWidth={2} strokeLinecap="round" />
      {/* Wings */}
      <line x1={-12} y1={0} x2={12} y2={0} stroke={C.aircraft} strokeWidth={2} strokeLinecap="round" />
      {/* Tail */}
      <line x1={-6} y1={7} x2={6} y2={7} stroke={C.aircraft} strokeWidth={1.5} strokeLinecap="round" />
      {/* Lubber line (fixed top marker) */}
      <line x1={0} y1={-(R + 2)} x2={0} y2={-(R - 6)} stroke={C.aircraft} strokeWidth={2.5} strokeLinecap="round" />
    </g>
  )
}

export function HSIInstrument({ hdg, dtk, xtk, brg, dist, size = 160 }: HSIProps) {
  const hasCourse = dtk !== null

  return (
    <svg
      viewBox="-64 -64 128 128"
      width={size}
      height={size}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* Bezel */}
      <circle cx={0} cy={0} r={62} fill={C.bezel} stroke={C.border} strokeWidth={1} />

      {/* Compass rose — rotates with heading */}
      <CompassRose hdg={hdg} />

      {/* Bearing pointer to origin */}
      <BearingPointer hdg={hdg} brg={brg} />

      {/* Course pointer + CDI — only when D→ active */}
      {hasCourse && <CoursePointer hdg={hdg} dtk={dtk!} xtk={xtk} />}

      {/* Aircraft symbol (fixed) */}
      <AircraftSymbol />

      {/* Distance sub-label */}
      <text
        x={0} y={50}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={8}
        fill={C.rose}
        fontFamily="B612 Mono, monospace"
      >
        {dist.toFixed(1)} nm
      </text>
    </svg>
  )
}
