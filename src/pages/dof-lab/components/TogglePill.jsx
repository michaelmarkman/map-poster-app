import Pill from './Pill'

// Simple on/off pill. Active state inherits from `active` prop.
export default function TogglePill({ icon, label, active, onToggle, ...rest }) {
  return (
    <Pill icon={icon} active={active} onClick={onToggle} {...rest}>
      {label}
    </Pill>
  )
}
