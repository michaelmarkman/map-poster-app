import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildShareCaption, shareEntry } from '../share'

describe('buildShareCaption', () => {
  it('uses the first comma-separated segment of location', () => {
    expect(buildShareCaption({ location: 'Manhattan, New York, NY' }))
      .toBe('Manhattan. Made with Vedute — vedute.com')
  })

  it('falls back to "Somewhere" when location is missing', () => {
    expect(buildShareCaption({ location: '' }))
      .toBe('Somewhere. Made with Vedute — vedute.com')
    expect(buildShareCaption({}))
      .toBe('Somewhere. Made with Vedute — vedute.com')
    expect(buildShareCaption(null))
      .toBe('Somewhere. Made with Vedute — vedute.com')
  })

  it('trims whitespace around the location', () => {
    expect(buildShareCaption({ location: '  Tokyo  , Japan' }))
      .toBe('Tokyo. Made with Vedute — vedute.com')
  })
})

describe('shareEntry', () => {
  let toasts
  let toastHandler
  let clickedLinks
  let clipboardCalls

  beforeEach(() => {
    toasts = []
    toastHandler = (e) => toasts.push(e.detail)
    window.addEventListener('toast', toastHandler)

    // Stub clipboard. jsdom doesn't ship navigator.clipboard.
    clipboardCalls = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(async (text) => {
          clipboardCalls.push(text)
        }),
      },
    })

    // Intercept anchor.click() so the test can observe download attempts
    // without the browser actually trying to navigate.
    clickedLinks = []
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag)
      if (tag === 'a') {
        el.click = () => clickedLinks.push({ download: el.download, href: el.href })
      }
      return el
    })
  })

  afterEach(() => {
    window.removeEventListener('toast', toastHandler)
    delete navigator.clipboard
    vi.restoreAllMocks()
  })

  it('returns { captionCopied: false } when entry is null/undefined', async () => {
    expect(await shareEntry(null)).toEqual({ captionCopied: false })
    expect(await shareEntry(undefined)).toEqual({ captionCopied: false })
    expect(toasts).toHaveLength(0)
    expect(clipboardCalls).toHaveLength(0)
  })

  it('writes the caption to the clipboard', async () => {
    await shareEntry({ location: 'Tokyo, Japan', filename: 'f', dataUrl: 'data:img' })
    expect(clipboardCalls).toEqual(['Tokyo. Made with Vedute — vedute.com'])
  })

  it('triggers an anchor download with the entry filename', async () => {
    await shareEntry({ filename: 'vedute-tokyo', dataUrl: 'data:img' })
    expect(clickedLinks).toHaveLength(1)
    expect(clickedLinks[0].download).toBe('vedute-tokyo.png')
  })

  it('falls back filename → label → "vedute"', async () => {
    await shareEntry({ label: 'Tokyo', dataUrl: 'data:img' })
    expect(clickedLinks[0].download).toBe('Tokyo.png')
    clickedLinks.length = 0
    await shareEntry({ dataUrl: 'data:img' })
    expect(clickedLinks[0].download).toBe('vedute.png')
  })

  it('toasts "Caption copied · image downloading" on full success', async () => {
    await shareEntry({ filename: 'f', dataUrl: 'data:img' })
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toEqual({
      type: 'success',
      message: 'Caption copied · image downloading',
    })
  })

  it('toasts "Image downloading" when clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })
    await shareEntry({ filename: 'f', dataUrl: 'data:img' })
    expect(toasts[0].message).toBe('Image downloading')
  })

  it('survives a clipboard write that throws (insecure context)', async () => {
    navigator.clipboard.writeText = vi.fn(() => Promise.reject(new Error('NotAllowed')))
    await shareEntry({ filename: 'f', dataUrl: 'data:img' })
    // Download still ran; toast says image only
    expect(clickedLinks).toHaveLength(1)
    expect(toasts[0].message).toBe('Image downloading')
  })

  it('skips download when entry has no dataUrl', async () => {
    await shareEntry({ filename: 'f', dataUrl: null })
    expect(clickedLinks).toHaveLength(0)
    // Toast still fires
    expect(toasts).toHaveLength(1)
  })
})
