import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import { activeDescription } from '../storage/types'
import type { CastEntry, Chapter, ParamOverrides, Story } from '../storage/types'
import { sendMessage } from '../connectors/openaiCompatible'
import { buildStoryPrompt, castText, type CastMember } from '../prompt/buildStoryPrompt'
import { renderChapterGuide, storyProseSplit } from '../prompt/chapterGuide'
import { loadTokenizer } from '../prompt/budget'
import { activeConnection } from './settingsStore'
import { resolveParams } from '../settings/resolveParams'
import { useStacks } from './stacksStore'
import { useCharacters } from './charactersStore'
import { usePersonas } from './personasStore'
import { maxTokensOf } from '../params/connectionParams'
import { spanChapter, validSpan } from './writeSpan'

function newStory(title: string): Story {
  return { ownerId: currentOwnerId(), title, cover: '', cast: [], authorNote: '', createdAt: 0, updatedAt: 0 }
}

function newChapter(storyId: number, order: number, title: string): Chapter {
  const now = Date.now()
  return {
    ownerId: currentOwnerId(),
    storyId,
    order,
    title,
    summary: '',
    beats: [],
    sendEnabled: true,
    text: '',
    createdAt: now,
    updatedAt: now,
  }
}

/** Stamp the open Story as edited. Prose lives on the Chapter, so without this a Story's updatedAt
 *  would only move on rename/cover/cast — and the shelf sorts by it. */
async function touchStory(
  get: () => WriteState,
  set: (partial: Partial<WriteState>) => void,
) {
  const story = get().story
  if (!story) return
  const next = { ...story, updatedAt: Date.now() }
  await storage.put('stories', next as unknown as StoredRecord)
  set({ story: next })
}

// Not state: nothing renders from it, and `streaming` already drives the button.
let abort: AbortController | null = null

/** The enabled cast, flattened to the fields buildStoryPrompt needs. Missing rows (deleted out from
 *  under the cast) are skipped. Keeps card knowledge in the store; the assembly stays pure. */
export function resolveCast(cast: CastEntry[]): CastMember[] {
  const characters = useCharacters.getState().characters
  const personas = usePersonas.getState().personas
  const out: CastMember[] = []
  for (const entry of cast) {
    if (!entry.enabled) continue
    if (entry.kind === 'character') {
      const c = characters.find((x) => x.id === entry.id)
      if (c) out.push({ name: c.name, description: activeDescription(c), personality: c.personality, scenario: c.scenario, exampleDialogue: c.exampleDialogue })
    } else {
      const p = personas.find((x) => x.id === entry.id)
      if (p) out.push({ name: p.name, description: p.description })
    }
  }
  return out
}

/** Where a generation writes. Both are internal to the store: Direct uses the caret (or the end of
 *  the Chapter), Retry re-uses the span's own insert point, Continue picks up at the span's end. */
interface GenerateOpts {
  /** Character offset in the target Chapter to insert at. Default: the tracked caret, else the end. */
  insertAt?: number
  /** A span to splice out before streaming into its place. */
  replace?: { start: number; end: number }
}

/** The fields of a Chapter the Author edits from the modal. Prose is never patched this way. */
export type ChapterPatch = Partial<Pick<Chapter, 'title' | 'summary' | 'beats' | 'sendEnabled'>>

interface WriteState {
  stories: Story[]
  loading: boolean
  /** The open Story and its Chapters in order; null/empty on the Shelf. */
  story: Story | null
  chapters: Chapter[]
  /** The Chapter the cursor is in. Generation appends to it. Session state — never stored; opening
   *  a Story with no cursor yet defaults to the last Chapter. */
  activeChapterId: number | null
  /** Per Chapter, bumped when that Chapter's text changes from outside the editor (open, generate)
   *  so its uncontrolled contenteditable re-syncs its DOM. Keyed by Chapter id rather than one
   *  counter for the Story: a bump must not clobber typing in a region that didn't change. */
  revs: Record<number, number>
  streaming: boolean
  /** Which Story the stream belongs to, so opening a different one mid-generation doesn't show its
   *  tail in the wrong prose. Null when idle. */
  streamingStoryId: number | null
  streamingText: string
  error: string
  /** Unsent Direction drafts, keyed by Story id. In-memory only (never persisted — the Direction
   *  is transient), so it survives moving around the app but clears on reload. */
  directions: Record<number, string>
  /** Where the Author's caret sits in the prose, as an offset into that Chapter's raw text. Session
   *  state, never persisted — a caret is where you are right now, not a property of the Story. Null
   *  means no caret, and generation falls back to the end of the active Chapter. */
  caret: { chapterId: number; offset: number } | null
  /** A caret position for a region to adopt the next time its rev rebuilds it. A rev bump throws
   *  the DOM away, so a caret that should survive a commit has to be handed over deliberately. */
  pendingCaret: { chapterId: number; offset: number } | null
  setCaret(chapterId: number, offset: number | null): void
  /** Whether the editor renders inline markers as bold/italic (markers hidden) or shows the raw
   *  asterisks. ponytail: global and in-memory — it's a way of looking at prose, not a property of
   *  one Story, and it resets on reload. Upgrade path if it should stick: a field on appearance in
   *  settingsStore, which is the persisted display-preference home. */
  styling: boolean
  toggleStyling(): void
  setDirection(storyId: number, text: string): void
  load(): Promise<void>
  /** Create a Story plus its first Chapter. Returns the new Story id. */
  create(title: string): Promise<number>
  rename(id: number, title: string): Promise<void>
  setCover(id: number, cover: string): Promise<void>
  /** Copy a Story and every Chapter under it. Returns the new Story id. */
  duplicate(id: number): Promise<number | null>
  /** Delete a Story and every Chapter under it. */
  remove(id: number): Promise<void>
  /** Load a Story + its Chapters into the editor. Also loads characters/personas for the cast. */
  openStory(id: number): Promise<void>
  /** Words across every Chapter of a Story, for the shelf preview. Not stored — counted on read. */
  wordCount(id: number): Promise<number>
  closeStory(): void
  /** The Story's standing instruction, placed by the `authorNote` block. Per Story. */
  setAuthorNote(text: string): Promise<void>
  /** Sampling overrides for this Story, over the connection. Per Story. */
  setParamOverrides(next: ParamOverrides): Promise<void>
  /** Replace the Story's scratchpad notes. Per Story. */
  setScratchpad(notes: string[]): Promise<void>
  /** How wide the prose is displayed, as a percent of the editor column. Per Story. */
  setStoryWidth(width: number): Promise<void>
  /** Append a blank Chapter to the Story and make it active. */
  addChapter(title?: string): Promise<void>
  /** Edit a Chapter's plan (title, summary, beats, send toggle). Never touches prose. */
  updateChapter(id: number, patch: ChapterPatch): Promise<void>
  /** Delete a Chapter and its prose. The caller confirms; this does not. */
  removeChapter(id: number): Promise<void>
  /** Move a Chapter by one position. Its prose moves with it. */
  moveChapter(id: number, delta: number): Promise<void>
  setActiveChapter(id: number): void
  /** Persist one Chapter's prose. The editor debounces; this is the one write path. */
  saveChapterText(id: number, text: string): Promise<void>
  /** Replace a Chapter's prose wholesale (Find and Replace). Same write as saveChapterText, but
   *  bumps that Chapter's rev so the editor re-syncs its DOM instead of keeping what was typed. */
  setChapterText(id: number, text: string): Promise<void>
  /** Add / toggle / remove a cast member on the open Story. */
  setCast(cast: CastEntry[]): Promise<void>
  /** Stream prose into the active Chapter, following the Direction. Lands at the caret when there
   *  is one, otherwise at the end of the Chapter, and records the span it wrote. */
  generate(direction: string, opts?: GenerateOpts): Promise<void>
  /** Write the last span again, in the same place. Uses the Direction in the box when there is one,
   *  else the one that produced the span. */
  retry(): Promise<void>
  /** Carry on from the end of the last span (or the end of the Chapter), with no Direction. */
  continueStory(): Promise<void>
  /** Take the last span back out, put its Direction back in the box, and drop the span. */
  undoGeneration(): Promise<void>
  stop(): void
  dismissError(): void
}

async function save(story: Story): Promise<number> {
  const now = Date.now()
  const record = { ...story, createdAt: story.createdAt || now, updatedAt: now }
  return storage.put('stories', record as unknown as StoredRecord)
}

/** Write the Chapters' `order` to match their array position, and put the array in state. Every
 *  structural change (add, delete, move) goes through here so order and array never disagree. */
async function persistOrder(
  chapters: Chapter[],
  set: (partial: Partial<WriteState>) => void,
): Promise<Chapter[]> {
  const ordered: Chapter[] = []
  for (const [i, c] of chapters.entries()) {
    if (c.order === i) {
      ordered.push(c)
      continue
    }
    const moved = { ...c, order: i }
    await storage.put('chapters', moved as unknown as StoredRecord)
    ordered.push(moved)
  }
  set({ chapters: ordered })
  return ordered
}

export const useWrite = create<WriteState>()((set, get) => ({
  stories: [],
  loading: false,
  story: null,
  chapters: [],
  activeChapterId: null,
  revs: {},
  streaming: false,
  streamingStoryId: null,
  streamingText: '',
  error: '',
  directions: {},
  caret: null,
  pendingCaret: null,
  styling: true,

  toggleStyling: () => set((s) => ({ styling: !s.styling })),

  setDirection: (storyId, text) =>
    set((s) => ({ directions: { ...s.directions, [storyId]: text } })),

  setCaret: (chapterId, offset) =>
    set({ caret: offset === null ? null : { chapterId, offset } }),

  load: async () => {
    set({ loading: true })
    const rows = (await storage.getAll('stories')) as unknown as Story[]
    rows.sort((a, b) => b.updatedAt - a.updatedAt)
    set({ stories: rows, loading: false })
  },

  create: async (title) => {
    const storyId = await save(newStory(title))
    await storage.put('chapters', newChapter(storyId, 0, 'Chapter 1') as unknown as StoredRecord)
    await get().load()
    return storyId
  },

  rename: async (id, title) => {
    // Renaming happens from the shelf and from the editor's title, where the shelf list may not
    // have been loaded yet — fall back to the open Story.
    const open = get().story
    const story = get().stories.find((s) => s.id === id) ?? (open?.id === id ? open : undefined)
    if (!story) return
    const next = { ...story, title }
    await save(next)
    if (open?.id === id) set({ story: next })
    await get().load()
  },

  setCover: async (id, cover) => {
    const story = get().stories.find((s) => s.id === id)
    if (!story) return
    await save({ ...story, cover })
    await get().load()
  },

  duplicate: async (id) => {
    const story = (await storage.get('stories', id)) as unknown as Story | undefined
    if (!story) return null
    const chapters = (await storage.find('chapters', 'storyId', id)) as unknown as Chapter[]
    chapters.sort((a, b) => a.order - b.order)
    // Drop the ids so storage assigns new ones; createdAt/updatedAt are set by save().
    const { id: _storyId, ...rest } = story
    const copyId = await save({ ...rest, title: `${story.title} copy`, createdAt: 0, updatedAt: 0 })
    const now = Date.now()
    for (const c of chapters) {
      const { id: _chapterId, ...chapterRest } = c
      await storage.put('chapters', {
        ...chapterRest,
        storyId: copyId,
        createdAt: now,
        updatedAt: now,
      } as unknown as StoredRecord)
    }
    await get().load()
    return copyId
  },

  remove: async (id) => {
    const chapters = (await storage.find('chapters', 'storyId', id)) as unknown as Chapter[]
    for (const c of chapters) await storage.remove('chapters', c.id!)
    await storage.remove('stories', id)
    await get().load()
  },

  openStory: async (id) => {
    const story = (await storage.get('stories', id)) as unknown as Story | undefined
    const chapters = (await storage.find('chapters', 'storyId', id)) as unknown as Chapter[]
    chapters.sort((a, b) => a.order - b.order)
    // The cast picker and generation both read these from state.
    await Promise.all([useCharacters.getState().load(), usePersonas.getState().load()])
    const revs: Record<number, number> = {}
    for (const c of chapters) revs[c.id!] = (get().revs[c.id!] ?? 0) + 1
    set({
      story: story ?? null,
      chapters,
      activeChapterId: chapters.at(-1)?.id ?? null,
      revs,
      error: '',
      // Session state, and this is a different document's prose.
      caret: null,
      pendingCaret: null,
      // Kept when you come back to a Story that is still generating, so the tail picks up mid-flight.
      streamingText: get().streamingStoryId === id ? get().streamingText : '',
    })
  },

  wordCount: async (id) => {
    const chapters = (await storage.find('chapters', 'storyId', id)) as unknown as Chapter[]
    let words = 0
    for (const c of chapters) words += c.text.split(/\s+/).filter(Boolean).length
    return words
  },

  closeStory: () =>
    set({ story: null, chapters: [], activeChapterId: null, caret: null, pendingCaret: null }),

  setAuthorNote: async (text) => {
    const story = get().story
    if (!story || story.authorNote === text) return
    const next = { ...story, authorNote: text, updatedAt: Date.now() }
    await storage.put('stories', next as unknown as StoredRecord)
    set({ story: next })
  },

  setParamOverrides: async (paramOverrides) => {
    const story = get().story
    if (!story) return
    // No updatedAt bump: sampler settings aren't an edit to the prose, same rule as storyWidth.
    const next = { ...story, paramOverrides }
    await storage.put('stories', next as unknown as StoredRecord)
    set({ story: next })
  },

  setScratchpad: async (notes) => {
    const story = get().story
    if (!story) return
    const next = { ...story, scratchpad: notes, updatedAt: Date.now() }
    await storage.put('stories', next as unknown as StoredRecord)
    set({ story: next })
  },

  setStoryWidth: async (width) => {
    const story = get().story
    if (!story) return
    // No updatedAt bump: how wide the prose is drawn isn't an edit to the Story.
    const next = { ...story, storyWidth: Math.min(100, Math.max(1, width || 100)) }
    await storage.put('stories', next as unknown as StoredRecord)
    set({ story: next })
  },

  addChapter: async (title) => {
    const story = get().story
    if (!story) return
    const chapters = get().chapters
    const chapter = newChapter(story.id!, chapters.length, title || `Chapter ${chapters.length + 1}`)
    const id = await storage.put('chapters', chapter as unknown as StoredRecord)
    await persistOrder([...chapters, { ...chapter, id }], set)
    // A new Chapter is where the Author is about to work, so it takes the cursor.
    set((s) => ({ activeChapterId: id, revs: { ...s.revs, [id]: (s.revs[id] ?? 0) + 1 } }))
    await touchStory(get, set)
  },

  updateChapter: async (id, patch) => {
    const chapter = get().chapters.find((c) => c.id === id)
    if (!chapter) return
    const next = { ...chapter, ...patch, updatedAt: Date.now() }
    await storage.put('chapters', next as unknown as StoredRecord)
    set((s) => ({ chapters: s.chapters.map((c) => (c.id === id ? next : c)) }))
    await touchStory(get, set)
  },

  removeChapter: async (id) => {
    const chapters = get().chapters
    // A Story is a list of Chapters starting at one: the last one can't be deleted.
    if (chapters.length <= 1) return
    await storage.remove('chapters', id)
    const left = await persistOrder(chapters.filter((c) => c.id !== id), set)
    if (get().activeChapterId === id) set({ activeChapterId: left.at(-1)?.id ?? null })
    await touchStory(get, set)
  },

  moveChapter: async (id, delta) => {
    const chapters = [...get().chapters]
    const from = chapters.findIndex((c) => c.id === id)
    const to = from + delta
    if (from === -1 || to < 0 || to >= chapters.length) return
    const [moved] = chapters.splice(from, 1)
    chapters.splice(to, 0, moved)
    await persistOrder(chapters, set)
    await touchStory(get, set)
  },

  setActiveChapter: (id) => {
    if (get().activeChapterId !== id) set({ activeChapterId: id })
  },

  saveChapterText: async (id, text) => {
    const chapter = get().chapters.find((c) => c.id === id)
    if (!chapter || chapter.text === text) return
    const next = { ...chapter, text, updatedAt: Date.now() }
    await storage.put('chapters', next as unknown as StoredRecord)
    // No rev bump: this comes from the editor's own DOM, resyncing would clobber the caret.
    set((s) => ({ chapters: s.chapters.map((c) => (c.id === id ? next : c)) }))
    await touchStory(get, set)
  },

  setChapterText: async (id, text) => {
    const chapter = get().chapters.find((c) => c.id === id)
    if (!chapter || chapter.text === text) return
    const next = { ...chapter, text, updatedAt: Date.now() }
    await storage.put('chapters', next as unknown as StoredRecord)
    set((s) => ({
      chapters: s.chapters.map((c) => (c.id === id ? next : c)),
      revs: { ...s.revs, [id]: (s.revs[id] ?? 0) + 1 },
    }))
    await touchStory(get, set)
  },

  setCast: async (cast) => {
    const story = get().story
    if (!story) return
    const next = { ...story, cast, updatedAt: Date.now() }
    await storage.put('stories', next as unknown as StoredRecord)
    set({ story: next })
  },

  generate: async (direction, opts) => {
    const { story, chapters, activeChapterId, caret } = get()
    let active = chapters.find((c) => c.id === activeChapterId) ?? chapters.at(-1)
    if (!story || !active || get().streaming) return
    const base = activeConnection()
    if (!base) {
      set({ error: 'No active connection — pick one in Settings.' })
      return
    }
    // story > connection. The cast contributes nothing: several characters, no non-arbitrary winner.
    const connection = resolveParams(base, undefined, story)

    // Retry: take the old span back out first, so the model sees the prose as it was before that
    // generation ran and writes into the same gap rather than after its own last attempt.
    if (opts?.replace) {
      const { start, end } = opts.replace
      const cut = active.text.slice(0, start) + active.text.slice(end)
      active = { ...active, text: cut, lastGeneration: undefined, updatedAt: Date.now() }
      await storage.put('chapters', active as unknown as StoredRecord)
      set((s) => ({
        chapters: s.chapters.map((c) => (c.id === active!.id ? active! : c)),
        revs: { ...s.revs, [active!.id!]: (s.revs[active!.id!] ?? 0) + 1 },
      }))
    }

    // Where this lands. An explicit offset wins (Retry, Continue), then the tracked caret when it
    // belongs to this Chapter, and the end of the Chapter is the fallback — clicking into the prose
    // is what opts into a caret insert.
    const caretHere = caret && caret.chapterId === active.id ? caret.offset : undefined
    const insertAt = Math.min(
      Math.max(opts?.insertAt ?? caretHere ?? active.text.length, 0),
      active.text.length,
    )

    const controller = new AbortController()
    abort = controller
    set({
      streaming: true,
      streamingStoryId: story.id ?? null,
      streamingText: '',
      error: '',
    })

    let text = ''
    let finishReason = ''
    try {
      const stack = await useStacks.getState().ensureActive('story')
      await loadTokenizer()
      // Re-read: a Retry splices the old span out above, and the prompt must see that edit.
      const current = get().chapters
      const split = storyProseSplit(current, active.id!, insertAt)
      const prompt = buildStoryPrompt(
        {
          stack,
          castText: castText(resolveCast(story.cast)),
          authorNote: story.authorNote,
          chapterGuide: renderChapterGuide(current, active.id!),
          storyText: split.text,
          storyTrailing: split.trailing,
          direction,
        },
        {
          contextLimit: connection.contextLimit,
          maxTokens: maxTokensOf(connection),
          safetyMarginPct: connection.safetyMarginPct,
        },
      )
      for await (const chunk of sendMessage(prompt.messages, connection, controller.signal)) {
        if (chunk.content) {
          text += chunk.content
          set({ streamingText: text })
        }
        if (chunk.finishReason) finishReason = chunk.finishReason
      }
    } catch (err) {
      // Write rule: keep whatever streamed (same as Stop) and surface a toast. Nothing rolls back.
      if (!controller.signal.aborted) {
        await commit(get, set, active.id!, text, insertAt, direction)
        set({ streaming: false, streamingStoryId: null, streamingText: '', error: (err as Error).message })
        abort = null
        return
      }
    } finally {
      abort = null
    }

    await commit(get, set, active.id!, text, insertAt, direction)
    set({
      streaming: false,
      streamingStoryId: null,
      streamingText: '',
      // The text is kept either way; this only says why it ended where it did.
      error:
        finishReason === 'length'
          ? `Response stopped at the ${maxTokensOf(connection)} token limit. Raise Max tokens in the connection.`
          : '',
    })
  },

  retry: async () => {
    const { story, chapters, activeChapterId, streaming, directions } = get()
    if (streaming || !story) return
    const chapter = spanChapter(chapters, activeChapterId)
    const span = validSpan(chapter)
    if (!chapter || !span) return
    // The box wins when the Author has typed a new Direction: Retry with an edited Direction is how
    // you steer the same passage, not a second way to send the old one.
    const typed = (directions[story.id!] ?? '').trim()
    const direction = typed || span.direction
    set((s) => ({ activeChapterId: chapter.id!, directions: { ...s.directions, [story.id!]: '' } }))
    await get().generate(direction, { insertAt: span.start, replace: { start: span.start, end: span.end } })
  },

  continueStory: async () => {
    const { chapters, activeChapterId, streaming } = get()
    if (streaming) return
    const chapter = spanChapter(chapters, activeChapterId)
    const span = validSpan(chapter)
    // With no span, carry on from the end of the active Chapter.
    const target = chapter ?? chapters.find((c) => c.id === activeChapterId) ?? chapters.at(-1)
    if (!target || !target.text.trim()) return
    set({ activeChapterId: target.id! })
    // No Direction: buildStoryPrompt drops the trailing user turn when it's blank, so the model is
    // asked for more of the same prose rather than for an answer to an empty instruction.
    await get().generate('', { insertAt: span ? span.end : target.text.length })
  },

  undoGeneration: async () => {
    const { story, chapters, activeChapterId, streaming } = get()
    if (streaming || !story) return
    const chapter = spanChapter(chapters, activeChapterId)
    const span = validSpan(chapter)
    if (!chapter || !span) return
    const text = chapter.text.slice(0, span.start) + chapter.text.slice(span.end)
    const next = { ...chapter, text, lastGeneration: undefined, updatedAt: Date.now() }
    await storage.put('chapters', next as unknown as StoredRecord)
    set((s) => ({
      chapters: s.chapters.map((c) => (c.id === chapter.id ? next : c)),
      revs: { ...s.revs, [chapter.id!]: (s.revs[chapter.id!] ?? 0) + 1 },
      activeChapterId: chapter.id!,
      // The Direction that produced the passage goes back in the box, so undo-and-rephrase is one
      // step. This is what the old restore-last-Direction button did, tied to a real edit.
      directions: { ...s.directions, [story.id!]: span.direction },
      // The caret returns to where the passage was, which is where the next one would go.
      caret: { chapterId: chapter.id!, offset: span.start },
      pendingCaret: { chapterId: chapter.id!, offset: span.start },
    }))
    await touchStory(get, set)
  },

  stop: () => abort?.abort(),

  dismissError: () => set({ error: '' }),
}))

/**
 * Splice streamed prose into one Chapter at an offset and persist, recording the span it wrote.
 * Bumps that Chapter's rev so its region re-syncs to the committed text.
 *
 * The recorded span covers the separators as well as the model's text. The plan's `start` is the
 * insert offset plus the leading separator; keeping the separators inside the span instead means
 * Undo removes exactly what the generation added, so a Direct → Undo round-trips the Chapter back
 * to the character it started as. `start` is still the insert point, which is what Retry re-uses.
 */
async function commit(
  get: () => WriteState,
  set: (partial: Partial<WriteState> | ((s: WriteState) => Partial<WriteState>)) => void,
  chapterId: number,
  added: string,
  insertAt: number,
  direction: string,
) {
  if (!added) return
  // Storage, not state: leaving the Story mid-generation clears `chapters`, and the reply still has
  // to land. The in-memory patch below is then a no-op, and openStory() reloads it on the way back.
  const chapter =
    get().chapters.find((c) => c.id === chapterId) ??
    ((await storage.get('chapters', chapterId)) as unknown as Chapter | undefined)
  if (!chapter) return
  const base = chapter.text
  const at = Math.min(Math.max(insertAt, 0), base.length)
  const before = base.slice(0, at)
  const after = base.slice(at)
  // Boundaries so the passage doesn't fuse onto the word on either side; storage still holds raw
  // prose. The trailing one only matters for a caret insert, where there is prose on the right.
  const sep = before && !/\s$/.test(before) ? ' ' : ''
  const tail = after && !/^\s/.test(after) && !/\s$/.test(added) ? ' ' : ''
  const span = sep + added + tail
  const next = {
    ...chapter,
    text: before + span + after,
    lastGeneration: { start: at, end: at + span.length, text: span, direction },
    updatedAt: Date.now(),
  }
  await storage.put('chapters', next as unknown as StoredRecord)
  set((s) => ({
    chapters: s.chapters.map((c) => (c.id === chapterId ? next : c)),
    revs: { ...s.revs, [chapterId]: (s.revs[chapterId] ?? 0) + 1 },
    // Typing (or a second Direct) carries on from where the passage ended, not from offset 0 where
    // the rev rebuild would otherwise leave the caret.
    caret: { chapterId, offset: at + span.length },
    pendingCaret: { chapterId, offset: at + span.length },
  }))
  await touchStory(get, set)
}
