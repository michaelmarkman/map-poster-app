import { atom } from 'jotai'

// Mobile detection — same logic as poster-v3-ui.jsx:50-56. Mirrors the
// prototype so scene defaults line up across both versions.
const IS_MOBILE = (() => {
  try {
    const narrow = window.matchMedia('(max-width: 1024px)').matches
    const coarse = window.matchMedia('(pointer: coarse)').matches
    return narrow && coarse
  } catch (e) { return false }
})()

// Scene atoms — one per field of the legacy `state` object. Scene components
// read these through the `sceneRef` mirror inside useFrame so 60fps frame
// updates don't trigger React re-renders; UI components read/write them
// directly via useAtom.
export const timeOfDayAtom = atom(12)
export const latitudeAtom = atom(40.748440)
export const longitudeAtom = atom(-73.985664)
export const sunRotationAtom = atom(0)
export const bloomAtom = atom({ on: false })
export const ssaoAtom = atom({ on: false })
export const vignetteAtom = atom({ on: false })
// Clouds. coverage===0 means clouds are off (no separate boolean — the
// cluster pill exposes a single coverage slider whose 0 detent disables).
// `shadows`, `paused`, `speed` survive in the atom shape with sensible
// defaults but have no UI in /app any more; /dof-lab can still write
// them.
export const cloudsAtom = atom({
  coverage: 0.2,
  shadows: !IS_MOBILE,
  paused: false,
  speed: 1,
})

// DoF + color pop.
//   sceneColorPop  — saturation boost applied everywhere (works with DoF off)
//   focusColorPop  — additional boost applied only in the focal area on top
//                    of sceneColorPop. Sum is clamped to 1.0 in the shader
//                    so both maxed doesn't oversaturate.
// Legacy sessions stored `colorPop` + `globalPop`; useSessionPersistence
// maps those forward on restore: globalPop=true → sceneColorPop=colorPop,
// focusColorPop=0; globalPop=false → sceneColorPop=0, focusColorPop=colorPop.
//
// `aperture` doubles as the on/off for DoF: aperture===0 disables the
// effect; 1.4–16 are normal f-stops. The /app cluster pill writes 0
// when its slider is at the minimum detent. tightness/blur/useApertureCoC/
// highlightBokeh stay in the atom shape but have no /app UI; they're
// still writable from /dof-lab.
export const dofAtom = atom({
  focalUV: [0.5, 0.5],
  tightness: 70,
  blur: 25,
  sceneColorPop: 25,
  focusColorPop: 25,
  // /app's cluster writes to `aperture` only. Default useApertureCoC=true
  // so the aperture-CoC math is the active DoF path; /dof-lab still has
  // a toggle for A/B against the legacy tightness/blur math.
  useApertureCoC: true,
  aperture: 4.5,
  highlightBokeh: true,
})

// (mapStyleAtom — color-grade preset for the tile texture — went with
// the sidebar editor's #map-style-grid in Phase 1.2. Nothing in the
// scene reads it any more; the atom + the persistence round-trip
// were write-only. If a future preset picker comes back, recreate
// here. The 'default | satellite | warm | …' slugs are documented
// in prototypes/poster-v3-ui.html for reference.)

// Time-of-day unlock — when off, the slider clamps to sunrise/sunset at the
// current latitude; when on, the user can drag into deep night. Persists via
// localStorage key `vedute_tod_unlock`.
export const todUnlockedAtom = atom(false)

export { IS_MOBILE }
