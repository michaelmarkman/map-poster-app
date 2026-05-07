// One-time localStorage key migrations for the Vedute rebrand.
//
// Old keys lived under the `mapposter3d_*` / `mapposter_*` prefix; new keys
// live under `vedute_*`. This helper runs once on app boot (called from
// main.jsx before React mounts) and rewrites any legacy keys it finds:
//
//   1. read the old key
//   2. write the new key (skip if the new key already exists — we lose data
//      if we clobber a fresh session with an old one)
//   3. delete the old key
//
// Idempotent: running it twice is a no-op. Safe under partial migrations
// (e.g., user closes the tab mid-rewrite) — the next boot finishes the job.
//
// Skipped keys (intentional — the features they backed are gone):
//   - mapposter_saved_graphics      (graphics editor removal, §1.3)
//   - mapposter3d_sidebar_collapsed (sidebar route deletion, §1.2)
//
// IndexedDB:
//   - mapposter_gallery → vedute_gallery — the IDB rename runs lazily on
//     first gallery read (src/pages/editor/utils/galleryDb.js). Different
//     mechanism because IDB renames aren't atomic.

const KEY_MAP = {
  mapposter3d_poster_v2_session: 'vedute_session',
  mapposter3d_v2_views: 'vedute_views',
  mapposter3d_gemini_key: 'vedute_gemini_key',
  mapposter3d_tod_unlock: 'vedute_tod_unlock',
  mapposter_map_style: 'vedute_map_style',
  mapposter3d_tm_current_set: 'vedute_tm_current_set',
  mapposter_google_key: 'vedute_google_key',
}

export function runLocalStorageMigrations() {
  if (typeof window === 'undefined' || !window.localStorage) return
  for (const [oldKey, newKey] of Object.entries(KEY_MAP)) {
    try {
      const oldVal = localStorage.getItem(oldKey)
      if (oldVal === null) continue
      // Don't clobber a fresh value under the new key (could happen if the
      // user opened the app under the new build first, then opened an old
      // tab still holding the legacy key).
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, oldVal)
      }
      localStorage.removeItem(oldKey)
    } catch (e) {
      // Quota errors / disabled storage — leave both keys in place. Next
      // run can retry.
    }
  }
}
