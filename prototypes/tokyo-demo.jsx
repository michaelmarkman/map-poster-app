import React, { useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo, forwardRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import {
  EffectComposer as WrappedEffectComposer
} from '@react-three/postprocessing'
import {
  NormalPass,
  EffectMaterial, EffectAttribute, BlendFunction, Effect,
  ToneMappingMode
} from 'postprocessing'
import { HalfFloatType, Uniform, Vector2 } from 'three'

import {
  GlobeControls,
  TilesRenderer,
  TilesPlugin,
  TilesAttributionOverlay
} from '3d-tiles-renderer/r3f'
import {
  GoogleCloudAuthPlugin,
  GLTFExtensionsPlugin,
  TileCompressionPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin
} from '3d-tiles-renderer/plugins'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { Mesh, BufferGeometry } from 'three'

import {
  Atmosphere,
  AerialPerspective
} from '@takram/three-atmosphere/r3f'
import { Clouds } from '@takram/three-clouds/r3f'
import { Geodetic, PointOfView, radians } from '@takram/three-geospatial'
import { Dithering, LensFlare } from '@takram/three-geospatial-effects/r3f'

// ─── Constants ────────────────────────────────────────────────
const API_KEY = localStorage.getItem('mapposter_google_key') || 'AIzaSyCIsBRv6ZcKXhIecWHAOOLkwmLKQcsocKg'

// Tokyo params from the storybook story
const LONGITUDE = 139.8146
const LATITUDE = 35.7455
const HEADING = -110
const PITCH = -9
const DISTANCE = 1000
const COVERAGE = 0.35
const EXPOSURE = 10
const DAY_OF_YEAR = 170
const TIME_OF_DAY = 7.5

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')

// ─── Custom EffectComposer (forces HalfFloat normal buffer) ──
function EffectComposer({ children, ...props }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const composer = ref.current
    if (!composer) return
    for (const pass of composer.passes) {
      if (pass instanceof NormalPass) {
        pass.renderTarget.texture.type = HalfFloatType
        pass.renderTarget.texture.needsUpdate = true
        break
      }
    }
  }, [])
  return (
    <WrappedEffectComposer ref={ref} enableNormalPass {...props}>
      {children}
    </WrappedEffectComposer>
  )
}

// ─── Creased Normals Plugin (sync version of TileCreasedNormalsPlugin) ──
class TileCreasedNormalsPlugin {
  constructor({ creaseAngle = 30 * Math.PI / 180 } = {}) {
    this.creaseAngle = creaseAngle
  }
  processTileModel(scene) {
    scene.traverse(obj => {
      if (obj instanceof Mesh && obj.geometry instanceof BufferGeometry) {
        try {
          obj.geometry = toCreasedNormals(obj.geometry, this.creaseAngle)
        } catch (e) {
          // Some tile geometries may not support this — skip them
        }
      }
    })
  }
}

// ─── Globe (Google 3D Tiles) ─────────────────────────────────
function Globe({ children }) {
  return (
    <TilesRenderer
      key={API_KEY}
      url={`https://tile.googleapis.com/v1/3dtiles/root.json?key=${API_KEY}`}
    >
      <TilesPlugin
        plugin={GoogleCloudAuthPlugin}
        args={{ apiToken: API_KEY, autoRefreshToken: true }}
      />
      <TilesPlugin plugin={GLTFExtensionsPlugin} dracoLoader={dracoLoader} />
      <TilesPlugin plugin={TileCompressionPlugin} />
      <TilesPlugin plugin={UpdateOnChangePlugin} />
      <TilesPlugin plugin={TilesFadePlugin} />
      <TilesPlugin plugin={TileCreasedNormalsPlugin} args={{ creaseAngle: 30 * Math.PI / 180 }} />
      {children}
      <TilesAttributionOverlay />
    </TilesRenderer>
  )
}

// ─── Date from day-of-year + time-of-day ─────────────────────
function getDate(dayOfYear, timeOfDay, longitude) {
  const year = new Date().getFullYear()
  const epoch = Date.UTC(year, 0, 1, 0, 0, 0, 0)
  const offset = longitude / 15
  return epoch + (Math.floor(dayOfYear) * 24 + timeOfDay - offset) * 3600000
}

// ─── Custom Depth-of-Field (UV-based, reads depth at focal point) ─────
// Two-pass Gaussian blur weighted by circle-of-confusion.
// CoC compares view-Z at each pixel to view-Z at the focal UV point.
// This naturally tracks the scene as camera orbits.

const DOF_FRAG = /* glsl */`
#define getViewZ(d) perspectiveDepthToViewZ(d, cameraNear, cameraFar)
uniform vec2 focalPoint;
uniform float depthRange;
uniform float maxBlur;
uniform float colorPop;

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  // Skip sky pixels (depth ≈ 1.0 = far plane)
  float rawDepth = readDepth(uv);
  if (rawDepth > 0.999) { outputColor = inputColor; return; }

  float viewZ = getViewZ(rawDepth);
  float focalZ = getViewZ(readDepth(focalPoint));
  float relDiff = abs(viewZ - focalZ) / abs(focalZ);
  float coc = smoothstep(0.0, depthRange, relDiff) * maxBlur;

  if (coc < 0.5) { outputColor = inputColor; return; }

  vec2 texelSize = 1.0 / vec2(textureSize(inputBuffer, 0));
  float s = coc / 8.0;
  vec4 sum = inputColor * 0.16;
  float tw = 0.16;
  for (int i = -4; i <= 4; i++) {
    for (int j = -4; j <= 4; j++) {
      if (i == 0 && j == 0) continue;
      float fi = float(i), fj = float(j);
      float w = exp(-(fi*fi + fj*fj) / (s*s*2.0 + 0.01));
      sum += texture(inputBuffer, uv + vec2(fi, fj) * texelSize * s) * w;
      tw += w;
    }
  }
  vec4 color = sum / tw;

  // Subtle color pop: boost saturation in focus zone only
  float focusAmount = 1.0 - smoothstep(0.0, depthRange, relDiff);
  float pop = focusAmount * colorPop;
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(vec3(luma), color.rgb, 1.0 + pop * 0.5);

  outputColor = color;
}
`;

class CustomDofEffect extends Effect {
  constructor({ focalPoint = [0.5, 0.5], depthRange = 0.06, maxBlur = 20, colorPop = 0.5 } = {}) {
    super('CustomDofEffect', DOF_FRAG, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ['focalPoint', new Uniform(new Vector2(focalPoint[0], focalPoint[1]))],
        ['depthRange', new Uniform(depthRange)],
        ['maxBlur', new Uniform(maxBlur)],
        ['colorPop', new Uniform(colorPop)]
      ])
    })
  }
}

// Mutable state
const dofState = {
  on: true,
  focalUV: [0.5, 0.5],  // screen UV — shader reads depth here each frame
  tightness: 30,         // 0-100 — how narrow the focus zone is
  blur: 40,              // 0-100 — max blur intensity
  colorPop: 50,          // 0-100 — saturation boost in focus zone
}

// ─── R3F wrapper for our custom DoF effect ───────────────────
const CustomDof = forwardRef(function CustomDof(_, ref) {
  const effect = useMemo(() => new CustomDofEffect({
    focalPoint: dofState.focalUV,
    depthRange: 0.06,
    maxBlur: 20,
    colorPop: 0.5
  }), [])
  React.useImperativeHandle(ref, () => effect, [effect])
  return <primitive object={effect} dispose={null} />
})

// ─── Click-to-focus handler ──────────────────────────────────
function ClickToFocus() {
  const { gl } = useThree()

  useEffect(() => {
    const canvas = gl.domElement
    let downPos = null

    const onDown = (e) => { downPos = { x: e.clientX, y: e.clientY } }
    const onUp = (e) => {
      if (!downPos || !dofState.on) return
      const dx = e.clientX - downPos.x, dy = e.clientY - downPos.y
      downPos = null
      if (Math.sqrt(dx * dx + dy * dy) > 8) return

      const rect = canvas.getBoundingClientRect()
      const uvx = (e.clientX - rect.left) / rect.width
      const uvy = 1.0 - (e.clientY - rect.top) / rect.height // flip Y for GL

      dofState.focalUV = [uvx, uvy]
      window.dispatchEvent(new CustomEvent('dof-changed'))

      // Show reticle at click position
      const reticle = document.getElementById('focus-reticle')
      if (reticle) {
        reticle.style.left = e.clientX + 'px'
        reticle.style.top = e.clientY + 'px'
        reticle.classList.add('visible')
        clearTimeout(reticle._fade)
        reticle._fade = setTimeout(() => reticle.classList.remove('visible'), 2000)
      }
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)
    return () => { canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp) }
  }, [gl])

  return null
}

// ─── Main Scene ──────────────────────────────────────────────
function Scene() {
  const camera = useThree(({ camera }) => camera)
  const composerRef = useRef(null)
  const atmosphereRef = useRef(null)
  const dofRef = useRef(null)

  useLayoutEffect(() => {
    new PointOfView(DISTANCE, radians(HEADING), radians(PITCH)).decompose(
      new Geodetic(radians(LONGITUDE), radians(LATITUDE)).toECEF(),
      camera.position,
      camera.quaternion,
      camera.up
    )
  }, [camera])

  const fixedDate = useRef(new Date(getDate(DAY_OF_YEAR, TIME_OF_DAY, LONGITUDE)))

  useFrame(({ gl }) => {
    gl.toneMappingExposure = EXPOSURE
    atmosphereRef.current?.updateByDate(fixedDate.current)

    // Push mutable DoF state into custom effect every frame
    const fx = dofRef.current
    if (fx && fx.uniforms) {
      fx.uniforms.get('focalPoint').value.set(dofState.focalUV[0], dofState.focalUV[1])
      // depthRange: 0=wide focus, 100=razor thin
      // Quadratic curve gives lots of room in the 0-50% range
      const t = dofState.tightness / 100
      fx.uniforms.get('depthRange').value = 3.0 * (1.0 - t) * (1.0 - t) + 0.005
      fx.uniforms.get('maxBlur').value = 2 + (dofState.blur / 100) * 48
      fx.uniforms.get('colorPop').value = dofState.colorPop / 100
    }

    const composer = composerRef.current
    if (composer) {
      composer.passes.forEach(pass => {
        if (pass.fullscreenMaterial instanceof EffectMaterial) {
          pass.fullscreenMaterial.adoptCameraSettings(camera)
        }
      })
    }
  })

  return (
    <Atmosphere ref={atmosphereRef} correctAltitude>
      <Globe>
        <GlobeControls enableDamping adjustHeight={false} maxAltitude={Math.PI * 0.55} />
      </Globe>
      <ClickToFocus />

      <EffectComposer ref={composerRef} multisampling={0}>
        <Clouds coverage={COVERAGE} qualityPreset="high" shadow-farScale={0.25} localWeatherVelocity={[0.001, 0]} />
        <AerialPerspective sky sunLight skyLight correctGeometricError albedoScale={2 / Math.PI} />
        <CustomDof ref={dofRef} />
        <LensFlare />
        <ToneMapping mode={ToneMappingMode.AGX} />
        <SMAA />
        <Dithering />
      </EffectComposer>
    </Atmosphere>
  )
}

// ─── Dock Fader ──────────────────────────────────────────────
function Fader({ label, value, min, max, format, onChange }) {
  const trackRef = useRef(null)
  const pct = ((value - min) / (max - min)) * 100
  const display = format ? format(value) : Math.round(value)

  const onPointerDown = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    const track = trackRef.current
    if (!track) return
    const update = (ev) => {
      const rect = track.getBoundingClientRect()
      const p = Math.max(0, Math.min(100, ((rect.bottom - ev.clientY) / rect.height) * 100))
      onChange(min + (p / 100) * (max - min))
    }
    update(e)
    const onMove = (ev) => update(ev)
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [min, max, onChange])

  return (
    <div className="df" onPointerDown={onPointerDown}>
      <div className="df-label">{label}</div>
      <div className="df-track" ref={trackRef} style={{ '--v': pct + '%', height: 56 }}>
        <div className="df-thumb" style={{ '--v': pct + '%', opacity: 0.35 }} />
      </div>
      <div className="df-val">{display}</div>
    </div>
  )
}

// ─── Dock UI ─────────────────────────────────────────────────
function Dock() {
  const [, forceUpdate] = useState(0)

  // Re-render dock when click-to-focus fires
  useEffect(() => {
    const handler = () => forceUpdate(n => n + 1)
    window.addEventListener('dof-changed', handler)
    return () => window.removeEventListener('dof-changed', handler)
  }, [])

  return (
    <div className="dock">
      <div className="dg pinned">
        <div className="pin-dot" />
        <div className="dg-label">depth of field</div>
        <div className="dg-icon">◎</div>
        <Fader
          label="tight"
          value={dofState.tightness}
          min={0} max={100}
          format={v => Math.round(v) + '%'}
          onChange={v => { dofState.tightness = v; forceUpdate(n => n + 1) }}
        />
        <Fader
          label="blur"
          value={dofState.blur}
          min={0} max={100}
          format={v => Math.round(v) + '%'}
          onChange={v => { dofState.blur = v; forceUpdate(n => n + 1) }}
        />
        <Fader
          label="pop"
          value={dofState.colorPop}
          min={0} max={100}
          format={v => Math.round(v) + '%'}
          onChange={v => { dofState.colorPop = v; forceUpdate(n => n + 1) }}
        />
      </div>
    </div>
  )
}

// ─── App ─────────────────────────────────────────────────────
function App() {
  return (
    <>
      <Canvas gl={{ depth: false }}>
        <Scene />
      </Canvas>
      <Dock />
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
