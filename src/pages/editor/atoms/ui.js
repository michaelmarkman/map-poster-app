import { atom } from 'jotai'

// UI atoms — read/written by sidebar, overlays, and modals. Scene components
// generally don't touch these.
export const sidebarCollapsedAtom = atom(false)
export const fillModeAtom = atom(false)
// 4:3 default matches the prototype HTML's initial --ratio (1.333) and the
// default-active size-btn in the sidebar.
export const aspectRatioAtom = atom(1.333)
export const textOverlayAtom = atom(true)
export const textFieldsAtom = atom({
  title: 'East Village',
  subtitle: '250 1st Avenue',
  coords: '40.7323\u00b0 N, 73.9812\u00b0 W',
})
