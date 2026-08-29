import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import { activeDescription } from '../storage/types'
import type { Block, CastEntry, Chapter, ParamOverrides, Story } from '../storage/types'
import { sendMessage } from '../connectors/openaiCompatible'
import { buildStoryPrompt, castText, fitChapterGuide, type CastMember } from '../prompt/buildStoryPrompt'
import { chapterProse, storyProseSplit } from '../prompt/chapterGuide'
import { storyTokens } from '../prompt/storyTokens'
import { rewritePrompt } from '../prompt/rewrite'
import { deletedSwipes, regenerated, selectSwipe, swipeIndex } from './swipes'
import { loadTokenizer } from '../prompt/budget'
import { tokenizerFor } from '../prompt/tokenizers'
import { activeConnection } from './settingsStore'
import { resolveParams } from '../settings/resolveParams'
import { useStacks } from './stacksStore'
import { useCharacters } from './charactersStore'
import { usePersonas } from './personasStore'
import { maxTokensOf, withParam } from '../params/connectionParams'
import {
  buildOutlineMessages,
  parseOutlineReply,
  splitTargets,
  type OutlineRequest,
} from '../prompt/outline'

function newStory(title: string): Story {
  return {
    ownerId: currentOwnerId(),
    title,
    cover: '',
    cast: [],
    direction: '',
    premise: '',
    ending: '',
    createdAt: 0,
    updatedAt: 0,
  }
}

/** A blank Block. A free stretch by default, `beat` is what makes one a planned section, and the
 *  Author writes that. */
export function newBlock(beat = ''): Block {
  return { id: crypto.randomUUID(), beat, targetWords: 0, done: false, content: '', context: 'both' }
}

function newChapter(storyId: number, order: number, title: string): Chapter {
  const now = Date.now()
  return {
    ownerId: currentOwnerId(),
    storyId,
    order,
    title,
    summary: '',
    // One free Block, so a new Chapter has somewhere to type before it has a plan.
    blocks: [newBlock()],
    // Everything you have: an unwritten Chapter sends beats because it has no summary yet, a
    // written one sends both, and the guide's trim decides what survives when room runs short.
    guideSend: 'both',
    createdAt: now,
    updatedAt: now,
  }
}

/** Stamp the open Story as edited. Prose lives on the Chapter, so without this a Story's updatedAt
 *  would only move on rename/cover/cast, and the shelf sorts by it. */
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

/** The fields of a Chapter the Author edits. Every structural change to the prose, add a Block,
 *  remove one, reorder, convert free↔beat, tick done, retarget, change its context mode, is a
 *  `blocks` patch. Blocks get no structural actions of their own; only the three that stream or
 *  swipe do. */
export type ChapterPatch = Partial<Pick<Chapter, 'title' | 'summary' | 'blocks' | 'guideSend'>>

interface WriteState {
  stories: Story[]
  loading: boolean
  /** The open Story and its Chapters in order; null/empty on the Shelf. */
  story: Story | null
  chapters: Chapter[]
  /** The Chapter the cursor is in. Generation appends to it. Session state, never stored; opening
   *  a Story with no cursor yet defaults to the last Chapter. */
  activeChapterId: number | null
  /** Per Block, bumped when that Block's content changes from outside the editor (open, generate,
   *  swipe) so its uncontrolled contenteditable re-syncs its DOM. Keyed by Block id rather than one
   *  counter for the Story: a bump must not clobber typing in a region that didn't change. */
  revs: Record<string, number>
  streaming: boolean
  /** Which Story the stream belongs to, so opening a different one mid-generation doesn't show its
   *  tail in the wrong prose. Null when idle. */
  streamingStoryId: number | null
  streamingText: string
  /** Reasoning as it streams, shown above the tail when Show reasoning is on. */
  streamingReasoning: string
  /** The Block the stream is landing in, so its region draws the tail and locks itself. */
  streamingBlockId: string | null
  /** True when the stream will replace what the Block already says (a regen), so the region hides
   *  the old text instead of leaving it above the tail. */
  streamingReplaces: boolean
  error: string
  /** The Block the cursor is in. Session state, never persisted. Find and Replace scopes to it, and
   *  the Story panel's beat checklist reads its Chapter through `activeChapterId`. */
  activeBlockId: string | null
  /** A caret position for a region to adopt the next time its rev rebuilds it. A rev bump throws
   *  the DOM away, so a caret that should survive a commit has to be handed over deliberately. */
  pendingCaret: { blockId: string; offset: number } | null
  /** Whether the editor renders inline markers as bold/italic (markers hidden) or shows the raw
   *  asterisks. global and in-memory, it's a way of looking at prose, not a property of
   *  one Story, and it resets on reload. Upgrade path if it should stick: a field on appearance in
   *  settingsStore, which is the persisted display-preference home. */
  styling: boolean
  toggleStyling(): void
  /** Block ids whose beat is folded shut in the document. In-memory and global, like `styling`:
   *  hiding a beat is something you do while reading, not a property of the beat. Lives here rather
   *  than in the region so the rail's chapter list can show the same open/shut state.
   *  a Block field is the upgrade path if it should survive a reload. */
  collapsedBeats: string[]
  setCollapsedBeats(ids: string[]): void
  /** The Story's standing instruction, sent as the final user turn on every generation. Per
   *  Story. Debounced by the caller, this writes to the database. */
  setDirection(text: string): Promise<void>
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
  /** Words across every Chapter of a Story, for the shelf preview. Not stored, counted on read. */
  wordCount(id: number): Promise<number>
  /** A Story's Chapters in order, without opening it, what the shelf's export reads. */
  chaptersOf(id: number): Promise<Chapter[]>
  closeStory(): void
  /** Sampling overrides for this Story, over the connection. Per Story. */
  setParamOverrides(next: ParamOverrides): Promise<void>
  /** How wide the prose is displayed, as a percent of the editor column. Per Story. */
  setStoryWidth(width: number): Promise<void>
  /** The opening situation on the Plot Layout strip. Per Story. Reaches the prompt as {{premise}}. */
  setPremise(text: string): Promise<void>
  /** The intended ending on the Plot Layout strip. Per Story. Reaches the prompt as {{ending}}. */
  setEnding(text: string): Promise<void>
  /** Whether the Premise and Ending caps render as thin markers. Per Story. */
  setCapsCollapsed(collapsed: boolean): Promise<void>
  /** Append a blank Chapter to the Story and make it active. */
  addChapter(title?: string): Promise<void>
  /** Edit a Chapter's plan (title, summary, beats, send toggle). Never touches prose. */
  updateChapter(id: number, patch: ChapterPatch): Promise<void>
  /** Delete a Chapter and its prose. The caller confirms; this does not. */
  removeChapter(id: number): Promise<void>
  /** Move a Chapter by one position. Its prose moves with it. */
  moveChapter(id: number, delta: number): Promise<void>
  setActiveChapter(id: number): void
  setActiveBlock(chapterId: number, blockId: string): void
  /** Persist one Block's prose. The editor debounces; this is the one write path from typing. The
   *  edit lands on the selected swipe too, so switching away and back doesn't lose it. */
  saveBlockText(chapterId: number, blockId: string, content: string): Promise<void>
  /** Replace a Block's prose wholesale (Find and Replace, undo). Same write as saveBlockText, but
   *  bumps the Block's rev so the editor re-syncs its DOM instead of keeping what was typed. */
  setBlockText(chapterId: number, blockId: string, content: string): Promise<void>
  /** Add / toggle / remove a cast member on the open Story. */
  setCast(cast: CastEntry[]): Promise<void>
  /**
   * Ask the model for a whole plan and write it into the open Story as Chapters and beats.
   *
   * Replaces every Chapter the Story has. The prose goes with them, which is why the dialog says so
   * and why nothing is deleted until the reply has parsed.
   *
   * Throws on failure rather than only setting `error`, so the dialog can stay open and show what
   * went wrong next to the fields that produced it.
   */
  generateOutline(req: OutlineRequest): Promise<void>
  /**
   * Stream prose for one Block. The result lands as a new swipe and becomes the selected one, so
   * every generation is undoable by swiping back, there are no spans to splice or validate.
   *
   * `direction` defaults to the Direction box verbatim, the Story's standing instruction. The
   * beat is NOT folded in; it reaches the model through {{beat}}, wherever the stack places it.
   * Pass one to override (that is what "Regen with instructions" does).
   */
  writeBlock(
    chapterId: number,
    blockId: string,
    direction?: string,
    replaces?: boolean,
  ): Promise<void>
  /** Write the Block again, following an instruction about the version it already holds. */
  regenBlock(chapterId: number, blockId: string, instruction: string): Promise<void>
  /** Select one of a Block's alternates. */
  swipeBlock(chapterId: number, blockId: string, index: number): Promise<void>
  /** Drop the selected alternate. The last one left empties the Block rather than deleting it. */
  deleteSwipe(chapterId: number, blockId: string): Promise<void>
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
  streamingReasoning: '',
  streamingBlockId: null,
  streamingReplaces: false,
  error: '',
  activeBlockId: null,
  pendingCaret: null,
  styling: true,
  collapsedBeats: [],

  toggleStyling: () => set((s) => ({ styling: !s.styling })),

  setCollapsedBeats: (ids) => set({ collapsedBeats: ids }),

  setDirection: async (text) => {
    const story = get().story
    if (!story || story.direction === text) return
    const next = { ...story, direction: text, updatedAt: Date.now() }
    await storage.put('stories', next as unknown as StoredRecord)
    set({ story: next })
  },

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
    // have been loaded yet, fall back to the open Story.
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
    // A Chapter that somehow has no Blocks gets one, so there is always somewhere to type.
    for (const c of chapters) {
      if (c.blocks.length) continue
      c.blocks = [newBlock()]
      await storage.put('chapters', c as unknown as StoredRecord)
    }
    const revs: Record<string, number> = {}
    for (const c of chapters) for (const b of c.blocks) revs[b.id] = (get().revs[b.id] ?? 0) + 1
    set({
      story: story ?? null,
      chapters,
      activeChapterId: chapters.at(-1)?.id ?? null,
      revs,
      error: '',
      // Session state, and this is a different document's prose.
      activeBlockId: null,
      pendingCaret: null,
      // Kept when you come back to a Story that is still generating, so the tail picks up mid-flight.
      streamingText: get().streamingStoryId === id ? get().streamingText : '',
    })
  },

  chaptersOf: async (id) => {
    const chapters = (await storage.find('chapters', 'storyId', id)) as unknown as Chapter[]
    return chapters.sort((a, b) => a.order - b.order)
  },

  wordCount: async (id) => {
    const chapters = (await storage.find('chapters', 'storyId', id)) as unknown as Chapter[]
    let words = 0
    for (const c of chapters) words += chapterProse(c).split(/\s+/).filter(Boolean).length
    return words
  },

  closeStory: () =>
    set({ story: null, chapters: [], activeChapterId: null, activeBlockId: null, pendingCaret: null }),

  setParamOverrides: async (paramOverrides) => {
    const story = get().story
    if (!story) return
    // No updatedAt bump: sampler settings aren't an edit to the prose, same rule as storyWidth.
    const next = { ...story, paramOverrides }
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

  setPremise: async (text) => {
    const story = get().story
    if (!story || (story.premise ?? '') === text) return
    const next = { ...story, premise: text, updatedAt: Date.now() }
    await storage.put('stories', next as unknown as StoredRecord)
    set({ story: next })
  },

  setEnding: async (text) => {
    const story = get().story
    if (!story || (story.ending ?? '') === text) return
    const next = { ...story, ending: text, updatedAt: Date.now() }
    await storage.put('stories', next as unknown as StoredRecord)
    set({ story: next })
  },

  setCapsCollapsed: async (capsCollapsed) => {
    const story = get().story
    if (!story) return
    // No updatedAt bump: how the caps are drawn isn't an edit to the Story, same rule as storyWidth.
    const next = { ...story, capsCollapsed }
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
    set({ activeChapterId: id })
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
    if (get().activeChapterId === id) set({ activeChapterId: left.at(-1)?.id ?? null, activeBlockId: null })
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

  setActiveBlock: (chapterId, blockId) => {
    const s = get()
    if (s.activeChapterId !== chapterId || s.activeBlockId !== blockId)
      set({ activeChapterId: chapterId, activeBlockId: blockId })
  },

  saveBlockText: async (chapterId, blockId, content) => {
    // No rev bump: this comes from the editor's own DOM, resyncing would clobber the caret.
    await writeBlockContent(get, set, chapterId, blockId, content, false)
  },

  setBlockText: async (chapterId, blockId, content) => {
    await writeBlockContent(get, set, chapterId, blockId, content, true)
  },

  setCast: async (cast) => {
    const story = get().story
    if (!story) return
    const next = { ...story, cast, updatedAt: Date.now() }
    await storage.put('stories', next as unknown as StoredRecord)
    set({ story: next })
  },

  generateOutline: async (req) => {
    const { story, chapters, streaming } = get()
    if (!story || streaming) return
    const base = activeConnection()
    if (!base) throw new Error('No active connection - pick one in Settings.')
    const connection = resolveParams(base, undefined, story)

    const controller = new AbortController()
    abort = controller
    // The same flag `writeBlock` holds, so Stop works and neither can start while the other runs.
    // No streamingBlockId: nothing renders this as it arrives, it lands as Chapters when it is done.
    set({ streaming: true, streamingStoryId: story.id ?? null, error: '' })

    let reply = ''
    let finishReason = ''
    try {
      const stack = await useStacks.getState().ensureActive('story')
      const messages = buildOutlineMessages(req, stack.miscPrompts)
      // An outline for a long Story runs well past a 512-token default, and an object cut off
      // halfway parses as nothing at all, so this request gets its own floor, like generatePalette.
      const wide = withParam(connection, 'max_tokens', Math.max(maxTokensOf(connection), 2000))
      for await (const chunk of sendMessage(messages, wide, controller.signal)) {
        if (chunk.content) reply += chunk.content
        if (chunk.finishReason) finishReason = chunk.finishReason
      }
    } catch (err) {
      set({ streaming: false, streamingStoryId: null })
      abort = null
      if (controller.signal.aborted) return
      throw err
    }
    abort = null

    let outline
    try {
      outline = parseOutlineReply(reply)
    } catch (err) {
      set({ streaming: false, streamingStoryId: null })
      // A truncation reads as a parse error otherwise, which points at the reply instead of at the
      // token limit that cut it.
      throw finishReason === 'length'
        ? new Error(
            `The reply was cut off at the ${maxTokensOf(connection)} token limit before the outline ended. Raise Max tokens in the connection, or ask for fewer chapters.`,
          )
        : err
    }

    // Past here the reply is good, so the Story's existing plan can go. Nothing before this point
    // has written anything.
    for (const chapter of chapters) {
      if (chapter.id !== undefined) await storage.remove('chapters', chapter.id)
    }

    const written: Chapter[] = []
    for (const [i, entry] of outline.entries()) {
      const targets = splitTargets(req.wordsPerChapter, entry.beats.length)
      const seeded = newChapter(story.id!, i, entry.title || `Chapter ${i + 1}`)
      const chapter: Chapter = {
        ...seeded,
        summary: entry.summary,
        // The beats first, then the free Block newChapter seeds, so there is somewhere to type
        // after the plan runs out.
        blocks: [
          ...entry.beats.map((beat, k) => ({ ...newBlock(beat), targetWords: targets[k] })),
          ...seeded.blocks,
        ],
      }
      const id = await storage.put('chapters', chapter as unknown as StoredRecord)
      written.push({ ...chapter, id })
    }

    // persistOrder puts the array in state; the orders already match, so it writes nothing again.
    await persistOrder(written, set)
    set({
      streaming: false,
      streamingStoryId: null,
      activeChapterId: written[0]?.id ?? null,
      activeBlockId: null,
    })
    await touchStory(get, set)
  },

  writeBlock: async (chapterId, blockId, direction, replaces) => {
    const { story, chapters, streaming } = get()
    if (!story || streaming) return
    const chapter = chapters.find((c) => c.id === chapterId)
    const block = chapter?.blocks.find((b) => b.id === blockId)
    if (!chapter || !block) return
    const base = activeConnection()
    if (!base) {
      set({ error: 'No active connection - pick one in Settings.' })
      return
    }
    // story > connection. The cast contributes nothing: several characters, no non-arbitrary winner.
    const connection = resolveParams(base, undefined, story)
    // The Direction box is the Story's standing instruction: read on every generation, never
    // cleared. The beat is not folded in - the stack places it with {{beat}}.
    const sent = direction ?? story.direction

    const controller = new AbortController()
    abort = controller
    // A Block is where this is going, so it takes the cursor.
    set({
      activeChapterId: chapterId,
      activeBlockId: blockId,
      streaming: true,
      streamingStoryId: story.id ?? null,
      streamingBlockId: blockId,
      streamingText: '',
      streamingReasoning: '',
      streamingReplaces: !!replaces,
      error: '',
    })

    let text = ''
    let reasoning = ''
    let finishReason = ''
    try {
      const stack = await useStacks.getState().ensureActive('story')
      await loadTokenizer(tokenizerFor(connection))
      const current = get().chapters
      // The one thing the per-Block context setting does: blank one side of the prose or the other.
      const split = storyProseSplit(current, chapterId, blockId, block.context)
      const budget = {
        contextLimit: connection.contextLimit,
        maxTokens: maxTokensOf(connection),
        safetyMarginPct: connection.safetyMarginPct,
      }
      const prompt = buildStoryPrompt(
        {
          stack,
          castText: castText(resolveCast(story.cast)),
          tokens: storyTokens({
            title: story.title,
            premise: story.premise ?? '',
            ending: story.ending ?? '',
            castNames: resolveCast(story.cast).map((m) => m.name),
            chapters: current,
            chapterId,
            blockId,
          }),
          chapterGuide: fitChapterGuide(current, chapterId, budget),
          storyText: split.text,
          storyTrailing: split.trailing,
          direction: sent,
        },
        budget,
      )
      for await (const chunk of sendMessage(prompt.messages, connection, controller.signal)) {
        if (chunk.content) {
          text += chunk.content
          set({ streamingText: text })
        }
        if (chunk.reasoning) {
          reasoning += chunk.reasoning
          set({ streamingReasoning: reasoning })
        }
        if (chunk.finishReason) finishReason = chunk.finishReason
      }
    } catch (err) {
      // Write rule: keep whatever streamed (same as Stop) and surface a toast. Nothing rolls back.
      if (!controller.signal.aborted) {
        await commitSwipe(get, set, chapterId, blockId, text, reasoning)
        set({
          streaming: false,
          streamingStoryId: null,
          streamingBlockId: null,
          streamingText: '',
          streamingReasoning: '',
          streamingReplaces: false,
          error: (err as Error).message,
        })
        abort = null
        return
      }
    } finally {
      abort = null
    }

    await commitSwipe(get, set, chapterId, blockId, text, reasoning)
    set({
      streaming: false,
      streamingStoryId: null,
      streamingBlockId: null,
      streamingText: '',
      streamingReasoning: '',
      streamingReplaces: false,
      // The text is kept either way; this only says why it ended where it did.
      error:
        finishReason === 'length'
          ? `Response stopped at the ${maxTokensOf(connection)} token limit. Raise Max tokens in the connection.`
          : '',
    })
  },

  regenBlock: async (chapterId, blockId, instruction) => {
    const block = get()
      .chapters.find((c) => c.id === chapterId)
      ?.blocks.find((b) => b.id === blockId)
    if (!block || !instruction.trim()) return
    // The chat's re-roll wording, unchanged: quote what it said, then the instruction. An empty
    // Block has nothing to rewrite, so the instruction steers a first draft instead. Either way the
    // beat still arrives through {{beat}}, so it is not repeated here.
    // The Story stack's own override, if it set one, `writeBlock` resolves the same stack again to
    // build the prompt, so both halves of this request read the same row.
    const stack = await useStacks.getState().ensureActive('story')
    await get().writeBlock(
      chapterId,
      blockId,
      block.content.trim() ? rewritePrompt(block.content, instruction, stack.miscPrompts) : instruction,
      true,
    )
  },

  swipeBlock: async (chapterId, blockId, index) => {
    const block = get()
      .chapters.find((c) => c.id === chapterId)
      ?.blocks.find((b) => b.id === blockId)
    if (!block) return
    const next = selectSwipe(block, index)
    if (next.content === block.content && next.swipeIndex === block.swipeIndex) return
    await putBlock(get, set, chapterId, next, true)
  },

  deleteSwipe: async (chapterId, blockId) => {
    const block = get()
      .chapters.find((c) => c.id === chapterId)
      ?.blocks.find((b) => b.id === blockId)
    if (!block) return
    // Unlike chat, the Block is part of the plan - dropping its last version leaves an empty beat,
    // and Delete Beat is the separate, confirmed action.
    const next = deletedSwipes(block, [swipeIndex(block)]) ?? {
      ...block,
      swipes: undefined,
      swipeIndex: undefined,
      requestSnapshots: undefined,
      reasonings: undefined,
      content: '',
    }
    await putBlock(get, set, chapterId, next, true)
  },

  stop: () => abort?.abort(),

  dismissError: () => set({ error: '' }),
}))

/** Write one Block back onto its Chapter and persist. `resync` bumps the Block's rev, which makes
 *  its region rebuild its DOM - right for anything that didn't come from the region itself, wrong
 *  for typing, which would lose the caret. */
async function putBlock(
  get: () => WriteState,
  set: (partial: Partial<WriteState> | ((s: WriteState) => Partial<WriteState>)) => void,
  chapterId: number,
  block: Block,
  resync: boolean,
) {
  // Storage, not state: leaving the Story mid-generation clears `chapters`, and the reply still has
  // to land. The in-memory patch below is then a no-op, and openStory() reloads it on the way back.
  const chapter =
    get().chapters.find((c) => c.id === chapterId) ??
    ((await storage.get('chapters', chapterId)) as unknown as Chapter | undefined)
  if (!chapter) return
  const next = {
    ...chapter,
    blocks: chapter.blocks.map((b) => (b.id === block.id ? block : b)),
    updatedAt: Date.now(),
  }
  await storage.put('chapters', next as unknown as StoredRecord)
  set((s) => ({
    chapters: s.chapters.map((c) => (c.id === chapterId ? next : c)),
    ...(resync
      ? {
          revs: { ...s.revs, [block.id]: (s.revs[block.id] ?? 0) + 1 },
          // A rebuild would otherwise leave the caret at the start; typing carries on at the end.
          pendingCaret: { blockId: block.id, offset: block.content.length },
        }
      : null),
  }))
  await touchStory(get, set)
}

/** Typing, or a wholesale replace. The edit lands on the selected swipe as well as on `content`,
 *  so swiping away and back doesn't quietly discard it - the same rule chat follows. */
async function writeBlockContent(
  get: () => WriteState,
  set: (partial: Partial<WriteState> | ((s: WriteState) => Partial<WriteState>)) => void,
  chapterId: number,
  blockId: string,
  content: string,
  resync: boolean,
) {
  const block = get()
    .chapters.find((c) => c.id === chapterId)
    ?.blocks.find((b) => b.id === blockId)
  if (!block || block.content === content) return
  const swipes = block.swipes?.length
    ? block.swipes.map((t, i) => (i === (block.swipeIndex ?? 0) ? content : t))
    : undefined
  await putBlock(get, set, chapterId, { ...block, content, swipes }, resync)
}

/**
 * A finished generation: the text becomes a new swipe on the Block and the selected one. Nothing is
 * spliced and no offsets are recorded - swiping back is what Undo used to be, and it survives a
 * reload for free because the alternates are stored.
 */
async function commitSwipe(
  get: () => WriteState,
  set: (partial: Partial<WriteState> | ((s: WriteState) => Partial<WriteState>)) => void,
  chapterId: number,
  blockId: string,
  added: string,
  reasoning?: string,
) {
  if (!added.trim()) return
  const chapter =
    get().chapters.find((c) => c.id === chapterId) ??
    ((await storage.get('chapters', chapterId)) as unknown as Chapter | undefined)
  const block = chapter?.blocks.find((b) => b.id === blockId)
  if (!block) return
  const next = regenerated(block, added.trim(), undefined, reasoning)
  if (next) await putBlock(get, set, chapterId, next, true)
}
