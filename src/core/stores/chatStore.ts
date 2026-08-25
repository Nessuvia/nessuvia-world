import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import type { Character, Chat, Message, PromptStack, SpeakerAs } from '../storage/types'
import { sendMessage } from '../connectors/openaiCompatible'
import { snapshotOf } from '../connectors/snapshot'
import { buildPrompt } from '../prompt/buildPrompt'
import { loadTokenizer } from '../prompt/budget'
import type { Connection } from './settingsStore'
import { activeConnection, useSettings } from './settingsStore'
import { resolveParams } from '../settings/resolveParams'
import { displayName, useCharacters } from './charactersStore'
import { usePersonas } from './personasStore'
import { useStacks } from './stacksStore'
import { chatTitle } from './chatTitle'
import { deletedSwipes, regenerated, selectSwipe } from './swipes'
import { autoTurns, nextSpeakerIndex, participants } from './roster'
import { parseCommand, stripEscape } from './slashCommands'
import { oldMessageInstruction, rewritePrompt } from '../prompt/rewrite'
import { isEnabled, modules } from '../../app/moduleRegistry'
import { chatTokens, swapTokens } from '../prompt/swapTokens'
import { worldInfoText } from '../prompt/worldInfo'
import { useWorldInfo } from './worldInfoStore'
import { useBlips } from './blipStore'
import { isNarrator, narratorCharacter } from '../multiplayer/narrator'
import { budgetOf, maxTokensOf } from '../params/connectionParams'

/**
 * The active session's people as `Name: description` lines, filling {{personas}}, or undefined
 * outside a session. The Narrator's instructions are not here and never were a store concern —
 * they come from the prompt stack's `[if Narrator]` branch, the one place the user can edit them.
 */
let _sessionPersonas: string | undefined = undefined
export function setSessionPersonas(personas: string | undefined): void {
  _sessionPersonas = personas
}

/** The session roster in host-chosen slot order, filling {{char1}}…{{char4}}, or undefined
 *  outside a session. Set by `hostSession`, same module-level shape as the Narrator prompt above. */
let _sessionCast: Character[] | undefined = undefined
export function setSessionCast(cast: Character[] | undefined): void {
  _sessionCast = cast
}

const byTime = (a: Message, b: Message) => a.createdAt - b.createdAt || a.id! - b.id!

// Not state: nothing renders from it, and `streaming` already drives the button.
let abort: AbortController | null = null

// Stop has to end the whole self-reply run, not just the reply that's mid-stream.
let stopped = false

// finish_reason 'length' means max_tokens ended the reply mid-sentence. The reply is kept; this
// only explains why it stopped where it did.
const lengthNotice = (maxTokens: number) =>
  `Reply stopped at the ${maxTokens} token limit. Raise Max tokens in the connection.`

/**
 * The stack this chat should actually use: its own override, or the globally active one. The
 * override exists so a multiplayer session's stack cannot leak into every ordinary chat — the
 * global is what the Prompts tab and the Settings picker write, and a session must not repoint it.
 * Falls back to the global when the override names a stack that has since been deleted.
 */
export async function stackFor(chat: Chat | null): Promise<PromptStack> {
  const stacks = useStacks.getState()
  // No override: the path an ordinary chat has always taken, one call and no extra read.
  if (chat?.stackId === undefined) return stacks.ensureActive()
  await stacks.load()
  const own = useStacks.getState().stacks.find((s) => s.id === chat.stackId)
  return own ?? stacks.ensureActive()
}

/**
 * The connection as this chat should actually use it — the only place override precedence is
 * applied. It lives in the store rather than the view because the store is what sends: the
 * budget, the request body and the preview all read the same resolved object.
 */
export function resolvedConnection(character: Character, chat: Chat): Connection | undefined {
  const connection = activeConnection()
  return connection && resolveParams(connection, character, chat)
}

/**
 * The character at a roster position, falling back to the chat's own character — a participant
 * deleted out from under the roster still leaves a turn that can be generated.
 */
function characterAt(chat: Chat, index: number, fallback: Character): Character {
  // Check the Narrator first before the roster lookup. The Narrator is not in participantIds,
  // so without this branch it would hit the fallback and silently generate a normal character.
  if (isNarrator(index)) return narratorCharacter()
  const id = participants(chat)[index]
  return useCharacters.getState().characters.find((c) => c.id === id) ?? fallback
}

/**
 * The World info text for a turn. Resolved against the *speaker* — in a group chat the character
 * replying owns the book, not the chat's first participant.
 */
async function worldInfoFor(speaker: Character, messages: Message[]): Promise<string> {
  if (!speaker.id) return ''
  const entries = await useWorldInfo.getState().fetchFor(speaker.id)
  if (!entries.length) return ''
  return worldInfoText(entries, messages, speaker.worldBook)
}

/** Per character: how many chats it has, and when its newest message was (0 = none). */
export interface CharacterSummary {
  count: number
  latest: number
}

interface ChatState {
  chats: Chat[]
  /** Bookmarked chats across all characters, for the sidebar. */
  bookmarks: Chat[]
  summaries: Record<number, CharacterSummary>
  chat: Chat | null
  messages: Message[]
  streamingText: string
  /** Reasoning as it arrives, so the thinking is visible before any reply text shows up.
   *  Only reset when a stream starts — nothing renders it while `streaming` is false. */
  streamingReasoning: string
  streaming: boolean
  /** Which chat the stream belongs to, so opening another chat mid-generation doesn't show its
   *  reply there. Null when idle. */
  streamingChatId: number | null
  /** The chat ChatView currently has open, or null when no chat is on screen. Separate from `chat`,
   *  which stays loaded after you navigate away — this is the one that says you're *looking* at it,
   *  and it's what decides whether a finished reply blips instead of landing quietly. */
  viewingChatId: number | null
  setViewing(chatId: number | null): void
  error: string
  /** History messages the budget dropped on the last send — normal operation, not an error. */
  trimmedCount: number
  /** The message being re-rolled, so the stream renders in place instead of at the bottom. */
  regeneratingId: number | null
  /** Whose reply is streaming, for the placeholder header. Empty when nothing is streaming. */
  speakingName: string
  /** The streaming speaker's id, so the placeholder can use their colors too. Null when idle. */
  speakingId: number | null
  /** What the error bar's Retry should do: re-roll the message that failed, not append a new one. */
  failed: { messageId: number; instruction?: string } | null
  /** Every message in the character's chats, loaded on demand for searching inside them. */
  searchMessages: Message[]
  loadChats(characterId: number): Promise<void>
  /** One read of a character's messages, so typing a query filters in memory. */
  loadSearchIndex(characterId: number): Promise<void>
  /** One pass over chats + messages, keyed by characterId — for the picker cards. */
  loadSummaries(): Promise<void>
  /** The character's most recent chat, for the stack editor's preview. Doesn't touch chat state. */
  load(chatId: number): Promise<void>
  createChat(characterId: number): Promise<number>
  renameChat(id: number, title: string): Promise<void>
  /** Write straight to the open chat: the settings panel debounces, there's no dirty state. */
  patchChat(patch: Partial<Chat>): Promise<void>
  /** All bookmarked chats, newest first — the sidebar list. */
  loadBookmarks(): Promise<void>
  /** Flip a chat's bookmark by id, whether or not it's in the current per-character list. */
  toggleBookmark(id: number): Promise<void>
  deleteChat(id: number): Promise<void>
  /** `speakerId` sends to one chosen participant (single reply, no round robin). */
  send(character: Character, text: string, speakerId?: number, as?: SpeakerAs): Promise<void>
  /** The send path minus persisting the user message: generates a new trailing message.
   *  `speakerId` hands the turn to a specific participant instead of taking the next in order. */
  retry(character: Character, speakerId?: number): Promise<void>
  /** What the error bar offers: whatever just failed, tried again. */
  retryLast(character: Character): Promise<void>
  /** Re-roll any assistant message into a new swipe. With an instruction, it's a rewrite. */
  regenerate(character: Character, messageId: number, instruction?: string): Promise<void>
  /** Pick an alternate. No generation. */
  swipeTo(messageId: number, index: number): Promise<void>
  /** Drop alternates by index. Deleting the last one deletes the message. */
  deleteSwipes(messageId: number, indices: number[]): Promise<void>
  stop(): void
  editMessage(id: number, content: string): Promise<void>
  deleteMessage(id: number): Promise<void>
  deleteMessages(ids: number[]): Promise<void>
}

export const useChats = create<ChatState>()((set, get) => ({
  chats: [],
  bookmarks: [],
  summaries: {},
  chat: null,
  messages: [],
  streamingText: '',
  streamingReasoning: '',
  streaming: false,
  streamingChatId: null,
  viewingChatId: null,
  setViewing: (chatId) => set({ viewingChatId: chatId }),
  error: '',
  trimmedCount: 0,
  regeneratingId: null,
  speakingName: '',
  speakingId: null,
  failed: null,
  searchMessages: [],

  loadChats: async (characterId) => {
    const rows = (await storage.find('chats', 'characterId', characterId)) as unknown as Chat[]
    set({ chats: rows.sort((a, b) => a.createdAt - b.createdAt) })
  },

  loadSearchIndex: async (characterId) => {
    const chats = (await storage.find('chats', 'characterId', characterId)) as unknown as Chat[]
    const ids = new Set(chats.map((c) => c.id))
    // One pass over the whole table, like loadSummaries: a query per chat would be a dozen reads
    // for the same answer.
    const rows = (await storage.getAll('messages')) as unknown as Message[]
    set({ searchMessages: rows.filter((m) => ids.has(m.chatId)) })
  },

  loadSummaries: async () => {
    // reads every chat and message once. Fine at local-first sizes; if it drags,
    // keep a lastMessageAt on Chat and drop the messages pass.
    const chats = (await storage.getAll('chats')) as unknown as Chat[]
    const messages = (await storage.getAll('messages')) as unknown as Message[]
    const characterOf = new Map(chats.map((c) => [c.id!, c.characterId]))
    const summaries: Record<number, CharacterSummary> = {}
    for (const chat of chats) {
      const s = (summaries[chat.characterId] ??= { count: 0, latest: 0 })
      s.count++
    }
    for (const message of messages) {
      const characterId = characterOf.get(message.chatId)
      if (characterId === undefined) continue
      const s = summaries[characterId]
      if (s && message.createdAt > s.latest) s.latest = message.createdAt
    }
    set({ summaries })
  },

  load: async (chatId) => {
    const chat = (await storage.get('chats', chatId)) as unknown as Chat | undefined
    const rows = (await storage.find('messages', 'chatId', chatId)) as unknown as Message[]
    set({ chat: chat ?? null, messages: rows.sort(byTime), trimmedCount: 0 })
  },

  createChat: async (characterId) => {
    const character = useCharacters.getState().characters.find((c) => c.id === characterId)
    const name = character?.name || 'Chat'
    const existing = (await storage.find('chats', 'characterId', characterId)) as unknown as Chat[]
    const now = Date.now()
    const id = await storage.put('chats', {
      ownerId: currentOwnerId(),
      characterId,
      title: chatTitle(name, now, existing.map((c) => c.title)),
      createdAt: now,
      updatedAt: now,
    })
    // The greeting seeds the first assistant message with every greeting as a swipe: swiping it
    // picks another greeting rather than calling the model. Tokens resolve here, once, as the
    // card data becomes a real message — after that it's transcript like any other turn.
    const persona = await usePersonas.getState().ensureActive()
    const greetings = character
      ? [character.firstMessage, ...character.alternateGreetings]
          .filter((g) => g.trim())
          .map((g) => swapTokens(g, chatTokens(character, persona)))
      : []
    if (greetings.length) {
      await storage.put('messages', {
        ownerId: currentOwnerId(),
        chatId: id,
        role: 'assistant',
        content: greetings[0],
        // One swipe is just the message; more than one gives the loop something to cycle.
        ...(greetings.length > 1 ? { swipes: greetings, swipeIndex: 0 } : {}),
        createdAt: now,
      })
    }
    return id
  },

  renameChat: async (id, title) => {
    const chat = get().chats.find((c) => c.id === id)
    if (!chat) return
    await storage.put('chats', { ...chat, title, updatedAt: Date.now() } as unknown as StoredRecord)
    await get().loadChats(chat.characterId)
  },

  patchChat: async (patch) => {
    const chat = get().chat
    if (!chat) return
    const next = { ...chat, ...patch, updatedAt: Date.now() }
    await storage.put('chats', next as unknown as StoredRecord)
    set({ chat: next })
  },

  loadBookmarks: async () => {
    const rows = (await storage.getAll('chats')) as unknown as Chat[]
    set({ bookmarks: rows.filter((c) => c.bookmarked).sort((a, b) => b.updatedAt - a.updatedAt) })
  },

  toggleBookmark: async (id) => {
    const chat = (await storage.get('chats', id)) as unknown as Chat | undefined
    if (!chat) return
    const next = { ...chat, bookmarked: !chat.bookmarked, updatedAt: Date.now() }
    await storage.put('chats', next as unknown as StoredRecord)
    // Keep every list that might show this chat in sync without a full reload.
    set((s) => ({
      chats: s.chats.map((c) => (c.id === id ? next : c)),
      chat: s.chat?.id === id ? next : s.chat,
    }))
    await get().loadBookmarks()
  },

  deleteChat: async (id) => {
    const chat = get().chats.find((c) => c.id === id)
    for (const message of await storage.find('messages', 'chatId', id)) {
      await storage.remove('messages', message.id!)
    }
    await storage.remove('chats', id)
    if (chat) await get().loadChats(chat.characterId)
    await get().loadBookmarks()
  },

  send: async (character, text, speakerId, as) => {
    const chat = get().chat
    if (!chat) return

    // Commands are read here rather than in the composer because this is the one funnel: an
    // ordinary chat, the host's own turn, and a guest's `say` off the wire all arrive through
    // `send`, so a guest can type a command without the protocol carrying one.
    const roster = participants(chat)
    const cards = useCharacters.getState().characters
    const inRoster = roster
      .map((id) => cards.find((c) => c.id === id))
      .filter((c): c is Character => !!c)
    const command = parseCommand(text, inRoster.map(displayName))
    // Neither command runs a request, so nothing downstream would clear a stale error banner.
    if (command) set({ error: '' })

    if (command?.name === 'sendas') {
      const speaker = inRoster.find(
        (c) => displayName(c).toLowerCase() === command.target?.toLowerCase(),
      )
      if (!speaker) {
        set({ error: `No character named "${command.target}" in this chat.` })
        return
      }
      if (!command.text.trim()) {
        set({ error: 'No message after the character name.' })
        return
      }
      // The same fields `retry` stamps on a reply, minus the request snapshot and reasoning —
      // there was no request. Nothing records that a human wrote it: from here on it is that
      // character's line like any other.
      await storage.put('messages', {
        ownerId: currentOwnerId(),
        chatId: chat.id!,
        role: 'assistant',
        content: swapTokens(command.text, chatTokens(character, await usePersonas.getState().ensureActive())),
        speakerId: speaker.id,
        speakerName: displayName(speaker), // copied, not looked up: survives deleting the character
        createdAt: Date.now(),
      })
      // Move the cursor as a real reply would, so the round robin picks up after this character
      // rather than handing them the next turn too.
      await get().patchChat({ lastSpeakerIndex: roster.indexOf(speaker.id!) })
      await get().load(chat.id!)
      return
    }

    const persona = await usePersonas.getState().ensureActive()
    // Tokens resolve as you send, and the expanded text is what's stored — the message becomes
    // transcript the moment it lands, and transcript is never substituted again.
    // In a group this resolves {{char}} against the chat's first participant, not whoever replies
    // next: you type before the round robin picks. Per-message speaker choice is the upgrade path
    // if that turns out to be the wrong one.
    // Module-contributed text rides along in the message, not as a separate prompt block, so the
    // tag rules can collapse it from view the same way any other tag is collapsed. An unregistered
    // module contributes nothing, so a WIP module left out of the build appends nothing either.
    const ctx = { chatId: chat.id!, user: as?.name ?? persona.name, char: displayName(character) }
    const blocks: string[] = []
    const enabledPlugins = useSettings.getState().enabledPlugins
    for (const mod of modules) {
      if (!isEnabled(mod, enabledPlugins)) continue
      const block = await mod.decorateMessage?.(ctx)
      if (block) blocks.push(block)
    }
    // `/noreply` is an ordinary user turn with the command word taken off; everything else
    // (decoration, tokens, the record itself) is the same, and only the reply is skipped below.
    const body = command?.name === 'noreply' ? command.text : stripEscape(text)
    if (command?.name === 'noreply' && !body.trim()) return
    const withBlock = [body, ...blocks].join('\n')
    const content = swapTokens(withBlock, chatTokens(character, persona))
    // Persisted before the request goes out, so a failure can never lose what you typed.
    await storage.put('messages', {
      ownerId: currentOwnerId(),
      chatId: chat.id!,
      role: 'user',
      content,
      // `as` bypasses the active persona entirely: the name is stamped and personaId is left
      // absent. A guest's id is a string and has no business in a numeric Dexie key, and a guest
      // must not be attributed to one of this browser's real personas.
      ...(as ? { personaName: as.name } : { personaId: persona.id, personaName: persona.name }),
      createdAt: Date.now(),
    })
    await get().load(chat.id!)
    if (command?.name === 'noreply') return

    // A chosen speaker is one reply from that participant — no round robin, no self-reply run.
    stopped = false
    if (speakerId !== undefined) {
      await get().retry(character, speakerId)
      return
    }
    // Self-reply: keep the round robin going for a few turns instead of stopping at one reply.
    // Off is a run of one, so this is the same loop either way.
    for (let turn = 0; turn < autoTurns(chat); turn++) {
      await get().retry(character)
      if (stopped || get().error) break
    }
  },

  retry: async (character, speakerId) => {
    const chat = get().chat
    if (!chat) return
    // The Narrator is deliberately not in chat.participantIds. Branch before the index maths
    // so they never meet (both use -1 as a sentinel). If asked by Narrator, resolve speaker
    // directly without touching lastSpeakerIndex.
    if (isNarrator(speakerId)) {
      const speaker = narratorCharacter()
      // Params resolve against the speaker, not the chat's first participant.
      const connection = resolvedConnection(speaker, chat)
      if (!connection) {
        set({ error: 'No active connection — pick one in Settings.' })
        return
      }

      const controller = new AbortController()
      abort = controller
      set({ streaming: true, streamingChatId: chat.id ?? null, streamingText: '', streamingReasoning: '', error: '', failed: null, speakingName: speaker.name, speakingId: speaker.id ?? null })

      let text = ''
      let reasoning = ''
      let finishReason = ''
      let snapshot: string | undefined
      try {
        const stack = await stackFor(chat)
        const persona = await usePersonas.getState().ensureActive()
        await loadTokenizer()
        const promptMessages = buildPrompt(
          {
            stack,
            character,
            persona,
            chat,
            speaker,
            messages: get().messages,
            worldInfo: await worldInfoFor(speaker, get().messages),
            tagRules: useSettings.getState().appearance.tagRules,
            cast: _sessionCast,
            personas: _sessionPersonas,
          },
          budgetOf(connection),
        )
        set({ trimmedCount: promptMessages.droppedCount })
        snapshot = snapshotOf(promptMessages.messages, connection)
        for await (const chunk of sendMessage(promptMessages.messages, connection, controller.signal)) {
          if (chunk.reasoning) {
            reasoning += chunk.reasoning
            set({ streamingReasoning: reasoning })
          }
          if (chunk.content) {
            text += chunk.content
            set({ streamingText: text })
          }
          if (chunk.finishReason) finishReason = chunk.finishReason
        }
      } catch (err) {
        // A deliberate stop keeps the partial; a real failure discards it and keeps the error.
        if (!controller.signal.aborted) {
          set({ streaming: false, streamingChatId: null, streamingText: '', speakingName: '', speakingId: null, error: (err as Error).message })
          return
        }
      } finally {
        abort = null
      }

      // A clean stream that never produced reply text: don't vanish silently — say so, and name the
      // reasoning-only case, since a reasoning model that hits its token limit while thinking is the
      // usual cause.
      if (!text && !controller.signal.aborted) {
        const message = reasoning
          ? `The model produced ${reasoning.length} characters of reasoning but no reply — it likely hit the token limit while thinking. Raise max tokens, or turn off the model's thinking mode.`
          : 'The model returned an empty response.'
        set({ streaming: false, streamingChatId: null, streamingText: '', speakingName: '', speakingId: null, error: message })
        return
      }

      set({
        streaming: false,
        streamingChatId: null,
        streamingText: '',
        speakingName: '',
        speakingId: null,
        error: finishReason === 'length' ? lengthNotice(maxTokensOf(connection)) : '',
      })
      if (text) {
        await storage.put('messages', {
          ownerId: currentOwnerId(),
          chatId: chat.id!,
          role: 'assistant',
          content: text,
          speakerId: speaker.id,
          speakerName: speaker.name, // copied, not looked up: survives deleting the character
          // Parallel to swipes: this reply is swipe 0 even before there's a swipes array.
          requestSnapshots: [snapshot],
          reasonings: [reasoning || undefined],
          createdAt: Date.now(),
        })
        // The cursor only moves on a reply that happened, so a failed turn doesn't skip anyone.
        // Both of these write through the *current* chat, so skip them if you navigated to another
        // one while this streamed — the message above already landed in the right chat.
        if (get().chat?.id === chat.id) {
          await get().patchChat({ lastSpeakerIndex: -1 }) // Narrator doesn't advance round robin
          await get().load(chat.id!)
        }
        if (get().viewingChatId !== chat.id) useBlips.getState().mark(speaker.id)
      }
      return
    }
    // Round robin, unless an avatar was clicked. A solo chat is a roster of one, so this is the
    // same code path either way — index 0, every time.
    const asked = speakerId === undefined ? -1 : participants(chat).indexOf(speakerId)
    const index = asked >= 0 ? asked : nextSpeakerIndex(chat)
    const speaker = characterAt(chat, index, character)
    // Params resolve against the speaker, not the chat's first participant.
    const connection = resolvedConnection(speaker, chat)
    if (!connection) {
      set({ error: 'No active connection — pick one in Settings.' })
      return
    }

    const controller = new AbortController()
    abort = controller
    set({ streaming: true, streamingChatId: chat.id ?? null, streamingText: '', streamingReasoning: '', error: '', failed: null, speakingName: speaker.name, speakingId: speaker.id ?? null })

    let text = ''
    let reasoning = ''
    let finishReason = ''
    let snapshot: string | undefined
    try {
      const stack = await stackFor(chat)
      const persona = await usePersonas.getState().ensureActive()
      await loadTokenizer()
      const promptMessages = buildPrompt(
        {
          stack,
          character,
          persona,
          chat,
          speaker,
          messages: get().messages,
          worldInfo: await worldInfoFor(speaker, get().messages),
          tagRules: useSettings.getState().appearance.tagRules,
          cast: _sessionCast,
          personas: _sessionPersonas,
        },
        budgetOf(connection),
      )
      set({ trimmedCount: promptMessages.droppedCount })
      snapshot = snapshotOf(promptMessages.messages, connection)
      for await (const chunk of sendMessage(promptMessages.messages, connection, controller.signal)) {
        if (chunk.reasoning) {
          reasoning += chunk.reasoning
          set({ streamingReasoning: reasoning })
        }
        if (chunk.content) {
          text += chunk.content
          set({ streamingText: text })
        }
        if (chunk.finishReason) finishReason = chunk.finishReason
      }
    } catch (err) {
      // A deliberate stop keeps the partial; a real failure discards it and keeps the error.
      if (!controller.signal.aborted) {
        set({ streaming: false, streamingChatId: null, streamingText: '', speakingName: '', speakingId: null, error: (err as Error).message })
        return
      }
    } finally {
      abort = null
    }

    // A clean stream that never produced reply text: don't vanish silently — say so, and name the
    // reasoning-only case, since a reasoning model that hits its token limit while thinking is the
    // usual cause.
    if (!text && !controller.signal.aborted) {
      const message = reasoning
        ? `The model produced ${reasoning.length} characters of reasoning but no reply — it likely hit the token limit while thinking. Raise max tokens, or turn off the model's thinking mode.`
        : 'The model returned an empty response.'
      set({ streaming: false, streamingChatId: null, streamingText: '', speakingName: '', speakingId: null, error: message })
      return
    }

    set({
      streaming: false,
      streamingChatId: null,
      streamingText: '',
      speakingName: '',
      speakingId: null,
      error: finishReason === 'length' ? lengthNotice(maxTokensOf(connection)) : '',
    })
    if (text) {
      await storage.put('messages', {
        ownerId: currentOwnerId(),
        chatId: chat.id!,
        role: 'assistant',
        content: text,
        speakerId: speaker.id,
        speakerName: speaker.name, // copied, not looked up: survives deleting the character
        // Parallel to swipes: this reply is swipe 0 even before there's a swipes array.
        requestSnapshots: [snapshot],
        reasonings: [reasoning || undefined],
        createdAt: Date.now(),
      })
      // The cursor only moves on a reply that happened, so a failed turn doesn't skip anyone.
      // Both of these write through the *current* chat, so skip them if you navigated to another
      // one while this streamed — the message above already landed in the right chat.
      if (get().chat?.id === chat.id) {
        await get().patchChat({ lastSpeakerIndex: index })
        await get().load(chat.id!)
      }
      if (get().viewingChatId !== chat.id) useBlips.getState().mark(speaker.id)
    }
  },

  retryLast: async (character) => {
    const failed = get().failed
    // Gone (deleted while the error was up) falls back to a normal trailing generation.
    const stillThere = failed && get().messages.some((m) => m.id === failed.messageId)
    if (failed && stillThere) await get().regenerate(character, failed.messageId, failed.instruction)
    else await get().retry(character)
  },

  regenerate: async (character, messageId, instruction) => {
    const chat = get().chat
    if (!chat) return
    const at = get().messages.findIndex((m) => m.id === messageId)
    const target = get().messages[at]
    if (!target || target.role !== 'assistant') return

    // Re-rolled as whoever said it, not as whoever is up next — so the snapshot stays truthful and
    // the reply keeps the same voice, card and params.
    const speaker =
      useCharacters.getState().characters.find((c) => c.id === target.speakerId) ?? character
    const connection = resolvedConnection(speaker, chat)
    if (!connection) {
      set({ error: 'No active connection — pick one in Settings.' })
      return
    }

    const controller = new AbortController()
    abort = controller
    set({
      streaming: true,
      streamingChatId: chat.id ?? null,
      streamingText: '',
      streamingReasoning: '',
      error: '',
      failed: null,
      regeneratingId: messageId,
      speakingName: target.speakerName ?? speaker.name,
    })

    // Your instruction if you gave one; otherwise, on an old message, the default that tells the
    // model what came after it. Re-rolling the last message appends nothing, exactly as Phase 1.
    // Only your half is token-swapped: the quoted message and transcript stay verbatim.
    const rewriteTokens = chatTokens(speaker, await usePersonas.getState().ensureActive())
    const appendSystem = instruction?.trim()
      ? rewritePrompt(target.content, swapTokens(instruction, rewriteTokens))
      : oldMessageInstruction(get().messages.slice(at + 1), speaker.name)

    let text = ''
    let reasoning = ''
    let finishReason = ''
    let snapshot: string | undefined
    try {
      const stack = await stackFor(chat)
      const persona = await usePersonas.getState().ensureActive()
      await loadTokenizer()
      // As if this message didn't exist yet: history is everything before it. Anything after it
      // is neither sent nor touched — it only reaches the model through the instruction above.
      const prompt = buildPrompt(
        {
          stack,
          character,
          persona,
          chat,
          speaker,
          messages: get().messages.slice(0, at),
          worldInfo: await worldInfoFor(speaker, get().messages.slice(0, at)),
          appendSystem,
          tagRules: useSettings.getState().appearance.tagRules,
          cast: _sessionCast,
          personas: _sessionPersonas,
        },
        budgetOf(connection),
      )
      set({ trimmedCount: prompt.droppedCount })
      snapshot = snapshotOf(prompt.messages, connection)
      for await (const chunk of sendMessage(prompt.messages, connection, controller.signal)) {
        if (chunk.reasoning) {
          reasoning += chunk.reasoning
          set({ streamingReasoning: reasoning })
        }
        if (chunk.content) {
          text += chunk.content
          set({ streamingText: text })
        }
        if (chunk.finishReason) finishReason = chunk.finishReason
      }
    } catch (err) {
      // A deliberate stop keeps the partial as a swipe; a real failure changes nothing.
      if (!controller.signal.aborted) {
        set({
          streaming: false,
          streamingChatId: null,
          streamingText: '',
          regeneratingId: null,
          speakingName: '',
          error: (err as Error).message,
          // Retry means "this re-roll again", not "add a new message at the bottom".
          failed: { messageId, instruction },
        })
        return
      }
    } finally {
      abort = null
    }

    set({
      streaming: false,
      streamingChatId: null,
      streamingText: '',
      regeneratingId: null,
      speakingName: '',
      error: finishReason === 'length' ? lengthNotice(maxTokensOf(connection)) : '',
    })
    const updated = regenerated(target, text, snapshot, reasoning)
    if (updated) {
      await storage.put('messages', updated as unknown as StoredRecord)
      // Same as retry: don't reload if you've moved to another chat mid-stream — blip instead.
      if (get().chat?.id === chat.id) await get().load(chat.id!)
      if (get().viewingChatId !== chat.id) {
        useBlips.getState().mark(target.speakerId ?? chat.characterId)
      }
    }
  },

  swipeTo: async (messageId, index) => {
    const message = get().messages.find((m) => m.id === messageId)
    if (!message) return
    await storage.put('messages', selectSwipe(message, index) as unknown as StoredRecord)
    await get().load(message.chatId)
  },

  deleteSwipes: async (messageId, indices) => {
    const message = get().messages.find((m) => m.id === messageId)
    if (!message) return
    const updated = deletedSwipes(message, indices)
    if (!updated) return get().deleteMessage(messageId)
    await storage.put('messages', updated as unknown as StoredRecord)
    await get().load(message.chatId)
  },

  stop: () => {
    stopped = true
    abort?.abort()
  },

  editMessage: async (id, content) => {
    const message = get().messages.find((m) => m.id === id)
    if (!message) return
    await storage.put('messages', { ...message, content } as unknown as StoredRecord)
    await get().load(message.chatId)
  },

  deleteMessage: async (id) => {
    const chatId = get().chat?.id
    await storage.remove('messages', id)
    if (chatId) await get().load(chatId)
  },

  deleteMessages: async (ids) => {
    const chatId = get().chat?.id
    // sequential removes, one reload at the end. Bulk delete if ranges get huge.
    for (const id of ids) await storage.remove('messages', id)
    if (chatId) await get().load(chatId)
  },
}))
