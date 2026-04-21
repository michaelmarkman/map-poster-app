import { Canvas } from '@react-three/fiber'
import Scene from './Scene'
import Controls from './Controls'
import { IS_MOBILE } from '../atoms/scene'

// dpr: desktop runs the full 2x pixel pipeline; mobile caps at ~1.5×
// device pixel ratio (so a 3× phone renders at 1.5×, halving fragment
// work — the single biggest perf win on a thermal-throttled device).
const CANVAS_DPR = IS_MOBILE ? Math.min(1.5, window.devicePixelRatio || 1) : 2

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
      gl={{ depth: false, preserveDrawingBuffer: true }}
      style={{ width: '100%', height: '100%' }}
    >
      <Scene />
      <Controls />
    </Canvas>
  )
}
