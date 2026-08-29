import type { PromptBlock } from '../../core/storage/types'
import type { MoveDir } from './blockTree'
import { blockType, typeLabels } from './blockTypes'
import type { BlockType } from './blockTypes'

const arrowDir: Record<string, MoveDir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

export default function BlockCard({
  block,
  types,
  takenTypes,
  onClick,
  onType,
  onAddChild,
  onToggle,
  onMove,
  onDragStart,
  onDragOver,
}: {
  block: PromptBlock
  /** Types this stack's kind offers, in picker order. */
  types: BlockType[]
  /** Types this block can't take: bound sources used elsewhere, and history inside a container. */
  takenTypes: BlockType[]
  onClick: () => void
  onType: (type: BlockType) => void
  onAddChild: () => void
  onToggle: () => void
  /** Arrow-key move when the card itself (not a control inside it) has focus. */
  onMove: (dir: MoveDir) => void
  onDragStart: () => void
  onDragOver: (before: boolean) => void
}) {
  const wraps = (block.closeContent ?? '').trim() !== ''
  const type = blockType(block)

  return (
    <div
      className={`card blockCard${block.children ? ' container' : ''}${block.disabled ? ' off' : ''}${
        block.depth === undefined ? '' : ' pinned'
      }`}
      tabIndex={0}
      data-block-id={block.id}
      onKeyDown={(e) => {
        const dir = arrowDir[e.key]
        // Only when the card itself is focused, arrows inside the select/checkbox behave normally.
        if (!dir || e.target !== e.currentTarget) return
        e.preventDefault()
        onMove(dir)
      }}
      draggable
      onDragStart={(e) => {
        // Firefox refuses to start a drag without payload, even though we track state ourselves.
        e.dataTransfer.setData('text/plain', block.id)
        onDragStart()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        const box = e.currentTarget.getBoundingClientRect()
        onDragOver(e.clientY < box.top + box.height / 2)
      }}
      onClick={onClick}
    >
      <input
        type="checkbox"
        className="blockSwitch"
        checked={!block.disabled}
        title={block.disabled ? 'Switched off' : 'Switched on'}
        aria-label={`${block.label} enabled`}
        onClick={(e) => e.stopPropagation()} // the card itself opens the modal
        onChange={onToggle}
      />
      <span className="blockLabel" title={wraps ? 'Wraps its children' : undefined}>
        {block.label}
      </span>
      <select
        className="blockType"
        value={type}
        aria-label={`${block.label} type`}
        onClick={(e) => e.stopPropagation()} // the card itself opens the modal
        onChange={(e) => onType(e.target.value as BlockType)}
      >
        {types.map((t) => (
          <option key={t} value={t} disabled={t !== type && takenTypes.includes(t)}>
            {typeLabels[t]}
          </option>
        ))}
      </select>
      {block.source !== 'chatHistory' && <span className="blockRole">{block.role}</span>}
      {block.depth !== undefined && <span className="blockDepth">depth {block.depth}</span>}
      {block.source !== 'chatHistory' && (
        <button
          type="button"
          className="addChild"
          title="Add a block inside this one"
          onClick={(e) => {
            e.stopPropagation() // the card itself opens the modal
            onAddChild()
          }}
        >
          +
        </button>
      )}
    </div>
  )
}
