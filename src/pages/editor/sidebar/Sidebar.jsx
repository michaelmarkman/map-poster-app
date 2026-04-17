import { useEffect } from 'react'
import { useAtom } from 'jotai'
import { sidebarCollapsedAtom } from '../atoms/ui'
import EnvironmentSection from './EnvironmentSection'
import CameraSection from './CameraSection'
import CanvasSection from './CanvasSection'
import TextSection from './TextSection'
import EditorSection from './EditorSection'
import ExportSection from './ExportSection'

const SIDEBAR_KEY = 'mapposter3d_sidebar_collapsed'

export default function Sidebar() {
  const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom)

  // Restore from localStorage on mount; on mobile default to collapsed.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_KEY)
      if (saved != null) {
        setCollapsed(saved === '1')
      } else {
        const coarse = window.matchMedia('(pointer: coarse)').matches
        const narrow = window.matchMedia('(max-width: 1024px)').matches
        if (coarse && narrow) setCollapsed(true)
      }
    } catch (e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync body class for CSS selectors that key off `body.sidebar-collapsed`.
  useEffect(() => {
    document.body.classList.toggle('sidebar-collapsed', collapsed)
    try { localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0') } catch (e) {}
  }, [collapsed])

  // Keyboard shortcut: `\` toggles the sidebar (matches prototype).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '\\') return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      setCollapsed((c) => !c)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setCollapsed])

  return (
    <>
      <div id="sidebar">
        <button
          id="sidebar-toggle"
          type="button"
          title="Collapse sidebar (\)"
          aria-label="Collapse sidebar"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(true)}
        >
          ‹
        </button>

        <a href="/" className="logo" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="logo-text">
            <span className="map">map</span>
            <span className="poster">poster</span>
          </div>
          <div className="logo-sub">v3.ui</div>
        </a>

        <EnvironmentSection />
        <CameraSection />
        <CanvasSection />
        <TextSection />
        <EditorSection />
        <ExportSection />
      </div>

      <button
        id="sidebar-reveal"
        type="button"
        title="Show sidebar (\)"
        aria-label="Show sidebar"
        onClick={() => setCollapsed(false)}
      >
        ›
      </button>
    </>
  )
}
