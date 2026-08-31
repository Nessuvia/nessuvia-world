// Ordering for the Story rail's sections. Pinned ids come first in the order they were pinned;
// everything else keeps its declared order. Its own file so checkRailOrder.ts can import it
// without pulling React in.

/** Pinned ids first (pin order), then the rest in declared order. Pinned ids that no longer
 *  name a section are dropped rather than treated as an error: a section can be removed. */
export function railOrder(ids: readonly string[], pinned: readonly string[]): string[] {
  const front = pinned.filter((id) => ids.includes(id))
  return [...front, ...ids.filter((id) => !front.includes(id))]
}

/** Pinning appends to the end of the pinned group; unpinning drops the id. */
export function togglePin(pinned: readonly string[], id: string): string[] {
  return pinned.includes(id) ? pinned.filter((p) => p !== id) : [...pinned, id]
}
