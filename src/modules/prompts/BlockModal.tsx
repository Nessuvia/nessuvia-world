import type { PromptBlock } from '../../core/storage/types'
import RangeSlider from './RangeSlider'

const roles: PromptBlock['role'][] = ['system', 'user', 'assistant']

/** Every edit goes straight into the stack draft, which autosaves. There is no Save button. */
export default function BlockModal({
  block,
  nested,
  onChange,
  onDelete,
  onClose,
}: {
  block: PromptBlock
  /** Inside another block: it shares the parent's role, so there's no role to pick. */
  nested: boolean
  onChange: (block: PromptBlock) => void
  onDelete: () => void
  onClose: () => void
}) {
  // Controlled by the stack draft above — no local copy to keep in sync.
  const draft = block
  const set = (patch: Partial<PromptBlock>) => onChange({ ...draft, ...patch })
  const hasChildren = !!draft.children

  // The selected tab is the active option: picking one here is what the preview and chat use.
  const opts = draft.options
  const tab = Math.min(draft.activeOption ?? 0, (opts?.length ?? 1) - 1)
  const setTab = (i: number) => set({ activeOption: i })
  const contentVal = opts ? (opts[tab]?.content ?? '') : draft.content
  const setContent = (content: string) =>
    opts
      ? set({ options: opts.map((o, i) => (i === tab ? { ...o, content } : o)) })
      : set({ content })

  // First click seeds Option 1 from the current content, then adds a fresh tab.
  function addOption() {
    const base = opts ?? [{ name: 'Option 1', content: draft.content }]
    const next = [...base, { name: `Option ${base.length + 1}`, content: '' }]
    set({ options: next, activeOption: next.length - 1 })
  }

  function renameTab(name: string) {
    if (!opts) return
    set({ options: opts.map((o, i) => (i === tab ? { ...o, name } : o)) })
  }

  // Deleting down to one option collapses back to a plain single-content block.
  function deleteTab() {
    if (!opts) return
    const rest = opts.filter((_, i) => i !== tab)
    if (rest.length <= 1) {
      set({ options: undefined, content: rest[0]?.content ?? '', activeOption: undefined })
      return
    }
    set({ options: rest, activeOption: Math.min(tab, rest.length - 1) })
  }

  return (
    <div className="dialogBackdrop" onClick={onClose}>
      <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Edit block</h3>

        <label>
          Name
          <input value={draft.label} onChange={(e) => set({ label: e.target.value })} />
        </label>

        {nested ? (
          <p className="hint">Nested blocks take their parent's role.</p>
        ) : (
          <>
            <label>
              Role
              <select
                value={draft.role}
                disabled={draft.source === 'chatHistory'}
                onChange={(e) => set({ role: e.target.value as PromptBlock['role'] })}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            {draft.source === 'chatHistory' && (
              <p className="hint">History messages carry their own roles.</p>
            )}
          </>
        )}

        {draft.source === 'authorNote' && (
          <>
            <label>
              Depth
              <input
                type="number"
                min={0}
                value={draft.depth ?? ''}
                onChange={(e) =>
                  set({ depth: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            </label>
            <p className="hint">
              Messages from the end of the chat history. 0 is after the last message. Empty puts the
              note where the block sits in the stack. With a depth, dragging the block does not
              change where the note lands. A chat can set its own depth in chat settings.
            </p>
          </>
        )}

        {draft.input?.kind === 'range' && (
          <div className="rangeConfig">
            <label>
              Min
              <input
                type="number"
                value={draft.input.min}
                onChange={(e) => set({ input: { ...draft.input!, min: Number(e.target.value) } })}
              />
            </label>
            <label>
              Max
              <input
                type="number"
                value={draft.input.max}
                onChange={(e) => set({ input: { ...draft.input!, max: Number(e.target.value) } })}
              />
            </label>
            <label>
              Step
              <input
                type="number"
                value={draft.input.step}
                onChange={(e) => set({ input: { ...draft.input!, step: Number(e.target.value) } })}
              />
            </label>
          </div>
        )}

        {draft.input?.kind === 'range' && (
          <>
            <label className="rangeDefault">
              Default range
              <RangeSlider
                input={draft.input}
                onChange={(input) => set({ input })}
              />
            </label>
            <p className="hint">
              {'{{blockVal}}'} in the content resolves to the low end, {'{{blockVal2}}'} to the
              high end. A chat sets its own ends in chat settings.
            </p>
          </>
        )}

        {draft.source === 'text' && (
          <div className="optionContent">
            <div className="optionContentHead">
              <span>{hasChildren ? 'Text before children' : 'Content'}</span>
              {!draft.input && (
                <button type="button" className="addOption" title="Add an option" onClick={addOption}>
                  +
                </button>
              )}
            </div>

            {opts && (
              <>
                <div className="optionTabs">
                  {opts.map((o, i) => (
                    <button
                      key={i}
                      type="button"
                      className={i === tab ? 'active' : ''}
                      onClick={() => setTab(i)}
                    >
                      {o.name}
                    </button>
                  ))}
                </div>
                <label>
                  Option name
                  <input value={opts[tab]?.name ?? ''} onChange={(e) => renameTab(e.target.value)} />
                </label>
              </>
            )}

            <textarea
              rows={hasChildren ? 3 : 8}
              value={contentVal}
              onChange={(e) => setContent(e.target.value)}
            />

            {opts && (
              <button type="button" className="secondary" onClick={deleteTab}>
                Delete option
              </button>
            )}
          </div>
        )}

        {hasChildren && (
          <>
            <label>
              Text after children
              <textarea
                rows={3}
                value={draft.closeContent ?? ''}
                onChange={(e) => set({ closeContent: e.target.value })}
              />
            </label>
            <p className="hint">
              {draft.children!.length} block{draft.children!.length === 1 ? '' : 's'} inside, joined
              by newlines between these two. Leave both empty to group without adding text.
            </p>
          </>
        )}

        {draft.source !== 'chatHistory' && (
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={!!draft.toggleable}
              onChange={(e) => set({ toggleable: e.target.checked })}
            />
            Make toggleable
          </label>
        )}

        <details className="blockInfo">
          <summary>Information</summary>
          <textarea
            rows={3}
            value={draft.info ?? ''}
            onChange={(e) => set({ info: e.target.value })}
          />
          <p className="hint">Shown when hovering this block's control in chat settings.</p>
        </details>

        <div className="dialogActions">
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
