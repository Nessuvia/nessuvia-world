// Output generation: turn a TrackerState into the text block the host appends to messages.
// One line per part with actions; multiple actions on a part collapse into that one line.

import type { AppliedAction, BodyMap, HostContext, TrackerState } from './types'

/** Substitute {{part}}, {{user}}, {{char}} and any extra HostContext vars. Case-insensitive;
 *  unknown tokens are left in place (same rule as the core prompt layer). */
export function resolveTemplate(template: string, part: string, ctx: HostContext): string {
  const values: Record<string, string> = { ...ctx, part }
  return template.replace(/\{\{(\w+)\}\}/g, (whole, token: string) => {
    const value = values[token.toLowerCase()]
    return value ?? whole
  })
}

/** Resolve one action's description against a part name + context. Used at apply time so stored
 *  output never drifts with later context changes. */
export function resolveAction(action: AppliedAction, part: string, ctx: HostContext): string {
  return resolveTemplate(action.resolvedDescription, part, ctx)
}

/** Join multiple actions on one part into a single line's worth of text. Comma-separated
 *  descriptions: the documented collapse for Phase 1. */
export function collapseActions(descriptions: string[]): string {
  return descriptions.join(', ')
}

/** Build the full block, or '' when the tracker is empty or disabled. Lines are ordered by the
 *  map's region order so output is stable, not insertion-order dependent. */
export function buildBlock(state: TrackerState, map: BodyMap, ctx: HostContext): string {
  if (!state.enabled) return ''
  const nameFor = new Map(map.regions.map((r) => [r.partId, r.name]))
  const order = new Map(map.regions.map((r, i) => [r.partId, i]))
  const partIds = Object.keys(state.parts)
    .filter((partId) => (state.parts[partId]?.length ?? 0) > 0)
    .sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity))
  if (partIds.length === 0) return ''

  const lines = partIds.map((partId) => {
    const part = nameFor.get(partId) ?? partId
    const descriptions = state.parts[partId].map((a) => resolveAction(a, part, ctx))
    return collapseActions(descriptions)
  })
  const body = lines.join('\n')
  const tag = state.tag.trim()
  if (!tag) return body
  return `<${tag}>\n${body}\n</${tag}>`
}
