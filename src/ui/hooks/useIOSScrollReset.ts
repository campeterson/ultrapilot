import { useEffect } from 'react'

/** iOS (esp. installed PWAs) scrolls the layout viewport up to keep a focused
 *  input above the keyboard and sometimes never scrolls back, leaving the whole
 *  UI shifted up under the status bar / notch. The app never scrolls at the
 *  document level, so snap it back whenever focus leaves an input or the
 *  visual viewport resizes (keyboard closing, rotation). */
export function useIOSScrollReset() {
  useEffect(() => {
    const reset = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0)
    }
    const onFocusOut = () => setTimeout(reset, 50)
    window.addEventListener('focusout', onFocusOut)
    window.visualViewport?.addEventListener('resize', reset)
    window.addEventListener('orientationchange', reset)
    return () => {
      window.removeEventListener('focusout', onFocusOut)
      window.visualViewport?.removeEventListener('resize', reset)
      window.removeEventListener('orientationchange', reset)
    }
  }, [])
}
