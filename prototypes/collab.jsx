// ─── Collaborative Presence ─────────────────────────────────
// Shareable room links + cursor/presence indicators via Supabase Realtime.
// No conflict resolution — just shows who's viewing the same poster and their
// approximate camera position / pointer location.

import { createClient } from '@supabase/supabase-js'

// ─── Config ─────────────────────────────────────────────────
// Supabase project can be configured via localStorage or defaults
const SUPABASE_URL = localStorage.getItem('mapposter_supabase_url') || 'https://placeholder.supabase.co'
const SUPABASE_ANON_KEY = localStorage.getItem('mapposter_supabase_anon') || 'placeholder-key'

let supabase = null
let channel = null
let roomId = null
let userId = null
let userName = null
let userColor = null
const peers = new Map() // peerId → { name, color, cursor, camera }

const COLORS = [
  '#c4956a', '#6a9ab8', '#c45a5a', '#6b9b6e', '#b8a0c8',
  '#d4a24e', '#e8a0b8', '#5aaa8a', '#aa2aaa', '#4aaa4a',
]

// ─── Init ───────────────────────────────────────────────────
export function initCollab() {
  // Generate persistent user identity
  userId = localStorage.getItem('mapposter_collab_uid')
  if (!userId) {
    userId = 'u_' + Math.random().toString(36).substring(2, 10)
    localStorage.setItem('mapposter_collab_uid', userId)
  }
  userName = localStorage.getItem('mapposter_collab_name') || 'Guest ' + userId.substring(2, 6)
  userColor = COLORS[Math.abs(hashCode(userId)) % COLORS.length]

  // Check URL for room param
  const params = new URLSearchParams(location.search)
  const urlRoom = params.get('room')
  if (urlRoom) {
    joinRoom(urlRoom)
  }

  // Wire UI
  wireCollabUI()
}

function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}

// ─── Room management ────────────────────────────────────────
function generateRoomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return id
}

function getRoomUrl(id) {
  const url = new URL(location.href)
  url.searchParams.set('room', id)
  return url.toString()
}

export function createRoom() {
  const id = generateRoomId()
  joinRoom(id)
  return id
}

export async function joinRoom(id) {
  // Leave current room
  if (channel) {
    leaveRoom()
  }

  roomId = id

  // Update URL without reload
  const url = new URL(location.href)
  url.searchParams.set('room', id)
  history.replaceState(null, '', url.toString())

  // Try to connect to Supabase
  if (SUPABASE_URL.includes('placeholder')) {
    // No Supabase configured — run in local demo mode
    updateCollabStatus('connected-local')
    updateRoomUI()
    return
  }

  try {
    if (!supabase) {
      supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    }

    channel = supabase.channel('room:' + id, {
      config: { presence: { key: userId } }
    })

    channel.on('presence', { event: 'sync' }, () => {
      syncPresence()
    })

    channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      newPresences.forEach(p => {
        if (p.userId !== userId) {
          showToast(p.name + ' joined')
        }
      })
    })

    channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      leftPresences.forEach(p => {
        peers.delete(p.userId)
        removeCursorEl(p.userId)
        if (p.userId !== userId) {
          showToast(p.name + ' left')
        }
      })
      updatePeerList()
    })

    // Broadcast cursor moves
    channel.on('broadcast', { event: 'cursor' }, ({ payload }) => {
      if (payload.userId === userId) return
      const peer = peers.get(payload.userId)
      if (peer) {
        peer.cursor = payload.cursor
        updateCursorEl(payload.userId, peer)
      }
    })

    await channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          userId, name: userName, color: userColor,
          joinedAt: Date.now(),
        })
        updateCollabStatus('connected')
        updateRoomUI()
      }
    })
  } catch (e) {
    updateCollabStatus('error')
  }
}

export function leaveRoom() {
  if (channel) {
    channel.untrack()
    channel.unsubscribe()
    channel = null
  }
  roomId = null
  peers.clear()

  // Remove room from URL
  const url = new URL(location.href)
  url.searchParams.delete('room')
  history.replaceState(null, '', url.toString())

  // Clear cursor elements
  document.querySelectorAll('.collab-cursor').forEach(el => el.remove())
  updateCollabStatus('disconnected')
  updateRoomUI()
}

function syncPresence() {
  if (!channel) return
  const presenceState = channel.presenceState()
  peers.clear()
  Object.entries(presenceState).forEach(([key, presences]) => {
    presences.forEach(p => {
      if (p.userId !== userId) {
        peers.set(p.userId, { name: p.name, color: p.color, cursor: null, camera: null })
      }
    })
  })
  updatePeerList()
}

// ─── Cursor broadcasting ────────────────────────────────────
let _lastCursorBroadcast = 0
const CURSOR_THROTTLE = 50 // ms

export function broadcastCursor(x, y) {
  if (!channel || !roomId) return
  const now = Date.now()
  if (now - _lastCursorBroadcast < CURSOR_THROTTLE) return
  _lastCursorBroadcast = now

  // Normalize to 0-1 relative to canvas container
  const container = document.getElementById('canvas-container')
  if (!container) return
  const rect = container.getBoundingClientRect()
  const nx = (x - rect.left) / rect.width
  const ny = (y - rect.top) / rect.height

  channel.send({
    type: 'broadcast',
    event: 'cursor',
    payload: { userId, cursor: { x: nx, y: ny } }
  })
}

// ─── Cursor DOM elements ────────────────────────────────────
function getCursorEl(peerId) {
  let el = document.getElementById('collab-cursor-' + peerId)
  if (!el) {
    el = document.createElement('div')
    el.id = 'collab-cursor-' + peerId
    el.className = 'collab-cursor'
    document.getElementById('canvas-container')?.appendChild(el)
  }
  return el
}

function updateCursorEl(peerId, peer) {
  const el = getCursorEl(peerId)
  if (!peer.cursor) { el.style.display = 'none'; return }

  el.style.display = 'flex'
  el.style.left = (peer.cursor.x * 100) + '%'
  el.style.top = (peer.cursor.y * 100) + '%'
  el.style.setProperty('--cursor-color', peer.color || '#c4956a')

  // Build cursor content safely
  if (!el.hasChildNodes()) {
    // SVG cursor arrow
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '16')
    svg.setAttribute('height', '16')
    svg.setAttribute('viewBox', '0 0 16 16')
    svg.classList.add('collab-cursor-svg')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', 'M0 0L12 8L5 9L3 16L0 0Z')
    path.setAttribute('fill', peer.color || '#c4956a')
    svg.appendChild(path)
    el.appendChild(svg)

    const label = document.createElement('span')
    label.className = 'collab-cursor-name'
    label.style.background = peer.color || '#c4956a'
    label.textContent = peer.name || 'Guest'
    el.appendChild(label)
  }
}

function removeCursorEl(peerId) {
  document.getElementById('collab-cursor-' + peerId)?.remove()
}

// ─── UI wiring ──────────────────────────────────────────────
function wireCollabUI() {
  // Create room
  document.getElementById('collab-create-btn')?.addEventListener('click', () => {
    createRoom()
  })

  // Copy link
  document.getElementById('collab-copy-btn')?.addEventListener('click', () => {
    if (!roomId) return
    const url = getRoomUrl(roomId)
    navigator.clipboard.writeText(url).then(() => {
      showToast('Room link copied!')
    }).catch(() => {
      // Fallback
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      showToast('Room link copied!')
    })
  })

  // Leave room
  document.getElementById('collab-leave-btn')?.addEventListener('click', leaveRoom)

  // Name change
  document.getElementById('collab-name-input')?.addEventListener('change', (e) => {
    userName = e.target.value.trim() || userName
    localStorage.setItem('mapposter_collab_name', userName)
    if (channel) {
      channel.track({ userId, name: userName, color: userColor, joinedAt: Date.now() })
    }
  })

  // Set initial name
  const nameInput = document.getElementById('collab-name-input')
  if (nameInput) nameInput.value = userName

  // Track cursor on canvas
  document.getElementById('canvas-container')?.addEventListener('pointermove', (e) => {
    broadcastCursor(e.clientX, e.clientY)
  })
}

function updateCollabStatus(status) {
  const indicator = document.getElementById('collab-status')
  if (!indicator) return
  indicator.className = 'collab-status collab-status-' + status
  const labels = {
    'connected': 'Connected',
    'connected-local': 'Local mode',
    'disconnected': 'Not in room',
    'error': 'Connection error',
  }
  indicator.textContent = labels[status] || status
}

function updateRoomUI() {
  const createBtn = document.getElementById('collab-create-btn')
  const roomInfo = document.getElementById('collab-room-info')
  const roomIdEl = document.getElementById('collab-room-id')

  if (roomId) {
    if (createBtn) createBtn.style.display = 'none'
    if (roomInfo) roomInfo.style.display = 'block'
    if (roomIdEl) roomIdEl.textContent = roomId
  } else {
    if (createBtn) createBtn.style.display = 'block'
    if (roomInfo) roomInfo.style.display = 'none'
  }
  updatePeerList()
}

function updatePeerList() {
  const list = document.getElementById('collab-peer-list')
  if (!list) return
  while (list.firstChild) list.removeChild(list.firstChild)

  // Show self first
  const self = document.createElement('div')
  self.className = 'collab-peer'
  const selfDot = document.createElement('span')
  selfDot.className = 'collab-peer-dot'
  selfDot.style.background = userColor
  self.appendChild(selfDot)
  const selfName = document.createElement('span')
  selfName.textContent = userName + ' (you)'
  selfName.className = 'collab-peer-name'
  self.appendChild(selfName)
  list.appendChild(self)

  // Show peers
  peers.forEach((peer, id) => {
    const el = document.createElement('div')
    el.className = 'collab-peer'
    const dot = document.createElement('span')
    dot.className = 'collab-peer-dot'
    dot.style.background = peer.color || '#c4956a'
    el.appendChild(dot)
    const name = document.createElement('span')
    name.textContent = peer.name || 'Guest'
    name.className = 'collab-peer-name'
    el.appendChild(name)
    list.appendChild(el)
  })
}

// ─── Toast notifications ────────────────────────────────────
function showToast(msg) {
  const existing = document.getElementById('collab-toast')
  if (existing) existing.remove()

  const toast = document.createElement('div')
  toast.id = 'collab-toast'
  toast.className = 'collab-toast'
  toast.textContent = msg
  document.body.appendChild(toast)

  // Animate in
  requestAnimationFrame(() => toast.classList.add('show'))

  // Auto remove
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => toast.remove(), 300)
  }, 2500)
}

export { roomId, userId, userName, peers }
