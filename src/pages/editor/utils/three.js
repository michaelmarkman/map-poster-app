import { Vector3 } from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'

// Shared DRACO loader — used by the GLTFExtensionsPlugin to decode compressed
// geometry in photogrammetry tiles. Module singleton so we don't pay the cost
// of spinning up a fresh decoder worker for every TilesRenderer mount.
export const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')

// Tone-mapping exposure set on the WebGL renderer each frame (see Scene).
export const EXPOSURE = 10

// Reused scratch vector for the sun-rotation zenith calculation
// (avoids per-frame alloc in Scene.useFrame).
export const _sunZenith = new Vector3()
