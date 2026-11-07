// Bottom navigation order: defaults per flight mode, moving, repairing saved orders.
// Run: npm run test:nav
import { DEFAULT_NAV_ORDER, moveSection, normalizeNavOrder, splitNav } from '../src/data/logic/nav-logic'
let ok = 0, fail = 0; const c = (n: string, v: boolean) => { if (v) ok++; else { fail++; console.log('FAIL', n) } }
const d = DEFAULT_NAV_ORDER
c('powered bar', splitNav(d, 'powered').bar.join() === 'timeline,checklists,wx,waypoints')
c('powered more has routes, not wind', splitNav(d, 'powered').more.includes('routes') && !splitNav(d, 'powered').more.includes('wind'))
c('lta bar', splitNav(d, 'lta').bar.join() === 'wind,timeline,checklists,wx')
c('lta no routes', ![...splitNav(d, 'lta').bar, ...splitNav(d, 'lta').more].includes('routes'))
const m = moveSection(d, 'powered', 'plan', -1)
c('move up swaps with routes', m.indexOf('plan') === d.indexOf('routes') && m.indexOf('routes') === d.indexOf('plan'))
// powered: timeline is first available; moving it up does nothing (wind is hidden)
c('top stays', moveSection(d, 'powered', 'timeline', -1).join() === d.join())
// moving wpts below routes in powered skips nothing hidden; wind keeps its slot
const p2 = moveSection(d, 'powered', 'timeline', 1)
c('wind keeps slot', p2[0] === 'wind' && p2[1] === 'checklists' && p2[2] === 'timeline')
c('normalize', normalizeNavOrder(['plan', 'bogus', 'plan', 'live']).slice(0, 2).join() === 'plan,live' && normalizeNavOrder(['plan']).length === d.length)
c('normalize junk', normalizeNavOrder('x').join() === d.join())
console.log(`${ok} passed, ${fail} failed`); process.exit(fail ? 1 : 0)
