import { useEffect, useMemo, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { useFrame, useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { Quaternion, Vector3 } from 'three'
import {
  hoveredSavedViewIdAtom,
  savedViewsAtom,
  savedViewMarkersOnAtom,
} from '../atoms/sidebar'
import { altitudeToOpacity, resolveFocalWorld } from './savedViewMarkerMath'
import '../styles/saved-view-marker-tooltip.css'

// World-unit floor on the camera marker's body size, in metres. At close
// range the marker won't shrink below this; the rest of the size scales
// linearly with distance so the marker stays noticeable from any altitude
// (see MARKER_SCALE_PER_METER + the per-frame scale.setScalar in useFrame).
const MARKER_SCALE_MIN = 25
// World metres of marker scale per metre of camera distance. A pure
// "constant screen size" projection would compute this from the camera's
// FOV; this approximation is close enough that the marker reads as the
// same apparent size at 500m as at 50km without doing the trig per frame.
// At 1km away the marker body is ~20m; at 10km it's ~200m.
const MARKER_SCALE_PER_METER = 0.02
// Hide the marker when the live camera is within this many metres of the
// saved camera position — at that range the marker would either be
// inside the camera (eclipsing the entire view) or so big in the frame
// it'd block the actual content. The user's "saved" view IS where they
// are; we don't need to draw a marker on top of themselves.
const MARKER_HIDE_DIST = 80
const ACCENT = '#c8b897'
// Ground-pin floor + per-metre growth, mirroring the marker scale logic
// but tuned much smaller — the pin is just a footprint indicator, the
// camera body is the actual landmark. Geometry is tiny too (1.5m × 3m
// before scaling) so even at 10km out the pin reads as a stake, not a
// monolith.
const PIN_SCALE_MIN = 1
const PIN_SCALE_PER_METER = 0.003
const PIN_RADIUS = 1.5
const PIN_HEIGHT = 3
const EARTH_RADIUS_M = 6378137

// Module-level handle to the tooltip DOM element. Set by
// `SavedViewMarkersOverlay` (which lives OUTSIDE the R3F Canvas) on mount,
// read by `TooltipPositioner` (which lives INSIDE the Canvas, in a useFrame).
//
// Why module-level? React's `createPortal` from `react-dom` does NOT
// escape R3F's reconciler when called from inside a `<Canvas>` fiber tree
// — the portal's children are still routed through the R3F reconciler,
// which doesn't know `<div>`/`<img>`/etc. and throws "R3F: Div is not
// part of the THREE namespace" the moment markers turn on. So the tooltip
// HTML must be rendered by a sibling of the Canvas, and the in-Canvas
// projection code reaches it through this module-scoped ref instead.
const tooltipDomRef = { current: null }

function ellipsoidDrop(positionVec3) {
  // Project the camera origin straight down onto the WGS84 ellipsoid surface
  // (treat scene-local coords as ECEF — that's how the takram atmosphere
  // pipeline configures things). Returns a Vector3 on the sphere.
  const len = positionVec3.length()
  if (len < 1) return positionVec3.clone()
  const scale = EARTH_RADIUS_M / len
  return positionVec3.clone().multiplyScalar(scale)
}

// Drives the screen-space position of the (DOM-rendered) tooltip from
// inside the Canvas where the camera lives. Reads `tooltipDomRef`
// directly; the overlay component is responsible for keeping that ref
// up to date.
function TooltipPositioner({ hoveredView }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const projected = useRef(new Vector3())

  useFrame(() => {
    const el = tooltipDomRef.current
    if (!el) return
    if (!hoveredView?.camera?.position) {
      el.style.transform = 'translate3d(-9999px, -9999px, 0)'
      return
    }
    const p = hoveredView.camera.position
    projected.current.set(p[0], p[1], p[2]).project(camera)
    const x = (projected.current.x * 0.5 + 0.5) * size.width
    const y = (-projected.current.y * 0.5 + 0.5) * size.height
    if (projected.current.z > 1 || x < -300 || x > size.width + 300) {
      el.style.transform = 'translate3d(-9999px, -9999px, 0)'
      return
    }
    el.style.transform = `translate3d(${Math.round(x + 16)}px, ${Math.round(y - 24)}px, 0)`
  })
  return null
}

// In-scene layer of camera markers for saved views. Each saved view
// renders as a small primitive camera body at its world position +
// quaternion, with a frustum-style line dropping to a focal pin on the
// ground. Hover state is published to `hoveredSavedViewIdAtom`; the
// matching tooltip HTML is rendered by `<SavedViewMarkersOverlay />`,
// which is mounted as a sibling of the Canvas (NOT inside it — see
// `tooltipDomRef` above).
//
// Markers are hidden when the live camera is essentially AT the saved
// position — see MARKER_HIDE_DIST.
export default function SavedViewMarkers() {
  const on = useAtomValue(savedViewMarkersOnAtom)
  const views = useAtomValue(savedViewsAtom)
  const hoveredId = useAtomValue(hoveredSavedViewIdAtom)
  const setHoveredId = useSetAtom(hoveredSavedViewIdAtom)
  const hoveredView = useMemo(
    () => (hoveredId ? views.find((v) => v.id === hoveredId) : null),
    [hoveredId, views],
  )
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
      <TooltipPositioner hoveredView={hoveredView} />
    </>
  )
}

// Render the tooltip HTML. Mount this OUTSIDE the R3F `<Canvas>` —
// react-dom's createPortal can't safely escape the R3F reconciler from
// inside Canvas (it tries to route `<div>` etc. through Three.js,
// throwing "R3F: Div is not part of the THREE namespace"). Picks up
// hover state from the atom; position is animated by `TooltipPositioner`
// inside the Canvas via `tooltipDomRef`.
export function SavedViewMarkersOverlay() {
  const on = useAtomValue(savedViewMarkersOnAtom)
  const hoveredId = useAtomValue(hoveredSavedViewIdAtom)
  const views = useAtomValue(savedViewsAtom)
  const ref = useRef(null)
  const hoveredView = useMemo(
    () => (hoveredId ? views.find((v) => v.id === hoveredId) : null),
    [hoveredId, views],
  )
  useEffect(() => {
    tooltipDomRef.current = ref.current
    return () => { tooltipDomRef.current = null }
  }, [])
  if (!on) return null
  return (
    <div
      ref={ref}
      className="svm-tooltip"
      aria-hidden={!hoveredView}
      style={{ transform: 'translate3d(-9999px, -9999px, 0)' }}
    >
      {hoveredView?.thumbnail && (
        <img className="svm-tooltip__img" src={hoveredView.thumbnail} alt="" />
      )}
      <div className="svm-tooltip__name">{hoveredView?.name || 'View'}</div>
    </div>
  )
}

function SavedViewMarker({ view, isHovered, onHover }) {
  const liveScene = useThree((s) => s.scene)

  const position = useMemo(() => {
    const p = view?.camera?.position
    return Array.isArray(p) ? new Vector3(p[0], p[1], p[2]) : null
  }, [view?.camera?.position])

  const quaternion = useMemo(() => {
    const q = view?.camera?.quaternion
    return Array.isArray(q) ? new Quaternion(q[0], q[1], q[2], q[3]) : null
  }, [view?.camera?.quaternion])

  const opacityRef = useRef(1)
  const groupRef = useRef(null)
  const lineRef = useRef(null)
  const pinRef = useRef(null)

  // Lazy focal-world resolution. Tries the raycast on mount; falls back to
  // the ellipsoid drop on miss (sky tap, tileset not loaded for region).
  // Cached on a ref so we don't re-raycast every render.
  const focalWorldRef = useRef(null)
  useEffect(() => {
    if (!position) return
    const hit = resolveFocalWorld(view, liveScene)
    focalWorldRef.current = hit ?? ellipsoidDrop(position)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.id])

  useFrame(({ camera }) => {
    if (!groupRef.current || !position) return
    // Hide the marker when the live camera is essentially AT the saved
    // position — typical case: page just loaded with restored saved
    // camera. Drawing the marker on top of the user's own viewpoint
    // eclipses the whole frame.
    const distToMarker = camera.position.distanceTo(position)
    const tooClose = distToMarker < MARKER_HIDE_DIST
    if (tooClose) {
      if (groupRef.current.visible) groupRef.current.visible = false
      return
    } else if (!groupRef.current.visible) {
      groupRef.current.visible = true
    }
    // Distance-based scale: grow with camera distance so the marker
    // reads as the same apparent size whether the user is 500m away
    // or 50km up. Hover gives a 15% bump for affordance.
    const bodyScale =
      Math.max(MARKER_SCALE_MIN, distToMarker * MARKER_SCALE_PER_METER) *
      (isHovered ? 1.15 : 1)
    groupRef.current.scale.setScalar(bodyScale)
    // Pin scales independently — it uses its own ground-position
    // distance, which differs from the marker's distance whenever
    // the saved view was looking down at a foreshortened angle.
    if (pinRef.current) {
      const fw = focalWorldRef.current
      const distToPin = fw ? camera.position.distanceTo(fw) : distToMarker
      pinRef.current.scale.setScalar(
        Math.max(PIN_SCALE_MIN, distToPin * PIN_SCALE_PER_METER),
      )
    }
    const altitude = Math.max(camera.position.length() - EARTH_RADIUS_M, 0)
    const op = altitudeToOpacity(altitude)
    if (op === opacityRef.current) return
    opacityRef.current = op
    groupRef.current.traverse((child) => {
      if (child.material) {
        child.material.transparent = true
        child.material.opacity = op
      }
    })
    if (lineRef.current?.material) lineRef.current.material.opacity = op * 0.5
    if (pinRef.current?.material) pinRef.current.material.opacity = op * 0.9
  })

  if (!position || !quaternion) return null
  const focalWorld = focalWorldRef.current

  const handleClick = (e) => {
    e.stopPropagation()
    if (opacityRef.current < 0.05) return
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
        // Initial scale; useFrame overwrites this on the next tick with
        // the distance-based size. We start at MIN so the first frame
        // (before useFrame fires) doesn't show a pop-in at scale=1.
        scale={MARKER_SCALE_MIN}
        onClick={handleClick}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
      >
        {/* Body */}
        <mesh>
          <boxGeometry args={[1.2, 0.7, 0.4]} />
          <meshBasicMaterial color={ACCENT} toneMapped={false} />
        </mesh>
        {/* Lens barrel */}
        <mesh position={[0, 0, -0.35]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.22, 0.18, 0.3, 16]} />
          <meshBasicMaterial color="#1a1715" toneMapped={false} />
        </mesh>
        {/* Lens glass */}
        <mesh position={[0, 0, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.14, 0.14, 0.04, 16]} />
          <meshBasicMaterial color="#0a0908" toneMapped={false} />
        </mesh>
        {/* Viewfinder bump */}
        <mesh position={[0.3, 0.4, 0]}>
          <boxGeometry args={[0.3, 0.15, 0.2]} />
          <meshBasicMaterial color={ACCENT} toneMapped={false} />
        </mesh>
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
