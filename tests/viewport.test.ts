// iOS Home Screen bottom-gap measurement. Run: npm run test:viewport
import { viewportGap } from '../src/data/logic/viewport-logic'

let ok = 0, fail = 0
const c = (n: string, v: boolean) => { if (v) ok++; else { fail++; console.log('FAIL', n) } }
const base = { isIOS: true, standalone: true, screenW: 390, screenH: 844, innerW: 390, innerH: 844 }
c('12 Pro portrait: 47 gap', viewportGap({ ...base, probeH: 797 }) === 47)
c('Dynamic Island: 59 gap', viewportGap({ ...base, screenW: 393, screenH: 852, innerW: 393, innerH: 852, probeH: 793 }) === 59)
c('no bug: 0', viewportGap({ ...base, probeH: 844 }) === 0)
c('landscape uses short side', viewportGap({ ...base, innerW: 844, innerH: 390, probeH: 390 }) === 0)
c('browser tab: 0', viewportGap({ ...base, standalone: false, probeH: 664 }) === 0)
c('android: 0', viewportGap({ ...base, isIOS: false, probeH: 797 }) === 0)
c('huge = not this bug', viewportGap({ ...base, probeH: 500 }) === 0)
c('no probe: 0', viewportGap({ ...base, probeH: 0 }) === 0)
console.log(`${ok} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
