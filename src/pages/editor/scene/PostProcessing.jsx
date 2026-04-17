import { useRef, useLayoutEffect } from 'react'
import { useAtomValue } from 'jotai'
import {
  EffectComposer as WrappedEffectComposer,
  Bloom,
  Vignette,
  SSAO,
  SMAA,
  ToneMapping,
} from '@react-three/postprocessing'
import { NormalPass, ToneMappingMode } from 'postprocessing'
import { HalfFloatType } from 'three'
import { CustomDof } from './CustomDofEffect'
import { IS_MOBILE, bloomAtom, ssaoAtom, vignetteAtom } from '../atoms/scene'

// Custom EffectComposer wrapper — the @react-three/postprocessing composer
// defaults its normal buffer to 8-bit unsigned, which banding-artefacts when
// SSAO reads it back. Swap to HalfFloat so normals keep sub-byte precision.
// Ported verbatim from poster-v3-ui.jsx:108-126.
function EffectComposer({ children, composerRef, ...props }) {
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
    if (composerRef) composerRef.current = composer
  }, [composerRef])
  return (
    <WrappedEffectComposer ref={ref} enableNormalPass {...props}>
      {children}
    </WrappedEffectComposer>
  )
}

// PostProcessing mounts the custom composer and the whole effect chain.
// Scene owns the composerRef + dofRef (read inside its useFrame) and passes
// them down. Bloom/SSAO/Vignette toggles come from atoms — their mount/unmount
// triggers a re-render, which is cheap because it doesn't happen at frame
// rate.
//
// `children` is where Scene mounts the takram passes (Clouds, AerialPerspective,
// Dithering, LensFlare) that need to live inside the composer.
export default function PostProcessing({ composerRef, dofRef, children }) {
  const bloom = useAtomValue(bloomAtom)
  const ssao = useAtomValue(ssaoAtom)
  const vignette = useAtomValue(vignetteAtom)

  return (
    <EffectComposer composerRef={composerRef} multisampling={0}>
      {children}
      {bloom.on && <Bloom intensity={0.5} luminanceThreshold={0.7} luminanceSmoothing={0.3} />}
      {ssao.on && <SSAO intensity={2} radius={0.05} luminanceInfluence={0.5} />}
      {vignette.on && <Vignette darkness={0.5} offset={0.3} />}
      {/* LensFlare + SMAA are decorative passes that cost frame time
          mobile GPUs don't have to spare. Dithering stays (cheap
          gradient fix) and ToneMapping stays (required for HDR
          output). CustomDoF is the core of the poster look, so it
          stays everywhere. */}
      <ToneMapping mode={ToneMappingMode.AGX} />
      <CustomDof ref={dofRef} />
      {!IS_MOBILE && <SMAA />}
    </EffectComposer>
  )
}
