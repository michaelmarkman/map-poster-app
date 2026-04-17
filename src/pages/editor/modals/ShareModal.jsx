import { useEffect, useState } from 'react'
import { useAtom } from 'jotai'
import { modalsAtom, shareDraftAtom } from '../atoms/modals'

// Share to Community modal. Ported from prototypes/poster-v3-ui.html
// lines 2711-2734 and the openShareModal/submit handler in
// prototypes/poster-v3-ui.jsx around line 2918. Inline styles are kept
// verbatim (translated to React style objects) so the look matches the
// prototype. No createCommunityPost exists yet in src/lib/community.js,
// so submit dispatches a 'share-submit' event carrying the form data for
// Phase 5 to wire up to Supabase.

export default function ShareModal() {
  const [modals, setModals] = useAtom(modalsAtom)
  const [draft] = useAtom(shareDraftAtom)
  const open = !!modals.share

  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [location, setLocation] = useState('')
  const [status, setStatus] = useState({ text: '', visible: false })
  const [submitting, setSubmitting] = useState(false)

  // Hydrate local inputs from the shareDraftAtom whenever the modal opens
  // — matches openShareModal() in the prototype which reset fields + auto-
  // filled location at open time.
  useEffect(() => {
    if (!open) return
    setTitle(draft?.title || '')
    setDesc(draft?.description || '')
    setLocation(draft?.location || '')
    setStatus({ text: '', visible: false })
    setSubmitting(false)
  }, [open, draft])

  if (!open) return null

  const close = () => setModals({ ...modals, share: false })

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    setStatus({ text: 'Sharing...', visible: true })
    const payload = {
      title,
      description: desc,
      location,
      entryId: draft?.entryId ?? null,
    }
    try {
      // Try to import createCommunityPost from a future src/lib/community.js.
      // Falls back to a custom event that Phase 5 can hook into to persist
      // the post via Supabase.
      let createCommunityPost = null
      try {
        // Hidden behind a runtime-assembled specifier so the bundler
        // doesn't fail at build time when the future module is absent.
        const spec = ['..', '..', '..', 'lib', 'community.js'].join('/')
        const mod = await import(/* @vite-ignore */ spec)
        createCommunityPost = mod.createCommunityPost || null
      } catch {
        createCommunityPost = null
      }

      if (typeof createCommunityPost === 'function') {
        await createCommunityPost(payload)
      } else {
        window.dispatchEvent(new CustomEvent('share-submit', { detail: payload }))
      }

      setStatus({ text: 'Shared!', visible: true })
      setTimeout(() => {
        setStatus({ text: '', visible: false })
        setSubmitting(false)
        setModals((m) => ({ ...m, share: false }))
      }, 1500)
    } catch (err) {
      setStatus({
        text: err?.message ? `Error: ${err.message}` : 'Something went wrong.',
        visible: true,
      })
      setSubmitting(false)
    }
  }

  // ── styles lifted from the prototype HTML verbatim ──
  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 400,
    display: 'flex',
    background: 'rgba(0,0,0,0.8)',
    backdropFilter: 'blur(8px)',
    alignItems: 'center',
    justifyContent: 'center',
  }
  const panelStyle = {
    background: '#1e1d23',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    maxWidth: 480,
    width: 'calc(100% - 48px)',
    padding: 28,
    position: 'relative',
  }
  const closeBtnStyle = {
    position: 'absolute',
    top: 12,
    right: 12,
    background: 'none',
    border: 'none',
    color: 'var(--ink-dim)',
    fontSize: 20,
    cursor: 'pointer',
  }
  const headingStyle = {
    fontFamily: 'var(--serif)',
    fontWeight: 400,
    fontSize: 20,
    marginBottom: 18,
  }
  const fieldStyle = { marginBottom: 14 }
  const fieldStyleLast = { marginBottom: 18 }
  const labelStyle = {
    display: 'block',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--ink-dim)',
    marginBottom: 5,
  }
  const inputStyle = {
    width: '100%',
    padding: '9px 12px',
    background: 'var(--bg-deep)',
    border: '1px solid var(--panel-border)',
    borderRadius: 8,
    color: 'var(--ink)',
    fontFamily: 'var(--body)',
    fontSize: 14,
    outline: 'none',
  }
  const textareaStyle = { ...inputStyle, resize: 'vertical' }
  const actionsStyle = {
    display: 'flex',
    gap: 10,
    justifyContent: 'flex-end',
  }
  const cancelBtnStyle = {
    padding: '8px 18px',
    background: 'transparent',
    border: '1px solid var(--panel-border)',
    borderRadius: 8,
    color: 'var(--ink-soft)',
    cursor: 'pointer',
    fontFamily: 'var(--body)',
  }
  const submitBtnStyle = {
    padding: '8px 18px',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 8,
    color: 'var(--bg-deep)',
    cursor: 'pointer',
    fontFamily: 'var(--body)',
    fontWeight: 500,
  }
  const statusStyle = {
    marginTop: 12,
    fontSize: 13,
    color: 'var(--ink-soft)',
    textAlign: 'center',
    display: status.visible ? 'block' : 'none',
  }

  return (
    <div id="share-modal" style={overlayStyle} onClick={close}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <button
          id="share-modal-close"
          type="button"
          style={closeBtnStyle}
          onClick={close}
        >
          ×
        </button>
        <h3 style={headingStyle}>Share to Community</h3>
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="share-title">Title</label>
          <input
            id="share-title"
            type="text"
            placeholder="e.g. Golden Hour over Tokyo"
            style={inputStyle}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="share-desc">Description (optional)</label>
          <textarea
            id="share-desc"
            rows={3}
            placeholder="Tell the story behind this view..."
            style={textareaStyle}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>
        <div style={fieldStyleLast}>
          <label style={labelStyle} htmlFor="share-location">Location</label>
          <input
            id="share-location"
            type="text"
            placeholder="Location name"
            style={inputStyle}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div style={actionsStyle}>
          <button
            id="share-cancel"
            type="button"
            className="btn ghost"
            style={cancelBtnStyle}
            onClick={close}
          >
            Cancel
          </button>
          <button
            id="share-submit"
            type="button"
            className="btn primary"
            style={submitBtnStyle}
            onClick={handleSubmit}
            disabled={submitting}
          >
            Share
          </button>
        </div>
        <div id="share-status" style={statusStyle}>{status.text}</div>
      </div>
    </div>
  )
}
