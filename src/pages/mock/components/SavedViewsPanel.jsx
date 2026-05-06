import { useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  defaultSavedViewIdAtom,
  hoveredSavedViewIdAtom,
  savedViewsAtom,
} from '../../editor/atoms/sidebar'

// Phase 2.3 — saved views revamp.
//
// Image-led list with thumbnail, inline rename, up/down reorder, delete,
// "set as default" toggle. Hovering a row publishes the view's id to
// hoveredSavedViewIdAtom so the in-scene marker can highlight in sync.
//
// Drag-to-reorder is deferred — adding @dnd-kit just for this is heavy.
// Up/down arrow buttons cover the use case until we have other drag-y UI.

function fire(name, detail) {
  window.dispatchEvent(detail !== undefined ? new CustomEvent(name, { detail }) : new Event(name))
}

function ViewRow({ view, index, total, isDefault, onClose }) {
  const setHoveredId = useSetAtom(hoveredSavedViewIdAtom)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(view.name || '')

  const commitRename = () => {
    const next = draftName.trim()
    if (next && next !== view.name) {
      fire('rename-view', { id: view.id, name: next })
    }
    setEditing(false)
  }

  return (
    <li
      className="svp-row"
      onPointerEnter={() => setHoveredId(view.id)}
      onPointerLeave={() => setHoveredId((cur) => (cur === view.id ? null : cur))}
    >
      <button
        type="button"
        className="svp-row-main"
        onClick={() => {
          if (editing) return
          fire('load-view', view.id)
          onClose?.()
        }}
        aria-label={`Load saved view ${view.name || 'untitled'}`}
      >
        <span className="svp-thumb">
          {view.thumbnail ? (
            <img src={view.thumbnail} alt="" draggable={false} />
          ) : (
            <span className="svp-thumb-placeholder" aria-hidden />
          )}
        </span>
        {editing ? (
          <input
            className="svp-rename"
            value={draftName}
            autoFocus
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitRename()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setDraftName(view.name || '')
                setEditing(false)
              }
            }}
          />
        ) : (
          <span className="svp-name">{view.name || 'Untitled view'}</span>
        )}
      </button>

      <div className="svp-actions">
        <button
          type="button"
          className={`svp-action${isDefault ? ' is-active' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            fire('set-default-view', { id: isDefault ? null : view.id })
          }}
          aria-label={isDefault ? 'Unset default' : 'Set as default'}
          title={isDefault ? 'Default view' : 'Set as default'}
        >
          {isDefault ? '★' : '☆'}
        </button>
        <button
          type="button"
          className="svp-action"
          onClick={(e) => {
            e.stopPropagation()
            setDraftName(view.name || '')
            setEditing(true)
          }}
          aria-label="Rename"
          title="Rename"
        >
          ✎
        </button>
        <button
          type="button"
          className="svp-action"
          disabled={index === 0}
          onClick={(e) => {
            e.stopPropagation()
            fire('reorder-view', { id: view.id, direction: 'up' })
          }}
          aria-label="Move up"
          title="Move up"
        >
          ↑
        </button>
        <button
          type="button"
          className="svp-action"
          disabled={index === total - 1}
          onClick={(e) => {
            e.stopPropagation()
            fire('reorder-view', { id: view.id, direction: 'down' })
          }}
          aria-label="Move down"
          title="Move down"
        >
          ↓
        </button>
        <button
          type="button"
          className="svp-action svp-action--danger"
          onClick={(e) => {
            e.stopPropagation()
            fire('delete-view', view.id)
          }}
          aria-label="Delete"
          title="Delete"
        >
          ×
        </button>
      </div>
    </li>
  )
}

export default function SavedViewsPanel({ onClose }) {
  const savedViews = useAtomValue(savedViewsAtom)
  const [defaultId, setDefaultId] = useAtom(defaultSavedViewIdAtom)

  // Listen for set-default-view via the same event pattern the other
  // saved-view methods use. Lifted into the panel since this is a UI
  // concern (no need to muddy useSavedViews with default-id state).
  if (typeof window !== 'undefined') {
    // Attach once per render cycle using a passive flag — repeated
    // attaches are de-duped because we check flag-on-window.
    if (!window.__svpDefaultListenerAttached) {
      window.__svpDefaultListenerAttached = true
      window.addEventListener('set-default-view', (e) => {
        const id = e?.detail?.id
        setDefaultId(id ?? null)
      })
    }
  }

  return (
    <div className="svp">
      {savedViews.length === 0 ? (
        <div className="svp-empty">
          <div className="svp-empty-text">No saved views yet.</div>
          <div className="svp-empty-hint">
            Frame a shot, then hit Save current view below.
          </div>
        </div>
      ) : (
        <ul className="svp-list">
          {savedViews.map((view, idx) => (
            <ViewRow
              key={view.id}
              view={view}
              index={idx}
              total={savedViews.length}
              isDefault={view.id === defaultId}
              onClose={onClose}
            />
          ))}
        </ul>
      )}
      <button
        type="button"
        className="mock-btn-primary svp-save"
        onClick={() => {
          fire('save-view')
          onClose?.()
        }}
      >
        Save current view
      </button>
    </div>
  )
}
