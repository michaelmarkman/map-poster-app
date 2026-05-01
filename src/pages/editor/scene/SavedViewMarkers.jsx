import { useEffect, useMemo, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { useGLTF, Line } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Quaternion, Vector3 } from 'three'
import { savedViewsAtom, savedViewMarkersOnAtom } from '../atoms/sidebar'
import { altitudeToOpacity, resolveFocalWorld } from './savedViewMarkerMath'

const CAMERA_GLB = '/camera-models/1990s_low_poly_camera.glb'
// World-units. The saved camera position lives in scene-local space but the
// scene is geo-referenced in meters; ~50m makes the mesh visible at typical
// aerial altitudes (200m–5km) without dominating the frame at low altitude.
const MARKER_SCALE = 50
const ACCENT = '#c8b897' // editor cream accent
const PIN_RADIUS = 5     // m
const PIN_HEIGHT = 12    // m
const EARTH_RADIUS_M = 6378137

// Drei caches the GLTF; preloading kicks off the fetch before the component
// mounts so first hover doesn't flash the placeholder.
useGLTF.preload(CAMERA_GLB)

function ellipsoidDrop(positionVec3) {
  // Project the camera origin straight down onto the WGS84 ellipsoid surface
  // (treat scene-local coords as ECEF — that's how the takram atmosphere
  // pipeline configures things). Returns a Vector3 on the sphere.
  const len = positionVec3.length()
  if (len < 1) return positionVec3.clone()
  const scale = EARTH_RADIUS_M / len
  return positionVec3.clone().multiplyScalar(scale)
}

export default function SavedViewMarkers() {
  const on = useAtomValue(savedViewMarkersOnAtom)
  const views = useAtomValue(savedViewsAtom)
  const [hoveredId, setHoveredId] = useState(null)
  if (!on) return null
  if (!views?.length) return null
  return (
    <>
      {views.map((view) => (
        <SavedViewMarker
          key={view.id}
          view={view}
          isHovered={hoveredId === view.id}
          onHover={(hover) =>
            setHoveredId(hover ? view.id : (h) => (h === view.id ? null : h))
          }
        />
      ))}
    </>
  )
}

function SavedViewMarker({ view, isHovered, onHover }) {
  const { scene: gltfScene } = useGLTF(CAMERA_GLB)
  // Each marker needs its own clone — sharing the same Object3D across
  // multiple <primitive> mounts would re-parent the mesh each frame and
  // only the last one would render.
  const cloned = useMemo(() => gltfScene.clone(true), [gltfScene])
  const liveScene = useThree((s) => s.scene)

  const opacityRef = useRef(1)
  const groupRef = useRef(null)
  const lineRef = useRef(null)
  const pinRef = useRef(null)

  useFrame(({ camera }) => {
    // ECEF position length minus Earth radius ≈ altitude above ellipsoid.
    // Same trick used elsewhere in Scene.jsx.
    const altitude = Math.max(camera.position.length() - EARTH_RADIUS_M, 0)
    const op = altitudeToOpacity(altitude)
    if (op === opacityRef.current) return
    opacityRef.current = op
    // Walk the cloned GLB and update every material's opacity. Cheap — the
    // 1990s low-poly GLB has < 10 materials.
    if (groupRef.current) {
      groupRef.current.traverse((child) => {
        if (child.material) {
          child.material.transparent = true
          child.material.opacity = op
        }
      })
    }
    if (lineRef.current?.material) lineRef.current.material.opacity = op * 0.5
    if (pinRef.current?.material) pinRef.current.material.opacity = op * 0.9
  })

  const position = useMemo(() => {
    const p = view?.camera?.position
    return Array.isArray(p) ? new Vector3(p[0], p[1], p[2]) : null
  }, [view?.camera?.position])

  const quaternion = useMemo(() => {
    const q = view?.camera?.quaternion
    return Array.isArray(q) ? new Quaternion(q[0], q[1], q[2], q[3]) : null
  }, [view?.camera?.quaternion])

  // Lazy focal-world resolution. Tries the raycast on mount; falls back to
  // the ellipsoid drop on miss (sky tap, tileset not yet loaded for region).
  // Cached on a ref so we don't re-raycast every render.
  const focalWorldRef = useRef(null)
  useEffect(() => {
    if (!position) return
    const hit = resolveFocalWorld(view, liveScene)
    focalWorldRef.current = hit ?? ellipsoidDrop(position)
    // No deps on liveScene.children — we only resolve once per marker.
    // If the user expects markers to "snap" once tiles finish streaming,
    // re-running here on a tileset-loaded event would be the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.id])

  if (!position || !quaternion) return null

  // Pin position is a world coord — render the pin in WORLD space (a sibling
  // group), not nested inside the position-locked camera group.
  const focalWorld = focalWorldRef.current

  const handleClick = (e) => {
    e.stopPropagation()
    if (opacityRef.current < 0.05) return // invisible — don't react
    window.dispatchEvent(new CustomEvent('restore-view', { detail: view }))
  }
  const handleOver = (e) => {
    e.stopPropagation()
    if (opacityRef.current < 0.05) return
    onHover(true)
    document.body.style.cursor = 'pointer'
  }
  const handleOut = (e) => {
    e.stopPropagation()
    onHover(false)
    document.body.style.cursor = ''
  }

  return (
    <>
      <group
        ref={groupRef}
        position={position}
        quaternion={quaternion}
        scale={MARKER_SCALE * (isHovered ? 1.15 : 1)}
        onClick={handleClick}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
      >
        <primitive object={cloned} />
      </group>
      {focalWorld && (
        <>
          <Line
            ref={lineRef}
            points={[position.toArray(), focalWorld.toArray()]}
            color={ACCENT}
            transparent
            opacity={0.5}
            lineWidth={1}
          />
          <mesh ref={pinRef} position={focalWorld}>
            <coneGeometry args={[PIN_RADIUS, PIN_HEIGHT, 8]} />
            <meshBasicMaterial color={ACCENT} transparent opacity={0.9} />
          </mesh>
        </>
      )}
    </>
  )
}
