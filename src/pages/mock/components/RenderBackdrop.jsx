import { useEffect, useState } from 'react'
import { useAtomValue } from 'jotai'
import { aspectRatioAtom, fillModeAtom } from '../../editor/atoms/ui'
import { editingBackdropAtom } from '../atoms'
import { computeFrameRect } from '../utils/frameRect'

// When the user picks "Edit graphics" on a gallery entry, this component
// renders that entry's image as a static backdrop on top of the live WebGL
// scene, sized + positioned to match the frame. Fabric continues to render
// above this so graphics edits land on the rendered photo, not the live
// 3D view.
export default function RenderBackdrop() {
  const src = useAtomValue(editingBackdropAtom)
  const aspectRatio = useAtomValue(aspectRatioAtom)
  const fillMode = useAtomValue(fillModeAtom)
  const [rect, setRect] = useState(() => computeFrameRect(aspectRatio, fillMode))

  useEffect(() => {
    const update = () => setRect(computeFrameRect(aspectRatio, fillMode))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [aspectRatio, fillMode])

  // Mirror to a global so the export snapshot path can read it without
  // having to hook into Jotai.
  useEffect(() => {
    if (src) window.__editorBackdrop = src
    else delete window.__editorBackdrop
  }, [src])

  if (!src) return null
  return (
    <img
      src={src}
      style={{
        position: 'absolute',
        top: `${Math.round(rect.y)}px`,
        left: `${Math.round(rect.x)}px`,
        width: `${Math.round(rect.w)}px`,
        height: `${Math.round(rect.h)}px`,
        zIndex: 5,
        pointerEvents: 'none',
        userSelect: 'none',
        objectFit: 'cover',
      }}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
