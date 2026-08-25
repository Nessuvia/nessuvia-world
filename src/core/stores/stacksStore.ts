import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import type { PromptBlock, PromptStack } from '../storage/types'
import { useSettings } from './settingsStore'

export function newBlock(partial: Partial<PromptBlock> = {}): PromptBlock {
  return {
    id: crypto.randomUUID(),
    label: 'Block',
    source: 'text',
    role: 'system',
    content: '',
    ...partial,
  }
}

/** Three blocks, not six: on real cards personality/scenario/examples are usually blank. */
export function defaultStack(name = 'Default'): PromptStack {
  return {
    ownerId: currentOwnerId(),
    name,
    kind: 'chat',
    active: [
      newBlock({
        label: 'Main prompt',
        content: "Write {{char}}'s next reply in this fictional roleplay.",
      }),
      newBlock({ label: 'Character description', source: 'characterDescription' }),
      newBlock({ label: 'Chat History', source: 'chatHistory' }),
    ],
    inactive: [],
  }
}

/**
 * A chat stack for a hosted session. The first two blocks branch on `[if Narrator]`, so one stack
 * covers two kinds of turn: the Narrator is told to write as a third party and gets the whole cast,
 * while a character is told to write as itself and gets only its own description.
 *
 * This stack is the *only* source of the Narrator's instructions — the Narrator is a speaker with a
 * name and no card, so anything not written here is not sent. Editing this text is how the Narrator
 * is changed.
 *
 * The Narrator branch uses the slot tokens rather than the bound `characterDescription`, which only
 * ever holds the speaker. A slot with no character resolves to '' on both tokens, so the empty
 * slots contribute nothing but a blank line. `{{personas}}` is the people in the room, which no
 * character token covers.
 */
export function defaultMultiplayerStack(name = 'Multiplayer'): PromptStack {
  return {
    ownerId: currentOwnerId(),
    name,
    kind: 'chat',
    active: [
      newBlock({
        label: 'Main prompt',
        content: [
          'This is a group roleplay between the characters below.',
          '[if Narrator]',
          'You are the Narrator. You describe the scene, the world, and the characters in it,',
          'including the player characters. You do not play a single character. Write in third',
          'person, present tense.',
          '[else]',
          'Write the next reply as {{char}} and no one else.',
          '[endif]',
        ].join('\n'),
      }),
      newBlock({
        label: 'Characters',
        content: [
          '[if Narrator]',
          '{{char1}}\n{{char1Desc}}',
          '{{char2}}\n{{char2Desc}}',
          '{{char3}}\n{{char3Desc}}',
          '{{char4}}\n{{char4Desc}}',
          '[else]',
          '{{charDescription}}',
          '[endif]',
        ].join('\n'),
      }),
      newBlock({ label: 'People in the room', content: '{{personas}}' }),
      newBlock({ label: 'Chat History', source: 'chatHistory' }),
    ],
    inactive: [],
  }
}

/** A Story stack's sensible starting blocks (sub-goal B). Cast + Story context + an empty
 *  Author's note slot, all toggled on. */
export function defaultStoryStack(name = 'Story'): PromptStack {
  return {
    ownerId: currentOwnerId(),
    name,
    kind: 'story',
    active: [
      newBlock({
        label: 'Co-writer system',
        content: 'You are a co-writer. Continue the story in prose, following the direction given.',
      }),
      newBlock({ label: 'Cast', source: 'cast' }),
      // Ahead of the prose: the guide is the arc the prose is scrolling through.
      newBlock({ label: 'Chapter guide', source: 'chapterGuide' }),
      newBlock({ label: 'Story context', source: 'storyContext' }),
      // After the prose it continues from: this is the text on the far side of the caret, which the
      // passage has to arrive at. Renders empty (and drops out) whenever there is no caret.
      newBlock({
        label: 'What follows',
        source: 'storyTrailing',
        content: 'The passage you write must lead into the text below.',
      }),
      newBlock({ label: "Author's note", source: 'authorNote', depth: 2 }),
    ],
    inactive: [],
  }
}

const stackKind = (s: PromptStack): 'chat' | 'story' => s.kind ?? 'chat'

function setActiveId(kind: 'chat' | 'story', id: number | null) {
  useSettings.setState(kind === 'story' ? { activeStoryStackId: id } : { activeStackId: id })
}

function activeIdFor(kind: 'chat' | 'story'): number | null {
  const s = useSettings.getState()
  return kind === 'story' ? s.activeStoryStackId : s.activeStackId
}

interface StacksState {
  stacks: PromptStack[]
  load(): Promise<void>
  save(stack: PromptStack): Promise<number>
  /** `preset` picks the starting blocks; without it a chat stack gets `defaultStack`. */
  create(kind?: 'chat' | 'story', preset?: 'multiplayer'): Promise<number>
  duplicate(id: number): Promise<number>
  remove(id: number): Promise<void>
  /** The active stack of a kind, creating its default one on first use rather than erroring. */
  ensureActive(kind?: 'chat' | 'story'): Promise<PromptStack>
}

export const useStacks = create<StacksState>()((set, get) => ({
  stacks: [],

  load: async () => {
    const rows = (await storage.getAll('promptStacks')) as unknown as PromptStack[]
    set({ stacks: rows })
  },

  save: async (stack) => {
    const id = await storage.put('promptStacks', stack as unknown as StoredRecord)
    await get().load()
    return id
  },

  create: async (kind = 'chat', preset) => {
    const count = get().stacks.filter((s) => stackKind(s) === kind).length + 1
    const taken = (name: string) => get().stacks.some((s) => s.name === name)
    const stack =
      preset === 'multiplayer'
        ? defaultMultiplayerStack(taken('Multiplayer') ? `Multiplayer ${count}` : 'Multiplayer')
        : kind === 'story'
          ? defaultStoryStack(`Story ${count}`)
          : defaultStack(`Stack ${count}`)
    const id = await get().save(stack)
    setActiveId(kind, id)
    return id
  },

  duplicate: async (id) => {
    const source = get().stacks.find((s) => s.id === id)
    if (!source) return id
    const copy: PromptStack = {
      ownerId: currentOwnerId(),
      name: `${source.name} copy`,
      kind: stackKind(source),
      // Fresh ids: two stacks must never share a block identity while dragging.
      active: source.active.map((b) => ({ ...b, id: crypto.randomUUID() })),
      inactive: source.inactive.map((b) => ({ ...b, id: crypto.randomUUID() })),
    }
    const newId = await get().save(copy)
    setActiveId(stackKind(source), newId)
    return newId
  },

  remove: async (id) => {
    const kind = stackKind(get().stacks.find((s) => s.id === id) ?? { kind: 'chat' } as PromptStack)
    await storage.remove('promptStacks', id)
    await get().load()
    if (activeIdFor(kind) === id) {
      setActiveId(kind, get().stacks.find((s) => stackKind(s) === kind)?.id ?? null)
    }
  },

  ensureActive: async (kind = 'chat') => {
    await get().load()
    const activeId = activeIdFor(kind)
    const ofKind = get().stacks.filter((s) => stackKind(s) === kind)
    const existing = ofKind.find((s) => s.id === activeId) ?? ofKind[0]
    if (existing) {
      if (existing.id !== activeId) setActiveId(kind, existing.id!)
      return existing
    }
    const id = await get().create(kind)
    return get().stacks.find((s) => s.id === id)!
  },
}))
