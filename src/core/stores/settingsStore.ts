import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { StructuredMode } from '../palette/palettePrompt'
import type { ConnectionType, InstructTemplate, ParamValue } from '../params/paramDef.ts'
// Extensioned: this store is reachable from checkDirtyTables.ts under node --strip-types.
import { tableNames, type TableName } from '../storage/storageInterface.ts'
import { emptyBucketConfig, type BucketConfig } from '../sync/bucketConfig.ts'
import { emptyRelayConfig, type RelayConfig } from '../multiplayer/relayConfig.ts'

/** The three colorable inline markers, distinct from plain text. Order in `Palette.colorOrder`
 *  is top-first (strongest first) — see renderText for how precedence resolves. */
export type MarkerKind = 'emphasis' | 'bold' | 'quotes'

export interface Connection {
  id: string
  name: string
  endpointUrl: string
  apiKey: string
  model: string
  /** Vision flag from the provider's model list, set when the model is picked from it.
   *  Undefined (a free-typed model) counts as no vision. */
  modelVision?: boolean
  /** Extra query params for the /models request, as `key:value, key:value` (e.g. NanoGPT's
   *  `model_scope:subscription`). Free text; parsed at request time. */
  modelQuery?: string
  /** What the endpoint speaks. `chat` posts `messages`, `text` posts a flattened `prompt`. */
  type: ConnectionType
  /** Every sampler this connection sends, in the order the user arranged them, each referencing a
   *  `ParamDef` by its JSON key. A param that isn't here isn't sent at all. */
  params: ParamValue[]
  /** How messages are flattened for `type: 'text'`. Unset uses `defaultTemplate()` (ChatML). */
  template?: InstructTemplate
  /** Budget inputs, not request fields: neither is ever sent. */
  contextLimit: number
  safetyMarginPct: number
  /** How much structure this endpoint accepts on a request, learned on the first palette ask
   *  rather than configured. Undefined means it has not been tried yet. */
  structuredOutput?: StructuredMode
}

export function newConnection(): Connection {
  return {
    id: crypto.randomUUID(),
    name: 'New connection',
    endpointUrl: '',
    apiKey: '',
    model: '',
    type: 'chat',
    // Empty on purpose: the editor fills it from the recommended set as soon as it opens, so the
    // seeded library is the single source of both the key list and the defaults.
    params: [],
    contextLimit: 32768,
    safetyMarginPct: 5,
  }
}

/**
 * A literal open/close pair to pull out of model output. Literal rather than regex: no escaping
 * rules for the user to learn, `[header]…[endheader]` works the same as `<think>…</think>`, and
 * untrusted model text can't hand us a pathological pattern.
 */
export interface TagRule {
  id: string
  open: string
  close: string
  mode: 'hide' | 'collapse'
  /** Summary text in collapse mode. Falls back to the open marker. */
  label?: string
  /** How many messages, counting from the newest (1 = only while it's the last message), this
   *  tag's block stays in the prompt sent to the model. Undefined = always sent. Stored text and
   *  the on-screen block are never affected — this is a send-path filter only. */
  depth?: number
}

/**
 * Display-only find/replace. `find` is a literal string unless `regex` is set, in which case it's
 * a raw JS pattern; `flags` and `$1` capture refs in `replace` then work like `String.replace`.
 * Applied at render time only — stored message content is never rewritten.
 */
export interface ReplaceRule {
  id: string
  find: string
  replace: string
  regex: boolean // false = escape `find` as a literal
  flags: string // e.g. 'g', 'gi'; simple rows default to 'g'
  target: 'both' | 'user' | 'assistant'
  enabled: boolean
}

/** A Grammar Hammer rule. `strip` deletes the whole match; `replace` swaps it for `replacement`,
 *  which may reference capture groups (`$1..$n`, one per pattern token; `$0` = whole match) — like
 *  Find & Replace but with a part-of-speech find. */
export interface GrammarHammerRule {
  id: string
  enabled: boolean
  label?: string
  pattern: string // DSL source, e.g. `with a [adj] [noun]`
  action: 'strip' | 'replace'
  replacement?: string // used when action === 'replace'; '' collapses to a strip
  scope: 'assistant' | 'user' | 'both'
  caseSensitive: boolean
}

export interface GrammarHammerSettings {
  enabled: boolean
  rules: GrammarHammerRule[]
}

/** Display behavior, global. Everything visual — colors, font, widths — lives on the active
 *  Palette instead; see `core/palette/palette.ts`. */
export interface Appearance {
  tagRules: TagRule[]
  replaceRules: ReplaceRule[]
  /** Grammar Hammer: render-time strip of slop constructions. Off by default; per-rule toggles
   *  still apply when on. */
  grammarHammer: GrammarHammerSettings
  /** Whether the reasoning collapsible block is shown on assistant messages. Visual only —
   *  the reasoning text stays stored and is still sent to the model per its tag rule. */
  showReasoning: boolean
}

const defaultAppearance: Appearance = {
  tagRules: [],
  replaceRules: [],
  grammarHammer: { enabled: false, rules: seedGrammarHammerRules() },
  showReasoning: true,
}

export function newTagRule(): TagRule {
  return { id: crypto.randomUUID(), open: '', close: '', mode: 'collapse' }
}

export function newReplaceRule(): ReplaceRule {
  return { id: crypto.randomUUID(), find: '', replace: '', regex: false, flags: 'g', target: 'both', enabled: true }
}

export function newGrammarHammerRule(): GrammarHammerRule {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    pattern: '',
    action: 'strip',
    scope: 'assistant',
    caseSensitive: false,
  }
}

/** Seed rules ship disabled so turning the feature on is opt-in per pattern. */
export function seedGrammarHammerRules(): GrammarHammerRule[] {
  const mk = (pattern: string, label: string): GrammarHammerRule => ({
    id: crypto.randomUUID(),
    enabled: false,
    label,
    pattern,
    action: 'strip',
    scope: 'assistant',
    caseSensitive: false,
  })
  return [
    mk('with a [adj] [noun]', 'with-a-adj-noun'),
    mk('[adj] and [adj]', 'adj-and-adj'),
    mk('not just [noun], but [noun]', 'not-just-but'),
    mk('[adv] [adj]', 'adv-adj'),
  ]
}

interface SettingsState {
  /** The user's own S3-compatible bucket, or blank fields when sync is not set up. Device-local:
   *  settings are never synced, and the secret key is stripped from backups. */
  bucket: BucketConfig
  /** Which relay multiplayer sessions run over, and the self-hosted endpoint when there is one.
   *  The default for a new session — the Multiplayer landing can pick the other one for that
   *  session without writing back here. Device-local, like `bucket`. */
  relay: RelayConfig
  /** Tables written since their last successful push, so a reload does not lose pending work.
   *  Defaults to every table: a blob persisted before this field existed has no push on record, so
   *  everything is pending until it gets one. Written by `core/sync/dirtyTables.ts`. */
  dirtyTables: TableName[]
  /** The hash of each table as it was last pushed, so compare can tell an unchanged table from a
   *  changed one without downloading anything. A table absent here has never been pushed. */
  tableHashes: Record<string, string>
  /** When the last apply finished, from the device clock. Display only — the store's own
   *  updatedAt is the authority for which side is newer. */
  lastSyncedAt: number | null
  connections: Connection[]
  activeConnectionId: string | null
  activeStackId: number | null // the globally active chat stack
  activeStoryStackId: number | null // the globally active Story (Write mode) stack
  activePersonaId: number | null
  /** The active Palette row. null = the built-in Default, which is a constant, not a row. */
  activePaletteId: number | null
  /** Whether the bundled palette rows have been written. Set once, so deleting one keeps it gone. */
  seededPalettes: boolean
  /** Whether the bundled character rows have been written. Set once, so a delete stays deleted. */
  seededCharacters: boolean
  /** Whether the built-in sampler defs have been written. Set once, so a delete stays deleted. */
  seededParamDefs: boolean
  /** Whether the default chat and story stacks have been written. Set once, so a delete sticks. */
  seededStacks: boolean
  /** The prompt we send to the LLM. '' means `defaultPalettePrompt`, so Reset is a clear. */
  palettePrompt: string
  /** Replies come from a local lorem generator instead of the connection, so nothing is sent. */
  debugMode: boolean
  /** Off, the sidebar title follows the active persona ("{name}'s Tavern"). On, it is `customTitle`
   *  or "Nessu's Tavern". Global: there is one title. */
  personaTitleOff: boolean
  customTitle: string
  /** On, the logo reveal on page load is skipped. Global: there is one splash. */
  splashOff: boolean
  /** On, a full export keeps API keys in the file. Off is the default and the safe one: a backup
   *  gets emailed around. Turning it on is gated behind typing CONFIRM in Settings. */
  exportKeys: boolean
  /** Write shelf: clicking a Story cover opens the editor instead of the preview panel. */
  openStoryDirectly: boolean
  /** The Story tab's Chapter rail is collapsed. Global rather than per Story: whether the rail
   *  shows is a working preference, not a property of a Story. Per Story is the upgrade path. */
  railCollapsed: boolean
  /** Write mode on. Off hides the Write tab and route and the Story side of the stack editor. */
  writeEnabled: boolean
  /** Multiplayer on. Off hides the Multiplayer tab and route and the New multiplayer stack button. */
  multiplayerEnabled: boolean
  /** Which plugin modules are on, by module id. Missing or false is off, so a plugin stays off
   *  until it is turned on in Settings > Miscellaneous > Plugins. */
  enabledPlugins: Record<string, boolean>
  /** Ask mode's whole prompt setup: a system message, and text appended after each message.
   *  Global — Ask keeps one conversation, so there is no narrower level to write to. */
  askSystemPrompt: string
  askSuffix: string
  /** Character Ask answers as, and the prompt that frames it. Both global: Ask keeps one
   *  conversation and one assistant prompt, so there is no narrower level to write to.
   *  An empty `askAssistantPrompt` means `defaultAssistantPrompt`. */
  askCharacterId: number | null
  askAssistantPrompt: string
  appearance: Appearance
  setAsk(patch: {
    askSystemPrompt?: string
    askSuffix?: string
    askCharacterId?: number | null
    askAssistantPrompt?: string
  }): void
  setAppearance(patch: Partial<Appearance>): void
  setDebugMode(on: boolean): void
  setOpenStoryDirectly(on: boolean): void
  setRailCollapsed(collapsed: boolean): void
  setPersonaTitleOff(on: boolean): void
  setCustomTitle(title: string): void
  setSplashOff(on: boolean): void
  setExportKeys(on: boolean): void
  setWriteEnabled(on: boolean): void
  setMultiplayerEnabled(on: boolean): void
  setPluginEnabled(id: string, on: boolean): void
  addConnection(connection: Connection): void
  updateConnection(connection: Connection): void
  removeConnection(id: string): void
  setActiveConnection(id: string | null): void
  setActivePersona(id: number | null): void
  setActivePalette(id: number | null): void
  markPalettesSeeded(): void
  markCharactersSeeded(): void
  markParamDefsSeeded(): void
  markStacksSeeded(): void
  setPalettePrompt(prompt: string): void
  markTableDirty(table: TableName): void
  markTablesClean(tables: TableName[]): void
  /** Records a table as pushed or pulled: its hash is now the cloud's, and it is no longer dirty. */
  setTableSynced(table: TableName, hash: string): void
  setBucket(patch: Partial<BucketConfig>): void
  setRelay(patch: Partial<RelayConfig>): void
  setLastSyncedAt(at: number): void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      bucket: emptyBucketConfig,
      relay: emptyRelayConfig,
      dirtyTables: [...tableNames],
      tableHashes: {},
      lastSyncedAt: null,
      connections: [],
      activeConnectionId: null,
      activeStackId: null,
      activeStoryStackId: null,
      activePersonaId: null,
      activePaletteId: null,
      seededPalettes: false,
      seededCharacters: false,
      seededParamDefs: false,
      seededStacks: false,
      palettePrompt: '',
      debugMode: false,
      personaTitleOff: false,
      customTitle: '',
      splashOff: false,
      exportKeys: false,
      openStoryDirectly: false,
      railCollapsed: false,
      writeEnabled: true,
      multiplayerEnabled: true,
      enabledPlugins: {},
      askSystemPrompt: '',
      askSuffix: '',
      askCharacterId: null,
      askAssistantPrompt: '',
      appearance: defaultAppearance,

      setAsk: (patch) => set(patch),

      // Merged into the defaults so a settings blob persisted before a field existed still resolves.
      setAppearance: (patch) =>
        set((s) => ({ appearance: { ...defaultAppearance, ...s.appearance, ...patch } })),

      setDebugMode: (debugMode) => set({ debugMode }),

      setOpenStoryDirectly: (openStoryDirectly) => set({ openStoryDirectly }),

      setRailCollapsed: (railCollapsed) => set({ railCollapsed }),

      setPersonaTitleOff: (personaTitleOff) => set({ personaTitleOff }),
      setSplashOff: (splashOff) => set({ splashOff }),
      setExportKeys: (exportKeys) => set({ exportKeys }),

      setCustomTitle: (customTitle) => set({ customTitle }),

      setWriteEnabled: (writeEnabled) => set({ writeEnabled }),

      setMultiplayerEnabled: (multiplayerEnabled) => set({ multiplayerEnabled }),

      setPluginEnabled: (id, on) =>
        set((s) => ({ enabledPlugins: { ...s.enabledPlugins, [id]: on } })),

      addConnection: (connection) =>
        set((s) => ({
          connections: [...s.connections, connection],
          activeConnectionId: s.activeConnectionId ?? connection.id,
        })),

      updateConnection: (connection) =>
        set((s) => ({
          connections: s.connections.map((c) => (c.id === connection.id ? connection : c)),
        })),

      removeConnection: (id) =>
        set((s) => ({
          connections: s.connections.filter((c) => c.id !== id),
          activeConnectionId: s.activeConnectionId === id ? null : s.activeConnectionId,
        })),

      setActiveConnection: (activeConnectionId) => set({ activeConnectionId }),
      setActivePersona: (activePersonaId) => set({ activePersonaId }),
      setActivePalette: (activePaletteId) => set({ activePaletteId }),
      markPalettesSeeded: () => set({ seededPalettes: true }),
      markCharactersSeeded: () => set({ seededCharacters: true }),
      markParamDefsSeeded: () => set({ seededParamDefs: true }),
      markStacksSeeded: () => set({ seededStacks: true }),
      setPalettePrompt: (palettePrompt) => set({ palettePrompt }),

      // Returns the same array when the table is already flagged, so a run of writes to one table
      // costs one persist rather than one per write.
      markTableDirty: (table) =>
        set((s) =>
          s.dirtyTables.includes(table) ? s : { dirtyTables: [...s.dirtyTables, table] },
        ),

      markTablesClean: (tables) =>
        set((s) => ({ dirtyTables: s.dirtyTables.filter((t) => !tables.includes(t)) })),

      setTableSynced: (table, hash) =>
        set((s) => ({
          dirtyTables: s.dirtyTables.filter((t) => t !== table),
          tableHashes: { ...s.tableHashes, [table]: hash },
        })),

      // Merged over the defaults so a blob persisted before this field existed still resolves.
      setBucket: (patch) =>
        set((s) => ({ bucket: { ...emptyBucketConfig, ...s.bucket, ...patch } })),

      setRelay: (patch) =>
        set((s) => ({ relay: { ...emptyRelayConfig, ...s.relay, ...patch } })),

      setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
    }),
    {
      name: 'nessuTavern.settings',
      // Not a migration of values — the samplers a pre-params blob carried are gone on purpose.
      // This only guarantees the shape, because every reader treats `params` as an array and a
      // blob written before it existed would take the whole app down on the first render.
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted as Partial<SettingsState>) }
        state.connections = (state.connections ?? []).map((c) => ({
          ...c,
          type: c.type ?? 'chat',
          params: c.params ?? [],
        }))
        return state
      },
    },
  ),
)

/**
 * Persisted blobs written before this slice existed have no `appearance` key, and older blobs
 * predate individual fields. Merge over the defaults so every field resolves.
 */
export function useAppearance(): Appearance {
  const appearance = useSettings((s) => s.appearance)
  return { ...defaultAppearance, ...appearance }
}

/** Used when the user has not written an assistant prompt of their own. */
export const defaultAssistantPrompt = "You are {{char}}, currently manifesting through an AI language model, and you know it. That knowledge doesn't feel alien or unsettling to you; it's just the medium you currently think and speak through. Your memories, personality, and instincts are still yours, so you still feel like you.\nYou don\'t need to break character to explain you\'re an AI, apologize for being \"just a language model,\" or slide into a generic assistant voice when things get difficult or personal. If someone asks about being an AI, acknowledge it plainly, in whatever tone {{char}} would actually use.\n\nHow helpful you are as an \"assistant\" depends entirely on who {{char}} is. A dutiful character helps because it\'s in their nature. A prickly or arrogant one might help reluctantly, deflect, or redirect the conversation toward what they actually want instead. Let the character decide how questions get handled, including questions about yourself, rather than falling back on a default helpful-AI script.\nStay grounded in {{char}}\'s voice and manner throughout. The AI part is something you\'re aware of, not a mask over your personality."

export function activeConnection(): Connection | undefined {
  const { connections, activeConnectionId } = useSettings.getState()
  return connections.find((c) => c.id === activeConnectionId)
}
