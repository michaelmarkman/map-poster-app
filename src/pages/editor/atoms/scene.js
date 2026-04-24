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
export const cloudsAtom = atom({
  on: true,
  coverage: IS_MOBILE ? 0.18 : 0.2,
  shadows: !IS_MOBILE,
  paused: false,
  speed: 1,
})
// DoF + color pop.
//   sceneColorPop  — saturation boost applied everywhere (works with DoF off)
//   focusColorPop  — additional boost applied only in the focal area on top
//                    of sceneColorPop; grayed out in the UI when DoF is off
//                    (no focal plane to scope it to). Sum is clamped to 1.0
//                    in the shader so both maxed doesn't oversaturate.
// Legacy sessions stored `colorPop` + `globalPop`; useSessionPersistence
// maps those forward on restore: globalPop=true → sceneColorPop=colorPop,
// focusColorPop=0; globalPop=false → sceneColorPop=0, focusColorPop=colorPop.
export const dofAtom = atom({
  on: true,
  focalUV: [0.5, 0.5],
  tightness: 70,
  blur: 25,
  sceneColorPop: 0,
  focusColorPop: 60,
  // DoF-lab additions — only /dof-lab writes to these. All default to
  // "off / legacy" so /app and /app-classic render identically.
  //   useApertureCoC  — when true, shader replaces the Tightness-driven
  //                     depthRange with an aperture-scaled version
  //   aperture        — f-stop (1.4 – 16); smaller = wider DoF is blurred
  useApertureCoC: false,
  aperture: 4,
  // Lens-character: when on, bright samples in the blur kernel get
  // weighted heavily so they form visible bokeh "balls" instead of
  // washing out uniformly. Default on in /dof-lab; UI toggle lets
  // you A/B it against the uniform-blur look.
  highlightBokeh: true,
})

// Which DoF engine to use. A/B knob so we can compare approaches live.
//   'lib'    — postprocessing's DepthOfFieldEffect. Proper multi-pass:
//              half-res CoC, near/far separation, tile-dilation of the
//              near layer, scatter-as-gather bokeh. Fixes the hard-silhouette
//              edge artifact our single-pass gather produces when the blur
//              kernel straddles sharp/blurred boundaries (gather rejects
//              samples whose own CoC is smaller → visible polygon edges).
//   'custom' — our original CustomDofEffect (single-pass depth-weighted
//              ring blur). Kept mounted in lib mode too with maxBlur=0 so
//              its color-pop grade still runs on the blurred result.
//
// Flip at runtime: `__setDofEngine('lib'|'custom')` in console, or Alt+D.
// URL param `?dof=lib|custom` seeds the initial value on page load.
const urlDofEngine = (() => {
  try {
    const v = new URLSearchParams(window.location.search).get('dof')
    if (v === 'lib' || v === 'custom') return v
  } catch { /* SSR / no window */ }
  return null
})()
export const dofEngineAtom = atom(urlDofEngine || 'lib')

// Map style — one of default | satellite | warm | cool | desaturated | noir |
// sepia | blueprint | neon. See `#map-style-grid` in the sidebar HTML.
export const mapStyleAtom = atom('default')

// Time-of-day unlock — when off, the slider clamps to sunrise/sunset at the
// current latitude; when on, the user can drag into deep night. Persists via
// localStorage key `mapposter3d_tod_unlocked`.
export const todUnlockedAtom = atom(false)

export { IS_MOBILE }
