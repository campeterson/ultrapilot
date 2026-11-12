import { directionLine, tickEveryMinutes, validLineMinutes, LINE_MINUTES, DEFAULT_LINE_MINUTES } from '../src/data/logic/direction-line-logic'
import { haversineNM } from '../src/data/logic/gps-logic'

let ok = 0, fail = 0
const check = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.log('FAIL', name) } }
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol

check('defaults: powered 2, lta 30', DEFAULT_LINE_MINUTES.powered === 2 && DEFAULT_LINE_MINUTES.lta === 30)
check('defaults are choices', LINE_MINUTES.powered.includes(2) && LINE_MINUTES.lta.includes(30))
check('old 5 min stays for powered', validLineMinutes('powered', 5) === 5)
check('old 30 min powered → default', validLineMinutes('powered', 30) === 2)
check('old 5 min lta → default', validLineMinutes('lta', 5) === 30)
check('junk → default', validLineMinutes('lta', 'x') === 30 && validLineMinutes('powered', undefined) === 2)
check('ticks: powered every min', tickEveryMinutes('powered', 10) === 1)
check('ticks: lta 10 → 5, 30/60 → 10', tickEveryMinutes('lta', 10) === 5 && tickEveryMinutes('lta', 30) === 10 && tickEveryMinutes('lta', 60) === 10)

// 30 kt for 2 min = 1 nm, ticks at 1 min (0.5 nm)
const lat = 38.9, lon = -94.6
const l = directionLine(lat, lon, 90, 30, 2, 1, 0.02)!
const lenNM = haversineNM(lat, lon, l.coords[1][1], l.coords[1][0])
check('length = speed × time', near(lenNM, 1))
check('starts at the gap', near(haversineNM(lat, lon, l.coords[0][1], l.coords[0][0]), 0.02, 0.001))
check('one tick at 1 min', l.ticks.length === 1 && near(haversineNM(lat, lon, l.ticks[0][1], l.ticks[0][0]), 0.5))
check('east of start', l.coords[1][0] > lon)
check('10 min powered: 9 ticks', directionLine(lat, lon, 0, 25, 10, 1)!.ticks.length === 9)
check('60 min lta: 5 ticks', directionLine(lat, lon, 0, 8, 60, 10)!.ticks.length === 5)
check('stopped: none', directionLine(lat, lon, 0, 0, 2, 1) === null)

console.log(`${ok} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
