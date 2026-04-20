// Base pill — dark glass chip with optional icon + label and click handler.
// All other pill variants compose this.
export default function Pill({
  icon,
  children,
  onClick,
  active = false,
  className = '',
  innerRef,
  ...rest
}) {
  return (
    <button
      type="button"
      ref={innerRef}
      className={`mock-pill${active ? ' is-active' : ''}${className ? ' ' + className : ''}`}
      onClick={onClick}
      {...rest}
    >
      {icon ? <span className="mock-pill-icon">{icon}</span> : null}
      {children ? <span className="mock-pill-label">{children}</span> : null}
    </button>
  )
}
