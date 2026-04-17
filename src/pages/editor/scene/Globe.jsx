import { Vector2 } from 'three'
import { Mesh, BufferGeometry } from 'three'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { TilesRenderer, TilesPlugin } from '3d-tiles-renderer/r3f'
import {
  GoogleCloudAuthPlugin,
  GLTFExtensionsPlugin,
  TileCompressionPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin,
} from '3d-tiles-renderer/plugins'
import { dracoLoader } from '../utils/three'

// Google 3D Tiles — client-side OK; do NOT use for Gemini.
const API_KEY = localStorage.getItem('mapposter_google_key') || 'AIzaSyCIsBRv6ZcKXhIecWHAOOLkwmLKQcsocKg'

// Applies creased normals to every mesh in a loaded tile. Photogrammetry
// tiles ship with vertex normals that result in overly smooth surfaces —
// this crease angle recovers hard edges on buildings and infrastructure.
class TileCreasedNormalsPlugin {
  constructor({ creaseAngle = 30 * Math.PI / 180 } = {}) {
    this.creaseAngle = creaseAngle
  }
  processTileModel(scene) {
    scene.traverse(obj => {
      if (obj instanceof Mesh && obj.geometry instanceof BufferGeometry) {
        try { obj.geometry = toCreasedNormals(obj.geometry, this.creaseAngle) } catch (e) {}
      }
    })
  }
}

// Bumps anisotropic filtering on all tile textures so distant roads, rooftops,
// and signage stay crisp instead of shimmering into aliasing.
class TextureAnisotropyPlugin {
  constructor({ anisotropy = 16 } = {}) {
    this.anisotropy = anisotropy
  }
  processTileModel(scene) {
    scene.traverse(obj => {
      if (obj.isMesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const mat of mats) {
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) {
            const tex = mat[key]
            if (tex) {
              tex.anisotropy = this.anisotropy
              tex.needsUpdate = true
            }
          }
        }
      }
    })
  }
}

// Plugin that tunes fidelity-related tile renderer options:
// - Patches setResolutionFromRenderer to use true framebuffer size (dpr-aware)
// - Bumps LRU cache so detailed tiles aren't evicted
// - Keeps active tiles loaded even when partially off-frustum
class FidelityPlugin {
  constructor() {
    this._v = new Vector2()
  }
  init(tiles) {
    const self = this
    tiles.setResolutionFromRenderer = function(camera, renderer) {
      renderer.getDrawingBufferSize(self._v)
      return this.setResolution(camera, self._v.x, self._v.y)
    }
    // Bigger cache — keep more detailed tiles in memory
    tiles.lruCache.minSize = 12000
    tiles.lruCache.maxSize = 16000
    tiles.lruCache.minBytesSize = 0.8 * 1024 * 1024 * 1024 // 0.8 GB
    tiles.lruCache.maxBytesSize = 1.2 * 1024 * 1024 * 1024 // 1.2 GB
    // Don't unload tiles just because they scroll off-screen briefly
    tiles.displayActiveTiles = true
  }
}

export default function Globe({ children }) {
  return (
    <TilesRenderer key={API_KEY} url={`https://tile.googleapis.com/v1/3dtiles/root.json?key=${API_KEY}`} errorTarget={2}>
      <TilesPlugin plugin={FidelityPlugin} />
      <TilesPlugin plugin={GoogleCloudAuthPlugin} args={{ apiToken: API_KEY, autoRefreshToken: true }} />
      <TilesPlugin plugin={GLTFExtensionsPlugin} dracoLoader={dracoLoader} />
      <TilesPlugin plugin={TileCompressionPlugin} />
      <TilesPlugin plugin={UpdateOnChangePlugin} />
      <TilesPlugin plugin={TilesFadePlugin} />
      <TilesPlugin plugin={TileCreasedNormalsPlugin} args={{ creaseAngle: 30 * Math.PI / 180 }} />
      <TilesPlugin plugin={TextureAnisotropyPlugin} args={{ anisotropy: 16 }} />
      {children}
    </TilesRenderer>
  )
}
