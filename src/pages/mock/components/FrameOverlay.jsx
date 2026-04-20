import { useAtomValue } from 'jotai'
import { aspectRatioAtom, fillModeAtom } from '../../editor/atoms/ui'

// Aspect-ratio frame overlay. The canvas is always full-viewport in /mock
// now; this overlay paints a white-bordered "poster" rectangle on top, and
// surrounds it with four blur strips so the area outside the frame reads as
// a soft, blurred extension of the scene (rather than dead chrome).
//
// Hidden in fill mode — fill means "no aspect", so there's no frame to draw.
export default function FrameOverlay() {
  const aspectRatio = useAtomValue(aspectRatioAtom)
  const fillMode = useAtomValue(fillModeAtom)
  if (fillMode) return null
  return (
    <div className="mock-frame-overlay" style={{ '--frame-ratio': aspectRatio }}>
      <div className="mock-frame-blur" />
      <div className="mock-frame-border" />
    </div>
  )
}
