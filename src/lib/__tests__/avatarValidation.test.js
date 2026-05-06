import { describe, it, expect } from 'vitest'
import { validateAvatarFile, MAX_AVATAR_SIZE } from '../avatarValidation'

// Helper: build a File-shaped object. We don't need the actual binary —
// validateAvatarFile only reads .type and .size. Real File objects work
// in the browser; this shape is enough for unit tests.
const file = (type, size, name = 'avatar') => ({ type, size, name })

describe('validateAvatarFile', () => {
  it('accepts JPG and returns "jpg" extension', () => {
    expect(validateAvatarFile(file('image/jpeg', 100))).toBe('jpg')
  })

  it('accepts PNG and returns "png" extension', () => {
    expect(validateAvatarFile(file('image/png', 100))).toBe('png')
  })

  it('accepts WebP and returns "webp" extension', () => {
    expect(validateAvatarFile(file('image/webp', 100))).toBe('webp')
  })

  it('accepts GIF and returns "gif" extension', () => {
    expect(validateAvatarFile(file('image/gif', 100))).toBe('gif')
  })

  it('rejects non-image MIME types — XSS via stored HTML', () => {
    expect(() => validateAvatarFile(file('text/html', 100))).toThrow(/JPG, PNG, WebP, or GIF/)
    expect(() => validateAvatarFile(file('application/pdf', 100))).toThrow(/JPG, PNG, WebP, or GIF/)
    expect(() => validateAvatarFile(file('application/javascript', 100))).toThrow(/JPG, PNG, WebP, or GIF/)
  })

  it('rejects unsupported image types (svg, bmp, tiff, avif, heic)', () => {
    // SVG is the dangerous one — an inline <script> in an SVG served as
    // image/svg+xml executes when embedded via <img>. Reject explicitly.
    expect(() => validateAvatarFile(file('image/svg+xml', 100))).toThrow()
    expect(() => validateAvatarFile(file('image/bmp', 100))).toThrow()
    expect(() => validateAvatarFile(file('image/tiff', 100))).toThrow()
    expect(() => validateAvatarFile(file('image/avif', 100))).toThrow()
    expect(() => validateAvatarFile(file('image/heic', 100))).toThrow()
  })

  it('rejects empty / corrupt MIME', () => {
    expect(() => validateAvatarFile(file('', 100))).toThrow()
    expect(() => validateAvatarFile({})).toThrow(/missing the file/)
    expect(() => validateAvatarFile(null)).toThrow(/missing the file/)
    expect(() => validateAvatarFile(undefined)).toThrow(/missing the file/)
  })

  it('accepts exactly at the 5 MB cap', () => {
    expect(validateAvatarFile(file('image/png', MAX_AVATAR_SIZE))).toBe('png')
  })

  it('rejects 1 byte over the cap', () => {
    expect(() => validateAvatarFile(file('image/png', MAX_AVATAR_SIZE + 1)))
      .toThrow(/too large/)
  })

  it('rejects 50 MB upload with the size in the message', () => {
    expect(() => validateAvatarFile(file('image/png', 50 * 1024 * 1024)))
      .toThrow(/50 MB/)
  })

  it('does NOT trust the filename — extension comes from MIME', () => {
    // The classic XSS shape: filename suggests one type, MIME is image.
    // The returned extension follows the MIME, so the storage path won't
    // become avatar.html / avatar.svg / etc.
    expect(validateAvatarFile({ type: 'image/png', size: 100, name: 'evil.html' })).toBe('png')
    expect(validateAvatarFile({ type: 'image/jpeg', size: 100, name: 'sneaky.svg' })).toBe('jpg')
  })
})
