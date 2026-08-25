export interface Character {
  id?: number
  ownerId: string
  name: string
  displayName?: string // shown in lists, the character page, and chats; '' or unset falls back to name. {{char}} and the API payload always use name.
  avatar: string // base64 data URL of the ORIGINAL, uncropped image; '' when unset
  avatarCrop?: AvatarCrop // how to frame `avatar`; unset shows the whole image
  description: string
  personality: string
  scenario: string
  firstMessage: string
  exampleDialogue: string
  altDescriptions: { title: string; content: string }[]
  activeDescriptionIndex: number // -1 = use `description` verbatim
  alternateGreetings: string[]
  // Externally hosted image URLs; nothing is downloaded or stored locally. When local images land,
  // the bytes belong in a `galleryImages` table keyed on characterId (not on this record, which
  // every list load pulls in full) and this becomes an array of {url} | {imageId} objects.
  gallery: string[]
  // Free-text tags. Order matters: tags[0] is the character's group in the picker's grouped view.
  // Unindexed on purpose — the whole roster is in memory, so filtering is an array pass.
  tags: string[]
  rawCard?: unknown // original parsed card, untouched
  paramOverrides?: ParamOverrides
  stackId?: number // declared now, no UI until it's wanted
  /** Imported lorebook metadata. The entries themselves live in the `worldInfo` table. */
  worldBook?: WorldBook
  createdAt: number
  updatedAt: number
  colors: CharacterColors // per-speaker overrides; each '' = fall through to the global appearance color
}

/**
 * The visible window onto an avatar image, as fractions (0–1) of its natural size. Stored instead
 * of a second cropped copy of the pixels: `avatar` keeps the original the user uploaded, the crop
 * is applied at render time by <Avatar>, and the Gallery can show the whole image.
 */
export interface AvatarCrop {
  x: number
  y: number
  w: number
  h: number
}

/**
 * A lorebook entry, owned by one character. Global/shared books are the planned next level: when
 * they land this record keeps `characterId`, and a book gains a row of its own — no migration.
 */
export interface WorldInfoEntry {
  id?: number
  ownerId: string
  characterId: number
  name: string // row label; cards keep it in `comment`, so import falls back through name and keys
  keys: string[] // trigger words, matched case-insensitively
  content: string
  always: boolean // inject regardless of keys (a card's `constant`)
  enabled: boolean
  scanDepth?: number // trailing messages to scan for keys; absent = the book's, then defaultDepth
  order: number // position among matches (a card's `insertion_order`)
  // The untouched card entry, same contract as Character.rawCard. This is what keeps the fields
  // this release ignores — secondary_keys, selective, priority, probability, position, extensions —
  // from being lost on import and re-export.
  raw?: unknown
}

/** Book-level metadata from a card's `character_book`. Four scalars, so it rides on the Character
 *  record; the entries are the big payload and get their own table. */
export interface WorldBook {
  name: string
  description: string
  scanDepth?: number // card's `scan_depth`: the default for entries that don't override it
  tokenBudget?: number // card's `token_budget`: cap on the whole block's text
}

/** Anything that renders as an avatar. Character and Persona both satisfy it structurally. */
export interface AvatarSource {
  avatar: string
  avatarCrop?: AvatarCrop
}

/** Per-speaker color overrides. Same set as the global appearance knobs; an empty string on any
 *  field means "no override, use the global color". Flat and named (mirrors Appearance) so it can
 *  grow a field when we actually add one — not an open Record. */
export interface CharacterColors {
  textColor: string
  emphasisColor: string
  boldColor: string
  quoteColor: string
}

export function emptyColors(): CharacterColors {
  return { textColor: '', emphasisColor: '', boldColor: '', quoteColor: '' }
}

/** Partial patches over a Connection's params. Field names mirror Connection exactly — no mapping
 *  layer. An unset field falls through to the next level down (chat > character > connection). */
export interface ParamOverrides {
  contextLimit?: number
  safetyMarginPct?: number
  /** Sampler overrides, keyed by the param's JSON key (`temperature`, `dry_multiplier`, …). A key
   *  absent here inherits; a key the connection doesn't carry is ignored, since overrides change
   *  what a sampler is set to and never which samplers get sent. */
  params?: Record<string, unknown>
}

/** A text block's live content: the chosen option, or plain `content` when there are no options. */
export function activeContent(block: PromptBlock): string {
  if (!block.options) return block.content
  return block.options[block.activeOption ?? 0]?.content ?? ''
}

/** The description actually used: the active variant, or `description` when there isn't one. */
export function activeDescription(c: Character): string {
  const variant = c.altDescriptions[c.activeDescriptionIndex]
  return c.activeDescriptionIndex >= 0 && variant ? variant.content : c.description
}

/** Who you are in a chat: the {{user}} name, plus description text a stack can bind to. */
export interface Persona {
  id?: number
  ownerId: string
  name: string
  avatar: string // base64 data URL of the ORIGINAL, uncropped image; '' when unset
  avatarCrop?: AvatarCrop // how to frame `avatar`; unset shows the whole image
  description: string
  createdAt: number
  updatedAt: number
  colors: CharacterColors // per-speaker overrides; each '' = fall through to the global appearance color
}

export interface Chat {
  id?: number
  ownerId: string
  characterId: number // stays populated (first participant) so existing queries keep working
  title: string
  /** Group chats. Empty/absent = solo, and `characterId` remains the character. */
  participantIds?: number[]
  /** Round-robin cursor: index into participantIds of whoever spoke last. */
  lastSpeakerIndex?: number
  /** Pinned responder: only this participant replies to your messages, until cleared. Absent =
   *  round robin. Clicking a roster avatar still triggers anyone manually. */
  respondWith?: number
  /** Label every turn with who said it, even with a one-character roster. Several *people* speak
   *  in a multiplayer session even when one character replies, so the labels earn their tokens.
   *  Absent = labels only in a genuine group, as `isGroup` decides. */
  nameSpeakers?: boolean
  /** This chat's own prompt stack, overriding the globally active one. Absent = use the global.
   *  A multiplayer session sets it so the session's stack cannot leak into ordinary chats. */
  stackId?: number
  /** Keep the round robin going after your message instead of stopping at one reply. */
  selfReply?: boolean
  /** How many characters reply to each of your messages. Capped at the roster size, so nobody
   *  speaks twice in a row. Default 1. */
  selfReplyCount?: number
  /** Width of the chat area as a percentage of its container. Default 100. */
  chatWidth?: number
  authorNote?: string
  authorNoteDepth?: number // messages from the end; default 2
  /** Pinned to the sidebar for quick access. Absent = not bookmarked. */
  bookmarked?: boolean
  paramOverrides?: ParamOverrides
  createdAt: number
  updatedAt: number
}

/** Who a turn is attributed to, when it is not the active persona. */
export interface SpeakerAs {
  name: string
  personaId?: number
}

export interface Message {
  id?: number
  ownerId: string
  chatId: number
  role: 'user' | 'assistant'
  content: string // exactly what was typed/streamed, never transformed
  // Stamped on user turns at send time. The name is a copy on purpose: delete the persona and
  // old turns still show who said them. Absent on assistant turns and on pre-persona messages.
  personaId?: number
  personaName?: string
  /** Alternates for an assistant message. Empty/absent = never regenerated.
   *  `content` always mirrors swipes[swipeIndex]; readers that don't care about swipes keep working.
   *  swipes duplicate the chosen text into content — one denormalised field beats
   *  touching every reader. */
  swipes?: string[]
  swipeIndex?: number
  /** The model's reasoning for each swipe, parallel to `swipes` (holes where none/absent). Kept out
   *  of `content` so it's rendered separately and never fed back into history on later turns. */
  reasonings?: (string | undefined)[]
  /** Which character said this, in a group chat. Absent = the chat's single character. */
  speakerId?: number
  speakerName?: string
  /** The request that produced each swipe, parallel to `swipes`, for the inspector. Each entry is
   *  a key-free JSON string — a string so Dexie never indexes into it, and undefined where the
   *  snapshot was never taken or was past ~256 KB. The field is unindexed, so its shape can change
   *  without a schema version. */
  requestSnapshots?: (string | undefined)[]
  createdAt: number
}

/** A Story is the top-level Write work: title + Cover, plus its attached cast. It holds no stack id
 *  — the Story stack is globally active (sub-goal B). Its prose lives in Chapters, not here. */
export interface Story {
  id?: number
  ownerId: string
  title: string
  cover: string // cropped 3:4 data URL, '' when unset (placeholder shown)
  /** Attached characters/personas with their per-entry on/off state. Cast wiring is sub-goal C;
   *  the shape lands now so the Story row doesn't need a schema bump later. */
  cast: CastEntry[]
  /** The Author's standing instruction for this Story, placed by the `authorNote` bound block.
   *  Per Story by decision — not global, not per Chapter. */
  authorNote: string
  /** Loose notes the Author keeps with the Story — a stack of sticky notes, per Story. */
  scratchpad?: string[]
  /** Percent of the editor column the prose is displayed at. Per Story, like the Chat record's
   *  `chatWidth` — reading width is a property of the work, not a global default. Absent = 100. */
  storyWidth?: number
  /** Sampling overrides for this Story, over the connection's own values. The cast contributes
   *  nothing: with several characters attached there is no non-arbitrary winner. */
  paramOverrides?: ParamOverrides
  createdAt: number
  updatedAt: number
}

export interface CastEntry {
  kind: 'character' | 'persona'
  id: number
  enabled: boolean
}

/** An ordered unit of a Story: a title, a plan, and (eventually) prose. A Story is a list of these,
 *  starting at one. A Chapter carries its plan whether or not it has prose yet — that's what lets
 *  the same field read as recap for written Chapters and as intent for unwritten ones. */
export interface Chapter {
  id?: number
  ownerId: string
  storyId: number
  order: number // position within the Story
  title: string
  /** One field, both jobs. The Chapter guide decides how it's labelled from the Chapter's state. */
  summary: string
  beats: string[] // ordered; only the active Chapter's render in full
  /** Off keeps the Chapter out of the Chapter guide. Its prose still scrolls in as Story context. */
  sendEnabled: boolean
  text: string // raw prose, stored as-is
  /** The span the last generation wrote into `text`, and the Direction that produced it. What makes
   *  Retry / Continue / Undo possible across a reload. `text` is stored alongside the offsets so the
   *  span is self-validating: if `chapter.text.slice(start, end)` no longer equals it, the Author
   *  edited over it and the span is gone — see `validSpan` in writeStore. */
  lastGeneration?: { start: number; end: number; text: string; direction: string }
  createdAt: number
  updatedAt: number
}

export type BlockSource =
  | 'text' // freeform, supports {{char}} / {{user}}
  | 'characterDescription' // resolves the active description variant
  | 'characterPersonality'
  | 'characterScenario'
  | 'characterExampleDialogue'
  | 'personaDescription' // the active persona's description
  | 'authorNote' // the chat's author's note; skipped when empty
  | 'worldInfo' // the speaking character's matched lorebook entries; skipped when none match
  | 'chatHistory' // mandatory, exactly one per chat stack
  // Story-stack bound sources (Write mode). Wiring lives in sub-goal C; here they're just sources.
  | 'cast' // the Story's enabled characters/personas (full cards)
  | 'storyContext' // the scrolling Story prose; mandatory, exactly one per story stack
  | 'chapterGuide' // the Chapter list with state stamps; optional, at most one per story stack
  | 'storyTrailing' // prose after the caret, to the end of the active Chapter; empty with no caret

export interface PromptBlock {
  id: string // crypto.randomUUID()
  label: string // 'Block 1' on creation, renamed in the modal
  source: BlockSource
  role: 'system' | 'user' | 'assistant'
  content: string // only meaningful when source === 'text' with no options; the text *before* any children
  /** Named content variants for a text block. Absent = plain single `content`. Two or more makes
   *  the block pickable in chat settings; `activeOption` chooses which one is used. */
  options?: { name: string; content: string }[]
  activeOption?: number
  /** Text after the children — the closing half of a wrapper (`</characters>`). */
  closeContent?: string
  /** Only meaningful on an authorNote block: inject N messages from the end of history.
   *  Undefined = the block sits where it sits in the stack. */
  depth?: number
  /** Switched off: contributes nothing, children included, but keeps its place in the stack. */
  disabled?: boolean
  /** Shown in chat settings as an on/off checkbox. The on/off value is `disabled`. */
  toggleable?: boolean
  /** Creator's explanation of this block, shown as the tooltip on its control in chat settings. */
  info?: string
  /** Present (even empty) makes this a container. Children render between content and closeContent,
   *  newline-joined, and inherit this block's role. Chat History can't be nested. */
  children?: PromptBlock[]
  /** Present makes this an input block: {{blockVal}} in the content resolves to `value` and
   *  {{blockVal2}} to `value2`. `kind` picks the control shown in chat settings; the substitution
   *  is the same for every kind. */
  input?: BlockInput
}

/** Only the range arm is built today; add a new arm + its modal/chat control per new kind.
 *  A range carries two values — the two ends of a span, dragged separately. `value2` is held at
 *  or above `value`. */
export type BlockInput = {
  kind: 'range'
  min: number
  max: number
  step: number
  value: number
  value2: number
}

export interface PromptStack {
  id?: number
  ownerId: string
  name: string
  /** Chat stacks and Story (Write mode) stacks share this table but never mix. Absent = 'chat'
   *  for rows written before the field existed. */
  kind?: 'chat' | 'story'
  active: PromptBlock[] // order = array order
}

/**
 * An uploaded background image. Its own table rather than a field on the palette: a palette list
 * load pulls every row in full, and a wallpaper as base64 is orders of magnitude bigger than the
 * rest of the record. Referenced by `Background.imageId`.
 */
export interface BackgroundImage {
  id?: number
  ownerId: string
  name: string // the uploaded file's name, shown in the picker
  dataUrl: string // base64 data URL, the same way avatars are stored
}
