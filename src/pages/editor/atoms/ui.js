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

// Live camera readout — updated from Scene's useFrame via a setter, read by
// the sidebar Camera section's tilt/heading/altitude/focal sliders. User input
// dispatches 'camera-set' (tilt/heading/altitude) or 'fov-change' (fovMm)
// which Scene applies to the actual camera; next sync cycle writes the
// resulting values back here.
export const cameraReadoutAtom = atom({
  tilt: 51,
  heading: 67,
  altitude: 472,
  fovMm: 41,
})
