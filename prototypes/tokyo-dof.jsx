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

// ─── Two-pass DoF (identical to Cesium shader-fx-3d) ─────────
// CoC compares view-Z at each pixel vs view-Z at focal UV.
// Relative depth difference makes it zoom-independent.

const DOF_COC = /* glsl */`
#define getViewZ(d) perspectiveDepthToViewZ(d, cameraNear, cameraFar)
float computeCoC(vec2 sampleUV, vec2 fp, float dr, float mb) {
  float d = readDepth(sampleUV);
  if (d > 0.999) return 0.0; // sky / far plane — don't blur
  float focalD = readDepth(fp);
  if (focalD > 0.999) return 0.0; // focal point is sky — don't blur anything
  float viewZ = getViewZ(d);
  float focalZ = getViewZ(focalD);
  float relDiff = abs(viewZ - focalZ) / abs(focalZ);
  return smoothstep(0.0, dr, relDiff) * mb;
}
`

// Pass 1: Horizontal 12-tap Gaussian blur
const DOF_H_FRAG = /* glsl */`
uniform vec2 focalPoint;
uniform float depthRange;
uniform float maxBlur;
${DOF_COC}
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  float coc = computeCoC(uv, focalPoint, depthRange, maxBlur);
  if (coc < 0.5) { outputColor = inputColor; return; }
  float texelX = 1.0 / float(textureSize(inputBuffer, 0).x);
  float s = coc / 12.0;
  vec4 sum = texture(inputBuffer, uv) * 0.0797;
  float tw = 0.0797;
  float offsets[12] = float[](1.,2.,3.,4.,5.,6.,7.,8.,9.,10.,11.,12.);
  float weights[12] = float[](0.0782,0.0736,0.0666,0.0579,0.0484,0.0389,0.0300,0.0223,0.0159,0.0109,0.0072,0.0045);
  for (int i = 0; i < 12; i++) {
    float o = offsets[i] * s * texelX;
    float w = weights[i];
    sum += texture(inputBuffer, uv + vec2(o, 0.0)) * w;
    sum += texture(inputBuffer, uv - vec2(o, 0.0)) * w;
    tw += w * 2.0;
  }
  outputColor = sum / tw;
}
`

// Pass 2: Vertical 12-tap Gaussian blur + color pop
const DOF_V_FRAG = /* glsl */`
uniform vec2 focalPoint;
uniform float depthRange;
uniform float maxBlur;
uniform float colorPop;
uniform float globalPop;
${DOF_COC}
void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  float coc = computeCoC(uv, focalPoint, depthRange, maxBlur);
  float texelY = 1.0 / float(textureSize(inputBuffer, 0).y);
  float s = max(coc / 12.0, 0.0);
  vec4 sum = texture(inputBuffer, uv) * 0.0797;
  float tw = 0.0797;
  float offsets[12] = float[](1.,2.,3.,4.,5.,6.,7.,8.,9.,10.,11.,12.);
  float weights[12] = float[](0.0782,0.0736,0.0666,0.0579,0.0484,0.0389,0.0300,0.0223,0.0159,0.0109,0.0072,0.0045);
  for (int i = 0; i < 12; i++) {
    float o = offsets[i] * s * texelY;
    float w = weights[i];
    sum += texture(inputBuffer, uv + vec2(0.0, o)) * w;
    sum += texture(inputBuffer, uv - vec2(0.0, o)) * w;
    tw += w * 2.0;
  }
  vec4 color = sum / tw;

  // Color pop (matches Cesium shader-fx-3d)
  float focusAmount = 1.0 - computeCoC(uv, focalPoint, depthRange, 1.0);
  float popMask = mix(focusAmount, 1.0, globalPop);
  float pop = popMask * colorPop;
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));

  // Saturation boost
  color.rgb = mix(vec3(luma), color.rgb, 1.0 + pop * 0.7);
  // Contrast — protect shadows
  float shadow = smoothstep(0.0, 0.25, luma);
  color.rgb = mix(color.rgb, mix(vec3(0.5), color.rgb, 1.0 + pop * 0.4), shadow);
  color.r += pop * 0.02 * shadow;
  color.g += pop * 0.01 * shadow;
  // Desaturate blurred areas
  float blurAmt = 1.0 - focusAmount;
  color.rgb = mix(color.rgb, vec3(luma), blurAmt * 0.1);

  outputColor = color;
}
`

class DofHEffect extends Effect {
  constructor(fp, dr, mb) {
    super('DofHEffect', DOF_H_FRAG, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ['focalPoint', new Uniform(new Vector2(fp[0], fp[1]))],
        ['depthRange', new Uniform(dr)],
        ['maxBlur', new Uniform(mb)]
      ])
    })
  }
}

class DofVEffect extends Effect {
  constructor(fp, dr, mb, cp, gp) {
    super('DofVEffect', DOF_V_FRAG, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map([
        ['focalPoint', new Uniform(new Vector2(fp[0], fp[1]))],
        ['depthRange', new Uniform(dr)],
        ['maxBlur', new Uniform(mb)],
        ['colorPop', new Uniform(cp)],
        ['globalPop', new Uniform(gp)]
      ])
    })
  }
}

// Mutable state — no re-renders needed
const dofState = {
  on: true,
  focalUV: [0.5, 0.5],
  tightness: 50,
  blur: 40,
  colorPop: 50,
  globalPop: false,
}

function dofDepthRange(tightness) {
  // 0% → 100 (everything sharp), 50% → ~2.2, 100% → 0.1
  // Linear interpolation in log space for a gentle curve
  const t = tightness / 100
  if (t < 0.01) return 100.0
  return Math.exp((1.0 - t) * Math.log(50) + t * Math.log(0.1))
}
function dofMaxBlur(blur) {
  return 2 + (blur / 100) * 48
}

// ─── R3F wrappers ────────────────────────────────────────────
const DofH = forwardRef(function DofH(_, ref) {
  const effect = useMemo(() => new DofHEffect(
    dofState.focalUV,
    dofDepthRange(dofState.tightness),
    dofMaxBlur(dofState.blur)
  ), [])
  React.useImperativeHandle(ref, () => effect, [effect])
  return <primitive object={effect} dispose={null} />
})

const DofV = forwardRef(function DofV(_, ref) {
  const effect = useMemo(() => new DofVEffect(
    dofState.focalUV,
    dofDepthRange(dofState.tightness),
    dofMaxBlur(dofState.blur),
    dofState.colorPop / 100,
    dofState.globalPop ? 1.0 : 0.0
  ), [])
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
      console.log('[focus] UV:', uvx.toFixed(3), uvy.toFixed(3))
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
  const dofHRef = useRef(null)
  const dofVRef = useRef(null)

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

    // Push mutable DoF state into both passes every frame
    const dr = dofDepthRange(dofState.tightness)
    const mb = dofMaxBlur(dofState.blur)
    for (const fx of [dofHRef.current, dofVRef.current]) {
      if (!fx) continue
      fx.uniforms.get('focalPoint').value.set(dofState.focalUV[0], dofState.focalUV[1])
      fx.uniforms.get('depthRange').value = dr
      fx.uniforms.get('maxBlur').value = mb
    }
    const vfx = dofVRef.current
    if (vfx) {
      vfx.uniforms.get('colorPop').value = dofState.colorPop / 100
      vfx.uniforms.get('globalPop').value = dofState.globalPop ? 1.0 : 0.0
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
        <DofH ref={dofHRef} />
        <DofV ref={dofVRef} />
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
