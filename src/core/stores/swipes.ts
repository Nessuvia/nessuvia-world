// Extension-ful imports on purpose: checkSwipes.ts runs this under `node --experimental-strip-types`.
import type { Message } from '../storage/types'

/** How many alternates a message has. No swipes array = the one thing it says. */
export function swipeCount(message: Message): number {
  return Math.max(1, message.swipes?.length ?? 1)
}

export function swipeIndex(message: Message): number {
  return message.swipeIndex ?? 0
}

/** The swipes array, seeded with the original text on first use. Swipe 0 is always what the
 *  model first said. */
function seeded(message: Message): string[] {
  return message.swipes?.length ? [...message.swipes] : [message.content]
}

/**
 * A finished regeneration: the new text lands as the last swipe and becomes the selected one.
 * `null` means nothing to store — a failed request leaves the message exactly as it was.
 */
export function regenerated(
  message: Message,
  text: string,
  snapshot?: string,
  reasoning?: string,
): Message | null {
  if (!text) return null
  const swipes = [...seeded(message), text]
  // Snapshots are parallel to swipes, so the array is padded rather than appended to blindly:
  // a message from before snapshots existed has holes, and a hole displays as unavailable.
  const requestSnapshots = [...(message.requestSnapshots ?? [])]
  requestSnapshots.length = swipes.length - 1
  requestSnapshots.push(snapshot)
  // reasonings pad the same way — old swipes without a captured reasoning stay holes.
  const reasonings = [...(message.reasonings ?? [])]
  reasonings.length = swipes.length - 1
  reasonings.push(reasoning || undefined)
  return { ...message, swipes, swipeIndex: swipes.length - 1, content: text, requestSnapshots, reasonings }
}

/** The request that produced the currently selected swipe, if it was kept. */
export function snapshotFor(message: Message): string | undefined {
  return message.requestSnapshots?.[swipeIndex(message)]
}

/** The model's reasoning for the currently selected swipe, if any was captured. */
export function reasoningFor(message: Message): string | undefined {
  return message.reasonings?.[swipeIndex(message)]
}

/**
 * Drop swipes by index. Returns null when nothing would be left — the caller deletes the message.
 * The selection slides back to the nearest surviving swipe at or before where it was.
 */
export function deletedSwipes(message: Message, indices: number[]): Message | null {
  const drop = new Set(indices)
  const swipes = seeded(message).filter((_, i) => !drop.has(i))
  if (!swipes.length) return null
  const keep = (arr: (string | undefined)[] | undefined) =>
    arr ? arr.filter((_, i) => !drop.has(i)) : undefined
  const before = [...drop].filter((i) => i < swipeIndex(message)).length
  const at = Math.min(Math.max(swipeIndex(message) - before, 0), swipes.length - 1)
  return {
    ...message,
    swipes,
    swipeIndex: at,
    content: swipes[at],
    requestSnapshots: keep(message.requestSnapshots),
    reasonings: keep(message.reasonings),
  }
}

/** Select an alternate. Out-of-range clamps rather than throwing. */
export function selectSwipe(message: Message, index: number): Message {
  const swipes = seeded(message)
  const at = Math.min(Math.max(index, 0), swipes.length - 1)
  return { ...message, swipes, swipeIndex: at, content: swipes[at] }
}
