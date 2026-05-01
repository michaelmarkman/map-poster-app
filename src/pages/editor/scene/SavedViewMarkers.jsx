import { useMemo } from 'react'
import { useAtomValue } from 'jotai'
import { useGLTF } from '@react-three/drei'
import { Quaternion, Vector3 } from 'three'
import { savedViewsAtom, savedViewMarkersOnAtom } from '../atoms/sidebar'

const CAMERA_GLB = '/camera-models/1990s_low_poly_camera.glb'
// World-units. The saved camera position lives in scene-local space but the
// scene is geo-referenced in meters; ~50m makes the mesh visible at typical
// aerial altitudes (200m–5km) without dominating the frame at low altitude.
const MARKER_SCALE = 50

// Drei caches the GLTF; preloading kicks off the fetch before the component
// mounts so first hover doesn't flash the placeholder.
useGLTF.preload(CAMERA_GLB)

export default function SavedViewMarkers() {
  const on = useAtomValue(savedViewMarkersOnAtom)
  const views = useAtomValue(savedViewsAtom)
  if (!on) return null
  if (!views?.length) return null
  return (
    <>
      {views.map((view) => (
        <SavedViewMarker key={view.id} view={view} />
      ))}
    </>
  )
}

function SavedViewMarker({ view }) {
  const { scene: gltfScene } = useGLTF(CAMERA_GLB)
  // Each marker needs its own clone — sharing the same Object3D across
  // multiple <primitive> mounts would re-parent the mesh each frame and
  // only the last one would render.
  const cloned = useMemo(() => gltfScene.clone(true), [gltfScene])

  const position = useMemo(() => {
    const p = view?.camera?.position
    return Array.isArray(p) ? new Vector3(p[0], p[1], p[2]) : null
  }, [view?.camera?.position])

  const quaternion = useMemo(() => {
    const q = view?.camera?.quaternion
    return Array.isArray(q) ? new Quaternion(q[0], q[1], q[2], q[3]) : null
  }, [view?.camera?.quaternion])

  if (!position || !quaternion) return null

  return (
    <group position={position} quaternion={quaternion} scale={MARKER_SCALE}>
      <primitive object={cloned} />
    </group>
  )
}
