import { describe, it, expect } from 'vitest'
import {
  buildGalleryItem,
  buildGalleryEntries,
} from '../utils/galleryDb'

describe('buildGalleryItem', () => {
  it('generates an id and a Date timestamp', () => {
    const item = buildGalleryItem('label', 'fname', 'data:url')
    expect(typeof item.id).toBe('string')
    expect(item.id.length).toBeGreaterThan(5)
    expect(item.time).toBeInstanceOf(Date)
  })

  it('preserves passed opts', () => {
    const item = buildGalleryItem('label', 'fname', 'data:url', {
      batchId: 'b1',
      batchLabel: 'Batch 1',
      view: { foo: 1 },
    })
    expect(item.batchId).toBe('b1')
    expect(item.batchLabel).toBe('Batch 1')
    expect(item.view).toEqual({ foo: 1 })
  })

  it('defaults missing opts to null', () => {
    const item = buildGalleryItem('label', 'fname', 'data:url')
    expect(item.batchId).toBe(null)
    expect(item.batchLabel).toBe(null)
    expect(item.view).toBe(null)
  })

  it('does not write the deprecated baseImage / graphicsJSON fields', () => {
    // Vestigial from the deleted graphics editor (Phase 1.3). New
    // entries skip them; old entries with the fields still load via
    // loadGalleryEntries (kept tolerant for backward compat).
    const item = buildGalleryItem('label', 'fname', 'data:url', {
      baseImage: 'data:base',
      graphicsJSON: '{}',
    })
    expect('baseImage' in item).toBe(false)
    expect('graphicsJSON' in item).toBe(false)
  })

  it('stores rawSnapshot / prompt / modifiers when provided', () => {
    const item = buildGalleryItem('label', 'fname', 'data:final', {
      rawSnapshot: 'data:raw',
      prompt: 'Re-render this aerial scene as a photoreal daylight cityscape.',
      modifiers: ['bustling', 'birds'],
    })
    expect(item.rawSnapshot).toBe('data:raw')
    expect(item.prompt).toContain('photoreal daylight')
    expect(item.modifiers).toEqual(['bustling', 'birds'])
  })

  it('defaults rawSnapshot / prompt / modifiers to null', () => {
    const item = buildGalleryItem('label', 'fname', 'data:final')
    expect(item.rawSnapshot).toBe(null)
    expect(item.prompt).toBe(null)
    expect(item.modifiers).toBe(null)
  })

  it('rejects non-array modifiers (defaults to null)', () => {
    // A malformed payload (e.g., legacy or hand-edited IDB row) should
    // not propagate as a non-array — the Lightbox iterates via
    // Array.isArray gates, but treat the source of truth defensively.
    const item = buildGalleryItem('l', 'f', 'd', { modifiers: 'people,cars' })
    expect(item.modifiers).toBe(null)
  })
})

describe('buildGalleryEntries', () => {
  it('returns an empty array for empty input', () => {
    expect(buildGalleryEntries([])).toEqual([])
  })

  it('treats items without batchId as standalone entries', () => {
    const items = [
      { id: 'a', batchId: null, time: new Date('2026-01-01') },
      { id: 'b', batchId: null, time: new Date('2026-01-02') },
    ]
    const entries = buildGalleryEntries(items)
    expect(entries.length).toBe(2)
    expect(entries[0].type).toBe('item')
    expect(entries[0].item.id).toBe('b') // newest first
    expect(entries[1].item.id).toBe('a')
  })

  it('groups items sharing a batchId into one batch entry', () => {
    const items = [
      { id: 'a', batchId: 'B1', batchLabel: 'Batch 1', time: new Date('2026-01-01') },
      { id: 'b', batchId: 'B1', batchLabel: 'Batch 1', time: new Date('2026-01-02') },
      { id: 'c', batchId: null, time: new Date('2026-01-03') },
    ]
    const entries = buildGalleryEntries(items)
    expect(entries.length).toBe(2)
    // Newest first — c is newest standalone, then the B1 batch
    expect(entries[0].type).toBe('item')
    expect(entries[0].item.id).toBe('c')
    expect(entries[1].type).toBe('batch')
    expect(entries[1].batchId).toBe('B1')
    expect(entries[1].items.map((b) => b.item.id)).toEqual(['a', 'b'])
  })

  it('uses the latest item time as the batch time', () => {
    const items = [
      { id: 'a', batchId: 'B1', time: new Date('2026-01-01') },
      { id: 'b', batchId: 'B1', time: new Date('2026-03-01') },
      { id: 'c', batchId: 'B1', time: new Date('2026-02-01') },
    ]
    const entries = buildGalleryEntries(items)
    expect(entries[0].type).toBe('batch')
    expect(entries[0].time).toEqual(new Date('2026-03-01'))
  })
})
