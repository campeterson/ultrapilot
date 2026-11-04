import { createContext, useContext } from 'react'

/** True inside a tablet section, where the shell's title bar already names the
 *  section — pages then hide their own heading. Phones have no title bar. */
export const PanelTitleBarContext = createContext(false)

export function useHasPanelTitleBar(): boolean {
  return useContext(PanelTitleBarContext)
}
