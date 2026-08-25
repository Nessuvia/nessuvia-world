import { useRef, useState } from 'react'
import { useDraft } from '../../core/stores/draftStore'
import { completeWith, menuFor } from '../../core/stores/slashCommands'
import type { CharacterTarget } from '../../core/stores/slashCommands'
import PersonaSwitcher from '../../app/PersonaSwitcher'
import CommandMenu from './CommandMenu'

export default function Composer({
  streaming,
  disabledReason,
  commandTargets,
  onSend,
  onStop,
  onRegenLast,
}: {
  streaming: boolean
  disabledReason: string
  /** The roster `/sendas` completes against. Omitted means no command menu. */
  commandTargets?: CharacterTarget[]
  onSend: (text: string) => void
  onStop: () => void
  /** Submit with nothing typed: re-roll the last reply with an instruction instead. */
  onRegenLast: () => void
}) {
  // In a store, not local state: the prompt preview lives in the sidebar and reads it from there.
  const text = useDraft((s) => s.text)
  const setText = useDraft((s) => s.setText)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const blocked = !!disabledReason || streaming
  // Same 700px breakpoint as the stylesheets. Read per render rather than through a listener: a
  // resize past the breakpoint re-renders the chat anyway, and a stale read costs one keystroke.
  const onPhone = window.matchMedia('(max-width: 700px)').matches

  // Derived, not state: the menu is a function of what's typed, so it can never disagree with it.
  const menu = commandTargets && !dismissed ? menuFor(text, commandTargets) : null
  const index = menu ? Math.min(active, menu.items.length - 1) : 0

  function write(next: string) {
    setText(next)
    setActive(0)
    box.current?.focus()
  }

  function pick(i: number) {
    if (!menu) return
    write(completeWith(text, menu.items[i]))
  }

  function submit() {
    if (blocked) return
    if (!text.trim()) {
      onRegenLast()
      return
    }
    onSend(text)
    setText('')
    setActive(0)
  }

  return (
    <div className="composer">
      {menu && <CommandMenu menu={menu} active={index} onHover={setActive} onPick={pick} />}
      <textarea
        ref={box}
        rows={3}
        value={text}
        placeholder={disabledReason || (onPhone ? 'Message…' : 'Message… (Enter sends, Shift+Enter for a newline)')}
        disabled={!!disabledReason}
        onChange={(e) => {
          setText(e.target.value)
          setActive(0)
          // Escape only hides the menu for the text that was on screen; typing brings it back.
          setDismissed(false)
        }}
        onKeyDown={(e) => {
          // The menu owns these keys while it's open, so Enter completes a command instead of
          // sending a half-typed one.
          if (menu) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              const step = e.key === 'ArrowDown' ? 1 : menu.items.length - 1
              setActive((i) => (Math.min(i, menu.items.length - 1) + step) % menu.items.length)
              return
            }
            if (e.key === 'Escape') {
              setDismissed(true)
              return
            }
            if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
              e.preventDefault()
              pick(index)
              return
            }
          }
          if (onPhone || e.key !== 'Enter' || e.shiftKey) return
          e.preventDefault()
          submit()
        }}
      />
      <div className="composerControls">
        <PersonaSwitcher />
        {streaming ? (
          <button type="button" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button type="button" disabled={blocked || !text.trim()} onClick={submit}>
            Send
          </button>
        )}
      </div>
    </div>
  )
}
