import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { Link, NavLink, useMatch } from 'react-router-dom'
import { RiArrowLeftLine, RiArrowRightSLine, RiCloseLine, RiDownloadLine, RiGithubFill, RiMenuFoldLine, RiMenuLine, RiRedditFill, RiUploadLine } from '@remixicon/react'
import { useSettings } from '../core/stores/settingsStore'
import { lockedHint, usePaletteEditor } from '../core/stores/palettesStore'
import { useChats } from '../core/stores/chatStore'
import { usePersonas } from '../core/stores/personasStore'
import { isEnabled, modules } from './moduleRegistry'
import { useMediaQuery } from './useMediaQuery'
import { useSideDrawer } from './useSideDrawer'
import PersonaSwitcher from './PersonaSwitcher'
import ChatSettingsPanel from '../modules/chat/ChatSettingsPanel'
import StorySettingsPanel from '../modules/write/StorySettingsPanel'
import BookmarkList from '../modules/chat/BookmarkList'
import { buildBackup, downloadBackup, parseBackup, restoreBackup } from '../core/storage/backup'
import './sideDrawer.css'
import './Sidebar.css'

export default function Sidebar() {
  // Looked up at render, not import: the registry fills in as main.tsx imports the modules.
  const personasModule = modules.find((m) => m.id === 'personas')
  const syncModule = modules.find((m) => m.id === 'sync')
  const debugMode = useSettings((s) => s.debugMode)
  const writeEnabled = useSettings((s) => s.writeEnabled)
  const enabledPlugins = useSettings((s) => s.enabledPlugins)
  // Gated on the route, not on the store: the open chat outlives navigating away from it.
  const chatId = useMatch('/chat/:chatId')?.params.chatId
  // A Story takes the rail over the same way an open chat does.
  const storyId = useMatch('/write/s/:storyId')?.params.storyId
  // Back to the character this chat belongs to, not the picker. Until the chat has loaded there's
  // no character to go to, so the picker is the fallback.
  const chat = useChats((s) => s.chat)
  const back =
    chat && String(chat.id) === chatId ? `/chat/c/${chat.characterId}` : '/chat'

  // Title follows the active persona unless turned off in Settings > Miscellaneous.
  const personaTitleOff = useSettings((s) => s.personaTitleOff)
  const customTitle = useSettings((s) => s.customTitle)
  const activePersonaId = useSettings((s) => s.activePersonaId)
  const personaName = usePersonas((s) => s.personas.find((p) => p.id === activePersonaId)?.name)
  // "User" is the persona a fresh install creates, so it does not count as a name the user picked.
  const named = personaName?.trim() && personaName.trim().toLowerCase() !== 'user' ? personaName.trim() : ''
  const title = personaTitleOff
    ? customTitle.trim() || "Nessu's Tavern"
    : named
      ? `${named}'s Tavern`
      : "Nessu's Tavern"

  const { palette, locked, patch } = usePaletteEditor()
  // On phones the rail is a full-screen drawer and the drag handle is gone: a resizable edge
  // competes with the swipe gesture. The stored width still applies on wider screens.
  const phone = useMediaQuery('(max-width: 700px)')
  const sidebarWidth = phone ? 0 : palette.sidebarWidth
  const rail = useRef<HTMLElement>(null)
  // ponytail: narrow screens start collapsed, once, until the user picks a side. Read at mount
  // only — rotating the phone won't re-collapse it.
  const [collapsedPref, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('nessuTavern.sidebarCollapsed')
    return saved ? saved === '1' : window.innerWidth < 700
  })
  // A phone has no icon rail: the drawer is either the full rail or off screen. The stored
  // preference is left alone so a wider screen still opens the way it was left.
  const collapsed = phone ? false : collapsedPref

  // Phone-only: the rail becomes a full-screen drawer that swipes in from the left (sideDrawer.css).
  const [open, setOpen] = useState(false)
  const drawer = useSideDrawer({ side: 'left', enabled: phone, open, setOpen })

  // The rail's real width on <html>, for anything laid out outside the flex row that needs it — the
  // background layer, which spans the shell and can be told to start after the rail (see index.css).
  // Observed rather than read off palette.sidebarWidth: that is unset until the first drag, and the
  // defaults differ per rail state.
  useEffect(() => {
    const el = rail.current
    if (!el) return
    const obs = new ResizeObserver(() => {
      // The phone drawer is fixed and full-screen, so its measured width is the whole window —
      // which would push an excludeNav background layer off screen entirely. It sits over the
      // content rather than beside it, so as far as layout goes it takes no width at all.
      const width = window.matchMedia('(max-width: 700px)').matches
        ? '0px'
        : `${el.getBoundingClientRect().width}px`
      document.documentElement.style.setProperty('--navbarWidth', width)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Module tabs open in a panel beside the rail. Fixed-positioned off the nav item's rect: the rail
  // is overflow:hidden, so anything laid out inside it at left:100% would be clipped.
  //
  // Two timings, both on leaving: the panel fades over 500ms, and stays mounted and hoverable for
  // 500ms. Coming back inside that window cancels the close, so a mouse that slips off the panel
  // and returns keeps it open without going back to the nav item.
  const [flyout, setFlyout] = useState<{ id: string; top: number; left: number } | null>(null)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | undefined>(undefined)

  function cancelClose() {
    clearTimeout(closeTimer.current)
    setClosing(false)
  }

  function openFlyout(id: string, el: HTMLElement) {
    cancelClose()
    const r = el.getBoundingClientRect()
    setFlyout({ id, top: r.top, left: r.right + 4 })
  }

  function closeFlyout() {
    clearTimeout(closeTimer.current)
    setClosing(true)
    closeTimer.current = window.setTimeout(() => {
      setFlyout(null)
      setClosing(false)
    }, 500)
  }

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  // The drag writes the CSS var straight to the element, then hands the same number to React on
  // release so the style prop and the element agree.
  function startResize(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault()
    const el = rail.current
    if (!el) return
    const handle = e.currentTarget
    const startX = e.clientX
    const startW = el.getBoundingClientRect().width
    let width = startW

    const move = (ev: PointerEvent) => {
      width = Math.min(560, Math.max(180, startW + ev.clientX - startX))
      el.style.setProperty('--sidebarWidth', `${width}px`)
    }
    const stop = () => {
      handle.removeEventListener('pointermove', move)
      // A click that never moved is not a resize — no need to write the width it already has.
      if (Math.round(width) !== Math.round(startW)) patch({ sidebarWidth: Math.round(width) })
    }

    handle.setPointerCapture(e.pointerId)
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', stop, { once: true })
    handle.addEventListener('pointercancel', stop, { once: true })
  }

  const flyoutModule = flyout ? modules.find((m) => m.id === flyout.id) : undefined

  // The stored width only applies to the desktop rail; the drawer's live transform comes from the
  // hook while the finger is down.
  const railStyle = {
    ...(sidebarWidth ? { '--sidebarWidth': `${sidebarWidth}px` } : {}),
    ...drawer.style,
  } as CSSProperties

  return (
    <>
    {phone && !open && (
      <button
        type="button"
        className="sidebarOpenButton"
        title="Open menu"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
      >
        <RiMenuLine size={20} />
      </button>
    )}

    <nav
      ref={rail}
      className={`navbar sidebar ${drawer.className}${chatId || storyId ? ' inChat' : ''}${collapsed ? ' collapsed' : ''}`}
      style={railStyle}
      // Going somewhere closes the drawer, so the destination isn't hidden behind it. One handler
      // rather than an onClick per link — the rail's links come from four different places. Links
      // that open a new tab are left alone: the drawer is still where you were.
      onClick={(e) => {
        if (!phone) return
        const link = (e.target as HTMLElement).closest('a')
        if (link && !link.target) setOpen(false)
      }}
    >
      {collapsed ? (
        <>
          <button
            type="button"
            className="sidebarCollapseToggle"
            title="Expand sidebar"
            aria-label="Expand sidebar"
            onClick={() => { setCollapsed(false); localStorage.setItem('nessuTavern.sidebarCollapsed', '0') }}
          >
            <RiMenuFoldLine size={18} />
          </button>

          {chatId ? (
            <Link to={back} className="sidebar-item sidebarIconOnly" title="Go back" aria-label="Go back">
              <RiArrowLeftLine size={18} />
            </Link>
          ) : storyId ? (
            <Link to="/write" className="sidebar-item sidebarIconOnly" title="Go back" aria-label="Go back">
              <RiArrowLeftLine size={18} />
            </Link>
          ) : (
            modules
              .filter((mod) => !['personas', 'sync', 'ask', 'learn'].includes(mod.id))
              .filter((mod) => mod.id !== 'write' || writeEnabled)
              .filter((mod) => isEnabled(mod, enabledPlugins))
              .map((mod) => (
                <NavLink
                  key={mod.id}
                  to={mod.route}
                  className="sidebar-item sidebarIconOnly"
                  title={mod.label}
                  aria-label={mod.label}
                >
                  <mod.icon size={18} />
                </NavLink>
              ))
          )}

          {debugMode && <div className="debugBadge">!</div>}

          <div className="sidebarBackup">
            {personasModule && (
              <div className="sidebarPersona">
                <PersonaSwitcher />
              </div>
            )}
            {syncModule && (
              <NavLink to={syncModule.route} className="sidebar-item sidebarIconOnly" title={syncModule.label} aria-label={syncModule.label}>
                <syncModule.icon size={18} />
              </NavLink>
            )}
            <div className="sidebarIconRow">
              {['ask', ...(import.meta.env.DEV ? ['learn'] : [])]
                .map((id) => modules.find((mod) => mod.id === id))
                .filter((mod) => mod !== undefined)
                .map((mod) => (
                  <NavLink
                    key={mod.id}
                    to={mod.route}
                    className="sidebar-item sidebarIconButton"
                    title={mod.label}
                    aria-label={mod.label}
                  >
                    <mod.icon size={18} />
                  </NavLink>
                ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="sidebar-title">
            {title}
            {/* A phone has no collapsed rail to go to, so the same slot closes the drawer. */}
            {phone ? (
              <button
                type="button"
                className="sidebarCollapseToggle"
                title="Close menu"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <RiCloseLine size={18} />
              </button>
            ) : (
              <button
                type="button"
                className="sidebarCollapseToggle"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
                onClick={() => { setCollapsed(true); localStorage.setItem('nessuTavern.sidebarCollapsed', '1') }}
              >
                <RiArrowRightSLine size={18} />
              </button>
            )}
          </div>

          {!phone && (
            <div
              className="sidebarResize"
              title={locked ? `Drag to resize. ${lockedHint}` : 'Drag to resize. Double-click to reset.'}
              onPointerDown={startResize}
              onDoubleClick={() => patch({ sidebarWidth: 0 })}
            />
          )}

          {/* An open chat takes the rail over: its settings replace the module links until you leave. */}
          {chatId ? (
            <>
              <Link to={back} className="sidebar-item">
                <RiArrowLeftLine size={18} />
                Go back
              </Link>
              <ChatSettingsPanel key={chatId} />
            </>
          ) : storyId ? (
            <>
              <Link to="/write" className="sidebar-item">
                <RiArrowLeftLine size={18} />
                Go back
              </Link>
              <StorySettingsPanel key={storyId} />
            </>
          ) : (
            modules
              // Personas and Sync sit at the foot of the rail; Ask and Learn are icon buttons.
              .filter((mod) => !['personas', 'sync', 'ask', 'learn'].includes(mod.id))
              .filter((mod) => mod.id !== 'write' || writeEnabled)
              .filter((mod) => isEnabled(mod, enabledPlugins))
              .map((mod) => (
                <div key={mod.id} className="sidebarNavGroup">
                  <NavLink
                    to={mod.route}
                    className="sidebar-item"
                    onPointerEnter={(e) => { if (mod.tabs) openFlyout(mod.id, e.currentTarget) }}
                    onPointerLeave={() => { if (mod.tabs) closeFlyout() }}
                  >
                    <mod.icon size={18} />
                    {mod.label}
                  </NavLink>
                  {mod.id === 'chat' && <BookmarkList />}
                </div>
              ))
          )}

          {debugMode && <div className="debugBadge">DEBUG ON</div>}

          <div className="sidebarBackup">
            {/* File inputs can't be styled; the label is the button. */}
            <label className="sidebar-item">
              <RiUploadLine size={18} />
              Import
              <input
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  if (!confirm('Import replaces all data in this browser. Continue?')) return
                  // Parsed before the confirm's work begins: a bad file must not get as far as
                  // clearing a table. Failures are silent otherwise — nothing renders this throw.
                  let backup
                  try {
                    backup = parseBackup(await file.text())
                  } catch (err) {
                    alert(err instanceof Error ? err.message : 'Not a backup file.')
                    return
                  }
                  await restoreBackup(backup)
                  location.reload()
                }}
              />
            </label>

            <button
              type="button"
              className="sidebar-item"
              onClick={async () => downloadBackup(await buildBackup())}
            >
              <RiDownloadLine size={18} />
              Export
            </button>

            {personasModule && (
              <div className="sidebarPersona">
                <PersonaSwitcher />
                <NavLink to={personasModule.route} className="sidebar-item">
                  {personasModule.label}
                </NavLink>
              </div>
            )}

            {syncModule && (
              <NavLink to={syncModule.route} className="sidebar-item">
                <syncModule.icon size={18} />
                {syncModule.label}
              </NavLink>
            )}

            <div className="sidebarIconRow">
              {['ask', ...(import.meta.env.DEV ? ['learn'] : [])]
                .map((id) => modules.find((mod) => mod.id === id))
                .filter((mod) => mod !== undefined)
                .map((mod) => (
                  <NavLink
                    key={mod.id}
                    to={mod.route}
                    className="sidebar-item sidebarIconButton"
                    title={mod.label}
                    aria-label={mod.label}
                  >
                    <mod.icon size={18} />
                  </NavLink>
                ))}
            </div>

            <div className="sidebarCredit">
              made by nessuvia •{' '}
              <a
                className="sidebarCreditLink"
                href="https://github.com/Nessuvia/nessuvia-world/wiki"
                target="_blank"
                rel="noreferrer"
                title="Wiki on GitHub"
              >
                <RiGithubFill size={13} />
              </a>{' '} • {' '}
              <a
                className="sidebarCreditLink"
                href="https://reddit.com/r/Nessuvia/"
                target="_blank"
                rel="noreferrer"
                title="Nessuvia Sub-reddit"
              >
                <RiRedditFill size={13} />
              </a>{' '}
            </div>
          </div>
        </>
      )}
    </nav>

    {flyoutModule?.tabs && flyout && (
      <div
        className={`sidebarFlyout${closing ? ' closing' : ''}`}
        style={{ top: flyout.top, left: flyout.left }}
        onPointerEnter={cancelClose}
        onPointerLeave={closeFlyout}
      >
        {flyoutModule.tabs.map(([id, label]) => (
          <Link
            key={id}
            to={`${flyoutModule.route}#${id}`}
            className="sidebar-item sidebarTab"
            onClick={() => { clearTimeout(closeTimer.current); setFlyout(null); setClosing(false) }}
          >
            {label}
          </Link>
        ))}
      </div>
    )}
    </>
  )
}
