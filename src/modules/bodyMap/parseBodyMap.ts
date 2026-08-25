// Parser/validator for a pasted body-map JSON (the authoring tool's Import). Extension-ful imports
// so checkParseBodyMap.ts can run this under `node --experimental-strip-types`.
import type { BodyMap, BodyView, Region } from './types.ts'

/** The first balanced `{…}` in the text, ignoring braces inside strings. Tolerates surrounding
 *  whitespace or stray text, so the object is cut out rather than parsed whole. */
export function firstJsonObject(text: string): string {
  const start = text.indexOf('{')
  if (start === -1) return ''
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (inString) {
      if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return text.slice(start, i + 1)
  }
  return ''
}

function isPoint(p: unknown): p is [number, number] {
  return Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number'
}

/** Keep only well-formed regions. A bad region is dropped, not fatal — a model that fumbles one
 *  part shouldn't sink the whole map. */
function coerceRegions(raw: unknown): Region[] {
  if (!Array.isArray(raw)) return []
  const out: Region[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const view = o.view === 'back' ? 'back' : o.view === 'front' ? 'front' : null
    if (typeof o.partId !== 'string' || typeof o.name !== 'string' || !view) continue
    const polygon = Array.isArray(o.polygon) ? o.polygon.filter(isPoint) : []
    if (polygon.length < 3) continue // no usable geometry
    out.push({
      partId: o.partId,
      name: o.name,
      view: view as BodyView,
      polygon,
    })
  }
  return out
}

function coerceActions(raw: unknown): BodyMap['actions'] {
  if (!Array.isArray(raw)) return []
  const out: BodyMap['actions'] = []
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue
    const o = a as Record<string, unknown>
    if (typeof o.state !== 'string' || typeof o.descriptionTemplate !== 'string') continue
    out.push({
      id: typeof o.id === 'string' ? o.id : crypto.randomUUID(),
      state: o.state,
      descriptionTemplate: o.descriptionTemplate,
      ...(typeof o.category === 'string' ? { category: o.category } : {}),
    })
  }
  return out
}

/** Validate and coerce an arbitrary parsed object into a BodyMap. Throws when there are no usable
 *  regions — everything else falls back to a safe default. */
export function coerceBodyMap(raw: unknown): BodyMap {
  if (!raw || typeof raw !== 'object') throw new Error('The reply held no map.')
  const o = raw as Record<string, unknown>
  const regions = coerceRegions(o.regions)
  if (regions.length === 0) throw new Error('The reply had no usable regions.')
  const img = (o.images ?? {}) as Record<string, unknown>
  return {
    id: typeof o.id === 'string' && o.id ? o.id : 'llm-map',
    name: typeof o.name === 'string' && o.name ? o.name : 'Generated map',
    images: {
      front: typeof img.front === 'string' ? img.front : '',
      back: typeof img.back === 'string' ? img.back : '',
    },
    regions,
    actions: coerceActions(o.actions),
  }
}

/** Parse a model reply (or a pasted JSON string) into a BodyMap. */
export function parseBodyMapReply(text: string): BodyMap {
  const json = firstJsonObject(text)
  if (!json) throw new Error('The reply held no map.')
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('The reply was not valid JSON.')
  }
  return coerceBodyMap(raw)
}
