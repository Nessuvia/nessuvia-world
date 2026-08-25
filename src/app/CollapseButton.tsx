import { RiArrowLeftSLine } from '@remixicon/react'
import './CollapseButton.css'

/** 'Active stack' → 'AS'. The collapsed rail is too narrow for the title. */
const initials = (label: string) =>
  label
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())

/** The chevron itself. Put it in the panel's header, next to the title. */
export function CollapseButton({
  label,
  collapsed,
  onToggle,
}: {
  label: string
  collapsed: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className={`collapseChevron${collapsed ? ' shut' : ''}`}
      title={collapsed ? `Show ${label}` : `Hide ${label}`}
      aria-label={collapsed ? `Show ${label}` : `Hide ${label}`}
      aria-expanded={!collapsed}
      onClick={onToggle}
    >
      <RiArrowLeftSLine size={18} />
    </button>
  )
}

/** What a collapsed panel renders instead of itself: the chevron over a vertical label. */
export function CollapseRail({
  label,
  onToggle,
  className,
}: {
  label: string
  onToggle: () => void
  className?: string
}) {
  return (
    <div className={`panel collapsedRail${className ? ` ${className}` : ''}`}>
      <CollapseButton label={label} collapsed onToggle={onToggle} />
      <span className="collapsedInitials" aria-hidden>
        {initials(label).map((letter, i) => (
          <h2 key={i}>{letter}</h2>
        ))}
      </span>
    </div>
  )
}
