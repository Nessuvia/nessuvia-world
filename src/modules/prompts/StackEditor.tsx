import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { PromptBlock, PromptStack } from '../../core/storage/types'
import { newBlock, useStacks } from '../../core/stores/stacksStore'
import { useSettings } from '../../core/stores/settingsStore'
import {
  addChild,
  allBlocks,
  contains,
  findBlock,
  insertBlock,
  moveByKey,
  removeBlock,
  replaceBlock as replaceInTree,
} from './blockTree'
import type { MoveDir } from './blockTree'
import BlockCard from './BlockCard'
import { applyType, kindTypes } from './blockTypes'
import type { BlockType } from './blockTypes'
import { boundSources, kindSources, stackKind, validateStack } from './stackKinds'
import type { StackKind } from './stackKinds'
import { CollapseButton, CollapseRail } from '../../app/CollapseButton'
import BlockModal from './BlockModal'
import { exportStack, parseStack } from './stackFile'
import PromptPreview from './PromptPreview'
import './prompts.css'
import { RiDownloadLine, RiUploadLine } from '@remixicon/react'

type Zone = 'active' | 'inactive'

interface Drop {
  zone: Zone
  parentId: string | null
  /** The block the dragged one lands in front of; null appends to that list. */
  beforeId: string | null
}

const indent = (depth: number) => ({ marginLeft: depth * 20 })

function nextBlockLabel(stack: PromptStack) {
  const used = [...stack.active, ...stack.inactive]
    .map((b) => Number(/^Block (\d+)$/.exec(b.label)?.[1] ?? 0))
    .reduce((a, b) => Math.max(a, b), 0)
  return `Block ${used + 1}`
}

export default function StackEditor() {
  const { stacks, load, save, create, duplicate, remove, ensureActive } = useStacks()
  // The Chat | Story switch. Not persisted — which builder you're looking at is a glance-level
  // choice; the active stack of each kind lives in settings. `?kind=story` is how the Story
  // sidebar's edit link lands on the right builder.
  const [params] = useSearchParams()
  const writeEnabled = useSettings((s) => s.writeEnabled)
  const [kind, setKind] = useState<StackKind>(
    writeEnabled && params.get('kind') === 'story' ? 'story' : 'chat',
  )
  const activeStackId = useSettings((s) => s.activeStackId)
  const activeStoryStackId = useSettings((s) => s.activeStoryStackId)
  const activeId = kind === 'story' ? activeStoryStackId : activeStackId
  const [draft, setDraft] = useState<PromptStack | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // sessionStorage, not a stored setting: survives navigation, clears on tab close.
  // ponytail: global for the tab, not per stack — key by stack id if that matters.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    JSON.parse(sessionStorage.getItem('promptsCollapsed') ?? '{"inactive":true}'),
  )
  const toggleZone = (key: string) =>
    setCollapsed((c) => {
      const next = { ...c, [key]: !c[key] }
      sessionStorage.setItem('promptsCollapsed', JSON.stringify(next))
      return next
    })
  const [saved, setSaved] = useState(false)

  const [nestError, setNestError] = useState('')
  // After a keyboard move the card lands in a new spot; refocus it so arrows keep working.
  const [focusId, setFocusId] = useState<string | null>(null)

  const fileInput = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState('')

  const drag = useRef<{ id: string; zone: Zone } | null>(null)
  // Drop targets are addressed by parent and next-sibling id, not an index: after the dragged
  // block is pulled out of the tree every index would have shifted.
  const [drop, setDrop] = useState<Drop | null>(null)

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    ensureActive(kind).then((s) => {
      setDraft(s)
      setSaved(true) // freshly loaded stack is already in sync — don't autosave it back
    })
  }, [kind, activeId, ensureActive])

  // Turning Write off while the Story builder is showing snaps back to the chat stack.
  useEffect(() => {
    if (!writeEnabled && kind === 'story') setKind('chat')
  }, [writeEnabled, kind])

  useEffect(() => {
    if (!focusId) return
    const el = document.querySelector<HTMLElement>(`[data-block-id="${focusId}"]`)
    el?.focus()
  }, [focusId, draft])

  const reason = draft ? validateStack(draft) : ''

  // The one write path: the debounce below and Ctrl+S both go through it.
  async function persist() {
    if (reason || !draft) return
    await save(draft)
    setSaved(true)
  }

  // Debounced autosave: fires 1s after the last edit.
  useEffect(() => {
    if (saved || reason || !draft) return
    const timer = setTimeout(persist, 1000)
    return () => clearTimeout(timer)
  }, [saved, reason, draft, save])

  if (!draft) return <p className="placeholder">Loading…</p>

  // The bound sources and allowed sources for this stack's kind (chat vs story).
  const bound = boundSources[stackKind(draft)]
  const sources = kindSources(stackKind(draft))
  const blocks = [...allBlocks(draft.active), ...allBlocks(draft.inactive)]
  const editing = blocks.find((b) => b.id === editingId)
  const parentOf = (id: string) =>
    blocks.find((b) => (b.children ?? []).some((c) => c.id === id))
  // What the picker on each card offers. One description block, not three — a bound source already
  // used elsewhere in the stack is offered but disabled.
  const types = kindTypes(sources)
  const takenTypes = (block: PromptBlock, nested: boolean): BlockType[] => [
    ...blocks.filter((b) => b.id !== block.id).map((b) => b.source).filter((s) => bound.includes(s)),
    // Chat History's turns carry their own roles, so it can't sit inside another block.
    ...(nested ? (['chatHistory'] as BlockType[]) : []),
  ]

  // An imported file lands as a new stack of its own kind, and becomes the active one. It never
  // overwrites the stack you were looking at.
  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportError('')
    try {
      const imported = parseStack(await file.text())
      const id = await save(imported)
      const importedKind = stackKind(imported)
      useSettings.setState(
        importedKind === 'story' ? { activeStoryStackId: id } : { activeStackId: id },
      )
      setKind(importedKind)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.')
    }
  }

  function change(next: PromptStack) {
    setDraft(next)
    setSaved(false)
    setNestError('')
  }

  function move(target: Drop) {
    const from = drag.current
    if (!from || !draft) return
    const block = findBlock(draft[from.zone], from.id)
    if (!block || target.beforeId === from.id) return
    if (block.source === 'chatHistory' && target.parentId !== null) {
      setNestError("Chat History can't go inside another block — its turns carry their own roles.")
      return
    }
    // Dropping a container into its own subtree would detach both from the tree.
    if (target.parentId && contains(block, target.parentId)) return

    const pruned = removeBlock(draft[from.zone], from.id)
    if (from.zone === target.zone) {
      change({
        ...draft,
        [target.zone]: insertBlock(pruned, block, target.parentId, target.beforeId),
      })
    } else {
      change({
        ...draft,
        [from.zone]: pruned,
        [target.zone]: insertBlock(draft[target.zone], block, target.parentId, target.beforeId),
      })
    }
  }

  function moveBlock(zone: Zone, id: string, dir: MoveDir) {
    if (!draft) return
    const next = moveByKey(draft[zone], id, dir)
    if (!next) return // edge of the list, already top level, or a nest Chat History can't take
    change({ ...draft, [zone]: next })
    setFocusId(id) // the card moved in the tree; put focus back on it
  }

  function replaceBlock(block: PromptBlock, closeModal = true) {
    if (!draft) return
    change({
      ...draft,
      active: replaceInTree(draft.active, block),
      inactive: replaceInTree(draft.inactive, block),
    })
    if (closeModal) setEditingId(null)
  }

  function deleteBlock(id: string) {
    if (!draft) return
    // Children go with the parent: a wrapper's contents don't outlive their tags.
    change({ ...draft, active: removeBlock(draft.active, id), inactive: removeBlock(draft.inactive, id) })
    setEditingId(null)
  }

  function append(block: PromptBlock, edit: boolean) {
    if (!draft) return
    change({ ...draft, active: [...draft.active, block] })
    if (edit) setEditingId(block.id)
  }

  // Every block starts as freeform text at the bottom of the stack; the picker on the card is
  // where it becomes something else.
  const addBlock = () => append(newBlock({ label: nextBlockLabel(draft) }), false)

  const setType = (block: PromptBlock, type: BlockType) =>
    replaceBlock(applyType(block, type), false)

  function addChildBlock(zone: Zone, parentId: string) {
    if (!draft) return
    const child = newBlock({ label: nextBlockLabel(draft), role: findBlock(draft[zone], parentId)!.role })
    change({ ...draft, [zone]: addChild(draft[zone], parentId, child) })
    setEditingId(child.id)
  }

  function isDropHere(zone: Zone, parentId: string | null, beforeId: string | null) {
    return drop?.zone === zone && drop.parentId === parentId && drop.beforeId === beforeId
  }

  function renderList(zone: Zone, list: PromptBlock[], parentId: string | null, depth: number) {
    return (
      <>
        {list.map((block, i) => (
          <div key={block.id}>
            {isDropHere(zone, parentId, block.id) && (
              <div className="dropLine" style={indent(depth)} />
            )}
            <div style={indent(depth)}>
              <BlockCard
                block={block}
                types={types}
                takenTypes={takenTypes(block, parentId !== null)}
                onClick={() => setEditingId(block.id)}
                onType={(type) => setType(block, type)}
                onAddChild={() => addChildBlock(zone, block.id)}
                onToggle={() => replaceBlock({ ...block, disabled: !block.disabled }, false)}
                onMove={(dir) => moveBlock(zone, block.id, dir)}
                onDragStart={() => (drag.current = { id: block.id, zone })}
                onDragOver={(before) =>
                  // Below the midpoint means "in front of my next sibling", so a container's
                  // whole subtree stays together.
                  setDrop({ zone, parentId, beforeId: before ? block.id : (list[i + 1]?.id ?? null) })
                }
              />
            </div>
            {block.children && renderList(zone, block.children, block.id, depth + 1)}
          </div>
        ))}

        {isDropHere(zone, parentId, null) && <div className="dropLine" style={indent(depth)} />}

        {parentId !== null && list.length === 0 && (
          <div
            className="childSlot"
            style={indent(depth)}
            onDragOver={(e) => {
              e.preventDefault()
              setDrop({ zone, parentId, beforeId: null })
            }}
          />
        )}
      </>
    )
  }

  function renderZone(zone: Zone, title: string, hint: ReactNode) {
    const list = draft![zone]
    const shut = !!collapsed[zone]
    if (shut) {
      return (
        <CollapseRail label={title} onToggle={() => toggleZone(zone)} />
      )
    }
    return (
      <section
        className="panel stackZone"
        onDragOver={(e) => {
          e.preventDefault()
          // Bare zone background: land at the end of the top level, not inside anything.
          if (e.target === e.currentTarget) setDrop({ zone, parentId: null, beforeId: null })
        }}
        onDrop={(e) => {
          e.preventDefault()
          move(drop?.zone === zone ? drop : { zone, parentId: null, beforeId: null })
          drag.current = null
          setDrop(null)
        }}
        onDragEnd={() => {
          drag.current = null
          setDrop(null)
        }}
      >
        <div className="zoneHeader">
          <CollapseButton label={title} collapsed={false} onToggle={() => toggleZone(zone)} />
          <h3>{title}</h3>
          {zone === 'active' && (
            <button type="button" onClick={addBlock}>
              Add block
            </button>
          )}
        </div>
        <p className="hint">{hint}</p>
        <div className="blockList">
          {renderList(zone, list, null, 0)}
          {list.length === 0 && <p className="placeholder">Drop blocks here.</p>}
        </div>
      </section>
    )
  }

  return (
    <div className="prompts screenFrame">
      <h2>Prompt stacks</h2>

      {/* The Story builder only exists in Write mode; with it off there's just the chat stack. */}
      {writeEnabled && (
        <div className="kindSwitch">
          <button
            type="button"
            className={kind === 'chat' ? 'active' : ''}
            onClick={() => setKind('chat')}
          >
            Chat
          </button>
          <button
            type="button"
            className={kind === 'story' ? 'active' : ''}
            onClick={() => setKind('story')}
          >
            Story
          </button>
        </div>
      )}

      <div className="presetRow">
        <div>
          <select
            value={activeId ?? ''}
            onChange={(e) =>
              useSettings.setState(
                kind === 'story'
                  ? { activeStoryStackId: Number(e.target.value) }
                  : { activeStackId: Number(e.target.value) },
              )
            }
          >
            {stacks
              .filter((s) => stackKind(s) === kind)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <button type="button" onClick={() => create(kind)}>
            New
          </button>
          {/* A session-shaped chat stack: cast slots instead of the speaker's own description. */}
          {kind === 'chat' && (
            <button type="button" onClick={() => create('chat', 'multiplayer')}>
              New multiplayer
            </button>
          )}
          <button type="button" onClick={() => duplicate(draft.id!)}>
            Duplicate
          </button>
          <button type="button" className="danger" onClick={() => remove(draft.id!)}>
            Delete
          </button>
        </div>
        <div>
          {reason ? <span className="error">{reason}</span> : saved && <span className="hint">Saved</span>}
          <button type="button" onClick={() => fileInput.current?.click()}>
            <RiUploadLine size={14} /> Import
          </button>
          <button type="button" onClick={() => exportStack(draft)}>
            <RiDownloadLine size={14} /> Export
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={onImportFile}
          />
        </div>
      </div>
      {importError && <p className="error">{importError}</p>}

      <div className="presetRow">
        Name: 
        <input
          value={draft.name}
          onChange={(e) => change({ ...draft, name: e.target.value })}
          aria-label="Stack name"
        />
      </div>

      {nestError && <p className="error">{nestError}</p>}

      <div className="screenBody zones">
        {renderZone(
          'inactive',
          'Inactive',
          <>
            For when you want to <s>delete something but you have control issues</s> keep something
            on the side.
          </>,
        )}
        {renderZone(
          'active',
          'Active stack',
          'Assembled top to bottom. “+” on a block nests another inside it.',
        )}
        <PromptPreview
          stack={draft}
          collapsed={!!collapsed.preview}
          onToggleCollapsed={() => toggleZone('preview')}
        />
      </div>

      {editing && (
        <BlockModal
          block={editing}
          nested={!!parentOf(editing.id)}
          onChange={(b) => replaceBlock(b, false)}
          onDelete={() => deleteBlock(editing.id)}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  )
}

// native HTML5 DnD — no touch support, no keyboard reorder. dnd-kit if that bites.
