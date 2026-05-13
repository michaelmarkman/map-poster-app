import { Canvas } from '@react-three/fiber'
import { NoToneMapping } from 'three'
import Scene from './Scene'
import Controls from './Controls'
import { IS_MOBILE } from '../atoms/scene'

// dpr: desktop runs the full 2x pixel pipeline. Mobile renders at 1×
// device pixel ratio and lets CSS scale up — on a 3× iPhone screen
// that's a 9× reduction in fragment work compared to native 3×, which
// is the single biggest perf lever for thermal-constrained devices.
// The visible blur from CSS upscaling is comparable to (and softer
// than) the artifacts we'd see from running the full pipeline at 3×
// and hitting the watchdog.
const CANVAS_DPR = IS_MOBILE ? 1 : 2

// MSAA in the WebGL context is wasted on mobile: the postprocessing
// pipeline writes to render targets, so the default-framebuffer AA
// only ever helps the final blit. Disabling it saves the multisample
// resolve cost on every frame.
const GL_BASE = { depth: false, preserveDrawingBuffer: true, toneMapping: NoToneMapping }
const GL_PROPS = IS_MOBILE ? { ...GL_BASE, antialias: false, powerPreference: 'low-power' } : GL_BASE

export default function EditorCanvas() {
  return (
    <Canvas
      // Explicit "always" — matches R3F's default, but iOS Safari is
      // aggressive about throttling rAF on idle WebGL canvases
      // (especially with preserveDrawingBuffer:true, which disables some
      // power optimizations). Scene.jsx ALSO calls invalidate() on every
      // scene-atom change so a throttled loop still picks up time-of-day
      // and tap-to-focus updates within one tick.
      frameloop="always"
      dpr={CANVAS_DPR}
      camera={{ fov: 37.8 }}
      // R3F defaults `renderer.toneMapping` to ACESFilmicToneMapping — which
      // means every material's fragment shader tone-maps (ACES, scaled by
      // `toneMappingExposure = 10`) BEFORE the composer's AGX ToneMapping
      // effect runs again on the result. Two tone-maps stacked with a 10×
      // exposure boost on the first one crushes midtones into grey — the
      // "washed-out" look. Disable renderer tone mapping so AGX in the
      // composer is the sole operator. Exposure (EXPOSURE=10) still feeds
      // AGX via `renderer.toneMappingExposure`.
      gl={GL_PROPS}
      style={{ width: '100%', height: '100%' }}
    >
      <Scene />
      <Controls />
    </Canvas>
  )
}
