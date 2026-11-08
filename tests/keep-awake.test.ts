// Keep-awake: when, and when the iOS video fallback is needed.
// Run: npm run test:awake
import { iosVersion, isIOS, needsVideoFallback, shouldKeepAwake } from '../src/data/logic/keep-awake-logic'

let ok = 0, fail = 0
const c = (n: string, v: boolean) => { if (v) ok++; else { fail++; console.log('FAIL', n) } }
const iphone = (v: string) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${v} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1`
const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'

c('when: session', shouldKeepAwake({ sessionActive: true, liveSharing: false, inLiveGroup: false }))
c('when: in group', shouldKeepAwake({ sessionActive: false, liveSharing: false, inLiveGroup: true }))
c('when: idle', !shouldKeepAwake({ sessionActive: false, liveSharing: false, inLiveGroup: false }))
c('version iphone', iosVersion(iphone('17_5')) === 17.05 && iosVersion(iphone('18_4')) === 18.04)
c('ipad is iOS', isIOS(ipad, 5) && !isIOS(ipad, 0) && !isIOS(android, 5))
c('old iOS home screen → video', needsVideoFallback({ ua: iphone('17_5'), maxTouchPoints: 5, standalone: true, hasWakeLock: true }))
c('old iOS in Safari tab → lock', !needsVideoFallback({ ua: iphone('17_5'), maxTouchPoints: 5, standalone: false, hasWakeLock: true }))
c('iOS 18.4 home screen → lock', !needsVideoFallback({ ua: iphone('18_4'), maxTouchPoints: 5, standalone: true, hasWakeLock: true }))
c('iPad 17.4 home screen → video', needsVideoFallback({ ua: ipad, maxTouchPoints: 5, standalone: true, hasWakeLock: true }))
c('android → lock', !needsVideoFallback({ ua: android, maxTouchPoints: 5, standalone: true, hasWakeLock: true }))
c('no API → video', needsVideoFallback({ ua: android, maxTouchPoints: 5, standalone: false, hasWakeLock: false }))
console.log(`${ok} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
