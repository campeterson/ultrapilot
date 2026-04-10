export type FlightCategory = 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | 'UNKNOWN'

export interface MetarDecoded {
  raw: string
  stationId: string
  wind: string
  visibility: string
  ceiling: string
  tempDewpoint: string
  altimeter: string
  category: FlightCategory
  categoryColor: string
}

const CATEGORY_COLORS: Record<FlightCategory, string> = {
  VFR: '#27ae60',
  MVFR: '#3498db',
  IFR: '#C0392B',
  LIFR: '#8e44ad',
  UNKNOWN: '#667',
}

/** Derive flight category from ceiling (ft) and visibility (SM) */
export function deriveFlightCategory(ceilingFt: number | null, visSM: number | null): FlightCategory {
  if (ceilingFt === null && visSM === null) return 'UNKNOWN'
  const ceil = ceilingFt ?? Infinity
  const vis = visSM ?? Infinity
  if (ceil < 500 || vis < 1) return 'LIFR'
  if (ceil < 1000 || vis < 3) return 'IFR'
  if (ceil < 3000 || vis < 5) return 'MVFR'
  return 'VFR'
}

/** Minimal METAR decoder — parses raw string into display fields */
export function decodeMETAR(raw: string): MetarDecoded {
  const tokens = raw.trim().split(/\s+/)
  const stationId = tokens[0] ?? '????'

  // Wind: pattern like 18012KT or 00000KT or 18012G20KT
  const windToken = tokens.find(t => /^\d{5}(G\d{2,3})?(KT|MPS)$/.test(t) || t === '00000KT')
  let wind = windToken ?? '—'

  // Visibility: pattern like 10SM or 1/4SM or 1 1/2SM
  const visToken = tokens.find(t => /SM$/.test(t))
  let vis = visToken ?? '—'
  let visSM: number | null = null
  if (visToken) {
    const m = visToken.match(/^(\d+(?:\/\d+)?)SM$/)
    if (m) {
      const parts = m[1].split('/')
      visSM = parts.length === 2 ? parseInt(parts[0]) / parseInt(parts[1]) : parseFloat(parts[0])
    }
    vis = `${visToken}`
  }

  // Ceiling: first BKN or OVC layer, e.g. BKN025
  let ceilingFt: number | null = null
  let ceiling = 'CLR'
  for (const t of tokens) {
    const m = t.match(/^(BKN|OVC)(\d{3})/)
    if (m) {
      ceilingFt = parseInt(m[2]) * 100
      ceiling = `${m[1]} ${ceilingFt} ft`
      break
    }
  }

  // Temp/dewpoint: pattern like 12/08 or M02/M05
  const tempToken = tokens.find(t => /^M?\d{2}\/M?\d{2}$/.test(t))
  const tempDewpoint = tempToken ?? '—'

  // Altimeter: A2992 or Q1013
  const altToken = tokens.find(t => /^[AQ]\d{4}$/.test(t))
  let altimeter = '—'
  if (altToken) {
    if (altToken.startsWith('A')) {
      const inHg = parseInt(altToken.slice(1)) / 100
      altimeter = `${inHg.toFixed(2)} inHg`
    } else {
      altimeter = `${altToken.slice(1)} hPa`
    }
  }

  const category = deriveFlightCategory(ceilingFt, visSM)

  return {
    raw,
    stationId,
    wind,
    visibility: vis,
    ceiling,
    tempDewpoint,
    altimeter,
    category,
    categoryColor: CATEGORY_COLORS[category],
  }
}

export function categoryColor(cat: FlightCategory): string {
  return CATEGORY_COLORS[cat]
}
