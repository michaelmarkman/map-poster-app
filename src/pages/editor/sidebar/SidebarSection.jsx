import { useAtom } from 'jotai'
import { openSectionsAtom } from '../atoms/sidebar'

// Shared chrome for a sidebar section: clickable header with chevron,
// optional collapsed-body visibility. Preserves the class names from the
// prototype (`.sidebar-section`, `.section-head`, `.section-title`,
// `.section-chev`, `.section-body`) so the existing CSS continues to work.
export default function SidebarSection({ name, title, children }) {
  const [open, setOpen] = useAtom(openSectionsAtom)
  const isOpen = open[name] !== false
  const toggle = () => setOpen({ ...open, [name]: !isOpen })
  return (
    <div
      className={`sidebar-section${isOpen ? '' : ' collapsed'}`}
      data-sec={name}
    >
      <button className="section-head" type="button" onClick={toggle}>
        <span className="section-title">{title}</span>
        <svg className="section-chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      <div className="section-body">{children}</div>
    </div>
  )
}
