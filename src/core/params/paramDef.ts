// Extension-ful imports on purpose: the check* scripts run this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import { localOwnerId } from '../storage/storageInterface.ts'

/** What a connection speaks. `chat` posts `messages` to /chat/completions; `text` posts a flattened
 *  `prompt` string to /completions. */
export type ConnectionType = 'chat' | 'text'

/** How a param renders and how its value is coerced before it goes in the body. */
export type ParamKind = 'number' | 'slider' | 'text' | 'bool' | 'select' | 'stringList' | 'json'

/**
 * One form element in the sampler library. A def is data, not code: the built-ins are seeded rows
 * and a user-made one is the same shape, so a sampler nobody has heard of yet needs no release.
 */
export interface ParamDef {
  id?: number
  ownerId: string
  /** The JSON key sent in the request body, e.g. `dry_multiplier`. Unique across the library:
   *  a connection's params reference a def by this, not by row id, so the reference survives
   *  export, import and a re-seed on another device. */
  key: string
  label: string
  kind: ParamKind
  min?: number
  max?: number
  step?: number
  /** kind: 'select' only. */
  options?: string[]
  default: unknown
  appliesTo: ConnectionType[]
  /** One plain line under the input. */
  hint?: string
  /** Seeded with the build. Editable, and once deleted it stays deleted. */
  builtin?: boolean
}

/** A param added to a connection, in the order the user arranged it. */
export interface ParamValue {
  key: string
  value: unknown
}

/**
 * How a text-completion connection turns a message list into one string. Which template works is a
 * property of the model behind the endpoint, so it lives on the connection next to `model`.
 */
export interface InstructTemplate {
  systemPrefix: string
  systemSuffix: string
  userPrefix: string
  userSuffix: string
  modelPrefix: string
  modelSuffix: string
  /** Emitted once at the very front, a BOS token like `<|begin_of_text|>`. */
  firstPrefix?: string
  stopSequences: string[]
  trimTrailingSpace: boolean
}

/** ChatML, so a text connection sends something sane before anyone edits the template. */
export function defaultTemplate(): InstructTemplate {
  return {
    systemPrefix: '<|im_start|>system\n',
    systemSuffix: '<|im_end|>\n',
    userPrefix: '<|im_start|>user\n',
    userSuffix: '<|im_end|>\n',
    modelPrefix: '<|im_start|>assistant\n',
    modelSuffix: '<|im_end|>\n',
    stopSequences: ['<|im_end|>'],
    trimTrailingSpace: true,
  }
}

/**
 * A param's value as the request body should carry it. Returns `undefined` when the param has
 * nothing to send, an empty list or a blank json blob, so the caller omits the key rather than
 * sending a null a picky backend will reject.
 */
export function coerceValue(def: ParamDef, value: unknown): unknown {
  switch (def.kind) {
    case 'number':
    case 'slider': {
      const n = Number(value)
      return Number.isFinite(n) ? n : undefined
    }
    case 'bool':
      return Boolean(value)
    case 'stringList': {
      const list = Array.isArray(value)
        ? value.map(String)
        : String(value ?? '')
            .split(',')
            .map((s) => s.trim())
      const kept = list.filter(Boolean)
      // Some backends reject an empty stop array outright, so an empty list means "don't send".
      return kept.length ? kept : undefined
    }
    case 'json': {
      const raw = typeof value === 'string' ? value.trim() : value
      if (raw === '' || raw === undefined || raw === null) return undefined
      if (typeof raw !== 'string') return raw
      try {
        return JSON.parse(raw)
      } catch {
        return undefined
      }
    }
    default:
      return value
  }
}

/** The kind and default a pasted JSON value implies, for the new-parameter modal. */
export function inferKind(value: unknown): { kind: ParamKind; default: unknown } {
  if (typeof value === 'number') return { kind: 'number', default: value }
  if (typeof value === 'boolean') return { kind: 'bool', default: value }
  if (Array.isArray(value)) return { kind: 'stringList', default: value.map(String) }
  if (value !== null && typeof value === 'object') {
    return { kind: 'json', default: JSON.stringify(value) }
  }
  return { kind: 'text', default: String(value ?? '') }
}

/** `dry_multiplier` → `Dry multiplier`. A starting point the user can overwrite. */
export function labelFromKey(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : ''
}

/**
 * The first key/value of a pasted snippet, as a def. `{"dry_multiplier": 0.8}` is the whole input
 * the modal asks for; everything else on the def is refinement.
 */
export function defFromSnippet(raw: string): ParamDef | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const entries = Object.entries(parsed as Record<string, unknown>)
  if (!entries.length) return null
  const [key, value] = entries[0]
  const { kind, default: fallback } = inferKind(value)
  return {
    ownerId: localOwnerId,
    key,
    label: labelFromKey(key),
    kind,
    default: fallback,
    appliesTo: ['chat', 'text'],
  }
}
