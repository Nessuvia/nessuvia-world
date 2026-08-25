import { useRef, useState } from 'react'
import type { DragEvent } from 'react'

export interface DragReorder {
  /** Spread onto each draggable row. */
  itemProps(index: number): {
    draggable: boolean
    onDragStart: () => void
    onDragOver: (e: DragEvent) => void
    onDrop: (e: DragEvent) => void
    onDragEnd: () => void
  }
  /** The index currently hovered as a drop target, for the highlight class. */
  over: number | null
}

/**
 * Drag-to-reorder over a list, using native HTML5 drag events.
 * `onReorder` receives the moved item's original and new index and is not called for a no-op drop.
 * `pinnedFirst` blocks moving index 0 and blocks dropping anything ahead of it.
 */
export function useDragReorder(
  onReorder: (from: number, to: number) => void,
  pinnedFirst?: boolean,
): DragReorder {
  const drag = useRef<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  function drop(to: number) {
    const from = drag.current
    drag.current = null
    setOver(null)
    if (from === null || from === to) return
    if (pinnedFirst && (from === 0 || to === 0)) return
    onReorder(from, to)
  }

  return {
    over,
    itemProps(index: number) {
      return {
        draggable: true,
        onDragStart: () => (drag.current = index),
        onDragOver: (e: DragEvent) => {
          e.preventDefault()
          setOver(index)
        },
        onDrop: (e: DragEvent) => {
          e.preventDefault()
          drop(index)
        },
        onDragEnd: () => {
          drag.current = null
          setOver(null)
        },
      }
    },
  }
}
