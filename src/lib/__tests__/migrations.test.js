import { describe, it, expect, beforeEach } from 'vitest'
import { runLocalStorageMigrations } from '../migrations'

describe('runLocalStorageMigrations', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('rewrites a legacy key onto its new key and deletes the legacy one', () => {
    localStorage.setItem('mapposter3d_poster_v2_session', '{"camera":{}}')
    runLocalStorageMigrations()
    expect(localStorage.getItem('vedute_session')).toBe('{"camera":{}}')
    expect(localStorage.getItem('mapposter3d_poster_v2_session')).toBe(null)
  })

  it('migrates every key in the documented map', () => {
    const cases = [
      ['mapposter3d_poster_v2_session', 'vedute_session'],
      ['mapposter3d_v2_views', 'vedute_views'],
      ['mapposter3d_gemini_key', 'vedute_gemini_key'],
      ['mapposter3d_tod_unlock', 'vedute_tod_unlock'],
      ['mapposter_map_style', 'vedute_map_style'],
      ['mapposter3d_tm_current_set', 'vedute_tm_current_set'],
      ['mapposter_google_key', 'vedute_google_key'],
    ]
    for (const [oldK] of cases) localStorage.setItem(oldK, `value:${oldK}`)
    runLocalStorageMigrations()
    for (const [oldK, newK] of cases) {
      expect(localStorage.getItem(newK), `${oldK} -> ${newK}`).toBe(`value:${oldK}`)
      expect(localStorage.getItem(oldK), `${oldK} cleared`).toBe(null)
    }
  })

  it('does not clobber a fresh new-key value with an old value', () => {
    // Edge case: user opens app under new build first (writes vedute_*), then
    // opens an old tab still holding mapposter3d_*. Migration must NOT
    // overwrite the fresh vedute_session with the stale legacy one.
    localStorage.setItem('vedute_session', '{"fresh":true}')
    localStorage.setItem('mapposter3d_poster_v2_session', '{"stale":true}')
    runLocalStorageMigrations()
    expect(localStorage.getItem('vedute_session')).toBe('{"fresh":true}')
    expect(localStorage.getItem('mapposter3d_poster_v2_session')).toBe(null)
  })

  it('is a no-op when no legacy keys exist', () => {
    localStorage.setItem('vedute_session', '{"already":"migrated"}')
    runLocalStorageMigrations()
    expect(localStorage.getItem('vedute_session')).toBe('{"already":"migrated"}')
    expect(localStorage.length).toBe(1)
  })

  it('is idempotent (running twice has the same effect as once)', () => {
    localStorage.setItem('mapposter3d_v2_views', '[]')
    runLocalStorageMigrations()
    runLocalStorageMigrations()
    expect(localStorage.getItem('vedute_views')).toBe('[]')
    expect(localStorage.getItem('mapposter3d_v2_views')).toBe(null)
  })

  it('leaves unrelated keys alone', () => {
    localStorage.setItem('something_else', 'untouched')
    localStorage.setItem('mapposter3d_v2_views', '[]')
    runLocalStorageMigrations()
    expect(localStorage.getItem('something_else')).toBe('untouched')
  })
})
