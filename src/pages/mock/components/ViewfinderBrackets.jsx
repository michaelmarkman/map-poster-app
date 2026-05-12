// Phase 1 — MoMA visual foundation.
//
// Four L-shaped corner brackets that frame the editor viewport, 24px
// from each edge. Visually they read as a viewfinder safe-frame
// indicator — the camera-aware vocabulary the MoMA prototype leans
// into, the same family the (future) center focus reticle inherits
// from in Phase 3.
//
// Pure presentation: no atoms, no state, no interaction. Positioning
// + stroke are CSS (.mock-vf-bracket / .mock-vf-bracket--{tl,tr,bl,br}
// in mock.css). The component exists so the intro sequence (and any
// future "hide chrome" mode) can mount / unmount the brackets in one
// place rather than scattering four divs through the shell.
export default function ViewfinderBrackets() {
  return (
    <>
      <div className="mock-vf-bracket mock-vf-bracket--tl" aria-hidden="true" />
      <div className="mock-vf-bracket mock-vf-bracket--tr" aria-hidden="true" />
      <div className="mock-vf-bracket mock-vf-bracket--bl" aria-hidden="true" />
      <div className="mock-vf-bracket mock-vf-bracket--br" aria-hidden="true" />
    </>
  )
}
