// Avatar upload validation. Pulled out of AuthContext.uploadAvatar so the
// security invariants (no script masquerading as image, size cap, no path
// traversal via filename) can be unit-tested without spinning up the full
// AuthProvider + Supabase client.
//
// Returns the canonical extension to use in the storage path (derived from
// MIME, NOT from the filename). Throws with friendly copy on rejection.

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}
export const MAX_AVATAR_SIZE = 5 * 1024 * 1024

export function validateAvatarFile(file) {
  if (!file || typeof file !== 'object' || typeof file.type !== 'string' || typeof file.size !== 'number') {
    throw new Error('Avatar upload is missing the file.')
  }
  if (!ALLOWED.has(file.type)) {
    throw new Error('Avatar must be a JPG, PNG, WebP, or GIF image.')
  }
  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error(`Avatar is too large (${Math.round(file.size / 1024 / 1024)} MB) — max is 5 MB.`)
  }
  return EXT_BY_TYPE[file.type]
}
