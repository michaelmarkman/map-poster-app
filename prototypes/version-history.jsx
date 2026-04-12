// ─── Version History for Saved Views ────────────────────────
// Each time a view is modified and re-saved, keep previous versions accessible.
// Stored in localStorage alongside the main views.

const VH_KEY = 'mapposter3d_v2_view_history'
const MAX_VERSIONS_PER_VIEW = 10

export function initVersionHistory() {
  wireVersionHistoryUI()
  renderVersionHistory()
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(VH_KEY)) || {} } catch { return {} }
}

function saveHistoryStore(store) {
  try { localStorage.setItem(VH_KEY, JSON.stringify(store)) } catch {}
}

// Called before overwriting a saved view — snapshots the current version
export function snapshotVersion(viewId, viewData) {
  const store = loadHistory()
  if (!store[viewId]) store[viewId] = []
  // Add current state as a historical version
  store[viewId].unshift({
    ...viewData,
    savedAt: Date.now(),
  })
  // Trim
  if (store[viewId].length > MAX_VERSIONS_PER_VIEW) {
    store[viewId] = store[viewId].slice(0, MAX_VERSIONS_PER_VIEW)
  }
  saveHistoryStore(store)
  renderVersionHistory()
}

// Get all versions for a view
export function getVersions(viewId) {
  const store = loadHistory()
  return store[viewId] || []
}

// Delete a specific version
export function deleteVersion(viewId, index) {
  const store = loadHistory()
  if (store[viewId]) {
    store[viewId].splice(index, 1)
    if (store[viewId].length === 0) delete store[viewId]
    saveHistoryStore(store)
    renderVersionHistory()
  }
}

// Clean up history for deleted views
export function pruneHistory(activeViewIds) {
  const store = loadHistory()
  let changed = false
  Object.keys(store).forEach(id => {
    if (!activeViewIds.includes(parseInt(id))) {
      delete store[id]
      changed = true
    }
  })
  if (changed) saveHistoryStore(store)
}

function wireVersionHistoryUI() {
  // The list is rendered dynamically
}

export function renderVersionHistory() {
  const list = document.getElementById('version-history-list')
  if (!list) return
  while (list.firstChild) list.removeChild(list.firstChild)

  const store = loadHistory()
  const allVersions = []

  // Flatten all versions with view context
  Object.entries(store).forEach(([viewId, versions]) => {
    versions.forEach((v, idx) => {
      allVersions.push({ viewId, idx, ...v })
    })
  })

  // Sort by most recent
  allVersions.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))

  // Show most recent 10
  allVersions.slice(0, 10).forEach(v => {
    const el = document.createElement('div')
    el.className = 'vh-entry'

    if (v.thumbnail) {
      const img = document.createElement('img')
      img.src = v.thumbnail
      el.appendChild(img)
    }

    const info = document.createElement('div')
    info.style.cssText = 'flex:1;overflow:hidden;'

    const name = document.createElement('div')
    name.className = 'vh-name'
    name.textContent = v.name || 'View'
    info.appendChild(name)

    const meta = document.createElement('div')
    meta.className = 'vh-meta'
    meta.textContent = formatTimestamp(v.savedAt)
    info.appendChild(meta)

    el.appendChild(info)

    const restoreBtn = document.createElement('button')
    restoreBtn.className = 'vh-restore'
    restoreBtn.textContent = 'Restore'
    restoreBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      window.dispatchEvent(new CustomEvent('restore-view', { detail: v }))
    })
    el.appendChild(restoreBtn)

    el.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('restore-view', { detail: v }))
    })

    list.appendChild(el)
  })

  if (allVersions.length === 0) {
    const empty = document.createElement('div')
    empty.style.cssText = 'font-size:9px;color:var(--text-3);padding:4px 0;'
    empty.textContent = 'No version history yet'
    list.appendChild(empty)
  }
}

function formatTimestamp(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago'
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
