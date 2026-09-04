import { create } from 'zustand'
import { storage } from '../../core/storage/db'
import { currentOwnerId } from '../../core/storage/storageInterface'
import type { StoredRecord } from '../../core/storage/storageInterface'
import type { Character, Chat, Game, Message, Persona, PromptStack } from '../../core/storage/types'
import type { GoFishEvent, GoFishState, MoveQuality, Side } from '../../core/games/goFish'
import { chooseMove, initialState, legalAsks, reduce, resolveAsk } from '../../core/games/goFish'
import type { BlackjackEvent, BlackjackState } from '../../core/games/blackjack'
import * as blackjack from '../../core/games/blackjack'
import type { GameEvent, GameKind } from '../../core/games/gameEvent'
import { gameLabels } from '../../core/games/gameEvent'
import type { Rank } from '../../core/games/deck'
import { parseAction, parseAsk } from '../../core/games/parseMove'
import { buildStateBlock, describeEvent } from '../../core/games/gameState'
import * as blackjackState from '../../core/games/blackjackState'
import { resolvedConnection } from '../../core/stores/chatStore'
import { runSecondPass } from '../../core/secondPass/runSecondPass'
import { buildPrompt } from '../../core/prompt/buildPrompt'
import { loadTokenizer } from '../../core/prompt/budget'
import { tokenizerFor } from '../../core/prompt/tokenizers'
import { budgetOf } from '../../core/params/connectionParams'
import { useSettings } from '../../core/stores/settingsStore'
import { displayName, useCharacters } from '../../core/stores/charactersStore'
import { usePersonas } from '../../core/stores/personasStore'
import { defaultGameStack, useStacks } from '../../core/stores/stacksStore'
import { bookSound, cardSound } from './sounds'
import { motionSettled } from './cardMotion'

/**
 * A game is not a chat. It reads no chat history, writes no messages, and carries its own log.
 * The board moves first and the character's line arrives after, so a dead connection costs you the
 * commentary and nothing else.
 */

/** The character always sits on the 'char' side; you are always 'player'. */
export const playerSide: Side = 'player'

/**
 * The beat between the parts of a move. Asking and then drawing in the same frame reads as one
 * event rather than two, and the board has nothing else to say that it happened.
 */
const moveBeat = 1000

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The wait before the next event lands: the cards finish moving, then the beat. An arrival takes
 * seconds, and writing the next event while one is still in the air replaces the card in flight
 * with the same card in its final place.
 */
async function beat(ms = moveBeat) {
  await motionSettled()
  await pause(ms)
}

/** Either game's state. Both carry `over`, which is the only field anything generic reads. */
export type AnyGameState = GoFishState | BlackjackState

/**
 * The per-game pieces everything generic needs. Two implementations, so this is a table rather
 * than an abstraction: the casts inside it are the one place `Game.kind` deciding which half of
 * `GameEvent` a log is has to be said out loud.
 */
interface GameRules {
  initial(seed: number): AnyGameState
  reduce(state: AnyGameState, event: GameEvent): AnyGameState
  /** The `<gameState>` block, from the character's side of the table. */
  block(state: AnyGameState, tag: string): string
  describe(events: GameEvent[]): string
}

const rules: Record<GameKind, GameRules> = {
  goFish: {
    initial: (seed) => initialState(seed),
    reduce: (state, event) => reduce(state as GoFishState, event as GoFishEvent),
    block: (state, tag) => buildStateBlock(state as GoFishState, { tag, seedMove: true }),
    describe: (events) => describeEvent(events as GoFishEvent[]),
  },
  blackjack: {
    initial: (seed) => blackjack.initialState(seed),
    reduce: (state, event) => blackjack.reduce(state as BlackjackState, event as BlackjackEvent),
    block: (state, tag) => blackjackState.buildStateBlock(state as BlackjackState, { tag }),
    describe: (events) => blackjackState.describeEvent(events as BlackjackEvent[]),
  },
}

/** The board a log adds up to. The only way state is ever produced. */
export function boardState(game: Game, upTo?: number): AnyGameState {
  const kind = rules[game.kind]
  const slice = upTo === undefined ? game.events : game.events.slice(0, upTo)
  return slice.reduce(kind.reduce, kind.initial(game.seed))
}

function newGame(
  kind: GameKind,
  character: Character,
  persona: Persona | undefined,
  stackId: number | undefined,
): Game {
  const now = Date.now()
  return {
    ownerId: currentOwnerId(),
    kind,
    characterId: character.id!,
    characterName: displayName(character),
    personaId: persona?.id,
    personaName: persona?.name,
    stackId,
    // Milliseconds are seed enough: two games started in the same millisecond would need the same
    // character too, and the shuffle only has to be unguessable to a person, not to an attacker.
    seed: now >>> 0,
    events: [],
    status: 'playing',
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * The log projected into chat messages. The character's lines are the assistant turns; each move
 * is a user turn.
 *
 * Only the newest user turn carries the `<gameState>` block. An old board is not the board, and
 * repeating one per turn would fill the context with hands that no longer exist.
 */
function gameMessages(game: Game, tag: string): Message[] {
  const kind = rules[game.kind]
  const messages: Message[] = []
  let current = kind.initial(game.seed)
  let batch: GameEvent[] = []
  let clock = game.createdAt

  const pushMove = (state: AnyGameState, events: GameEvent[], withBlock: boolean) => {
    const line = kind.describe(events)
    if (!line) return
    const block = withBlock ? `${kind.block(state, tag)}\n\n` : ''
    // What the player typed, verbatim, on every turn they typed on. The event line is the
    // unambiguous fact; their words are the turn, and a character that only ever saw the fact
    // could not answer what was actually said to it.
    const said = events.find((e) => e.kind === 'ask' && e.by === 'player' && e.text)
    const quote = said?.kind === 'ask' && said.text ? `\n\nThey said: "${said.text}"` : ''
    messages.push({
      ownerId: game.ownerId,
      chatId: 0,
      role: 'user',
      content: block + line + quote,
      createdAt: clock++,
    })
  }

  for (const event of game.events) {
    if (event.kind === 'say') {
      pushMove(current, batch, false)
      batch = []
      // The player's own line is a user turn, quoted the same way an ask is, so the character
      // reads it as something said to them rather than as another fact about the table.
      messages.push({
        ownerId: game.ownerId,
        chatId: 0,
        role: event.by === 'char' ? 'assistant' : 'user',
        content: event.by === 'char' ? event.text : `They said: "${event.text}"`,
        createdAt: clock++,
      })
      continue
    }
    batch.push(event)
    current = kind.reduce(current, event)
  }
  // The trailing batch is the move being reacted to right now, so it gets the board. When the log
  // ends on something the player said there is no trailing batch, and the block goes on that line
  // instead: a reply with no board in the prompt is the character guessing.
  if (batch.length > 0) {
    pushMove(current, batch, true)
  } else {
    const last = [...messages].reverse().find((m) => m.role === 'user')
    if (last) last.content = `${kind.block(current, tag)}\n\n${last.content}`
  }
  return messages
}

/**
 * Board zoom and log width are non-portable preferences: they belong to this screen on this
 * monitor, not to the user's data. Straight to localStorage, no store table, out of the export.
 */
const scaleKey = 'nessuTavern.gamesBoardScale'
const widthKey = 'nessuTavern.gamesLogWidth'
const openKey = 'nessuTavern.gamesLogOpen'

function readNumber(key: string, fallback: number): number {
  const value = Number(localStorage.getItem(key))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

interface GamesState {
  games: Game[]
  loading: boolean
  /** The open game, or null on the Play/History screens. */
  game: Game | null
  /** Rebuilt from the log on every write. Components read this, never the log, and narrow it on
   *  `game.kind`. */
  state: AnyGameState
  streaming: boolean
  streamingText: string
  /** A failed reply. The board is already correct, so this is not a rollback. */
  error: string
  /** Unparsable input: shown briefly, nothing is logged. */
  notice: string

  /** 1 to 4. A 4k monitor renders the board at a fraction of the screen otherwise. */
  boardScale: number
  /** Width of the log panel in px. */
  logWidth: number
  logOpen: boolean
  setBoardScale(scale: number): void
  setLogWidth(width: number): void
  setLogOpen(open: boolean): void

  load(): Promise<void>
  start(kind: GameKind, characterId: number): Promise<number | null>
  open(id: number): Promise<void>
  close(): void
  submit(text: string): Promise<void>
  setDifficulty(quality: MoveQuality): Promise<void>
  abandon(): Promise<void>
  remove(id: number): Promise<void>
  clearNotice(): void
}

/** The stack a game runs on: its own, else one named Game, else a fresh one saved as an ordinary
 *  row. Never touches the globally active chat stack. */
async function gameStack(game: Game): Promise<PromptStack> {
  const stacks = useStacks.getState()
  const own = game.stackId !== undefined && stacks.stacks.find((s) => s.id === game.stackId)
  if (own) return own
  const named = stacks.stacks.find((s) => s.name === 'Game')
  if (named) return named
  const id = await stacks.save(defaultGameStack())
  return useStacks.getState().stacks.find((s) => s.id === id) ?? defaultGameStack()
}

/** buildPrompt reads `chat` only for the author's note, speaker labels and group detection, so a
 *  record that has none of those is safe and a game never needs a Chat row. */
function syntheticChat(game: Game): Chat {
  return {
    id: 0,
    ownerId: game.ownerId,
    characterId: game.characterId,
    title: `${gameLabels[game.kind]} with ${game.characterName}`,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
  }
}

export const useGames = create<GamesState>()((set, get) => ({
  games: [],
  loading: false,
  game: null,
  state: initialState(0),
  streaming: false,
  streamingText: '',
  error: '',
  notice: '',

  boardScale: readNumber(scaleKey, 1),
  logWidth: readNumber(widthKey, 320),
  logOpen: localStorage.getItem(openKey) !== '0',

  setBoardScale: (scale) => {
    localStorage.setItem(scaleKey, String(scale))
    set({ boardScale: scale })
  },
  setLogWidth: (width) => {
    localStorage.setItem(widthKey, String(width))
    set({ logWidth: width })
  },
  setLogOpen: (open) => {
    localStorage.setItem(openKey, open ? '1' : '0')
    set({ logOpen: open })
  },

  clearNotice: () => set({ notice: '' }),

  load: async () => {
    set({ loading: true })
    const rows = (await storage.getAll('games')) as unknown as Game[]
    set({ games: rows.sort((a, b) => b.updatedAt - a.updatedAt), loading: false })
  },

  start: async (kind, characterId) => {
    const character = useCharacters.getState().characters.find((c) => c.id === characterId)
    if (!character) return null
    const persona = await usePersonas.getState().ensureActive()
    const game = newGame(kind, character, persona, undefined)
    // Go Fish deals itself in `initialState`. Blackjack has no cards on the table until a round is
    // opened, and opening one is an event like any other.
    const seeded: Game =
      kind === 'blackjack'
        ? { ...game, events: blackjack.dealRound(blackjack.initialState(game.seed)) }
        : game
    const id = await storage.put('games', seeded as unknown as StoredRecord)
    await get().load()
    set({
      game: { ...seeded, id },
      state: boardState(seeded),
      error: '',
      notice: '',
      streamingText: '',
    })
    return id
  },

  open: async (id) => {
    const row = (await storage.get('games', id)) as unknown as Game | undefined
    if (!row) return
    set({ game: row, state: boardState(row), error: '', notice: '', streamingText: '' })
  },

  close: () => set({ game: null, error: '', notice: '', streamingText: '' }),

  submit: async (text) => {
    const game = get().game
    if (!game || get().streaming || get().state.over) return

    const myTurn = get().state.turn === playerSide
    const move =
      !myTurn
        ? null
        : game.kind === 'goFish'
          ? parseAsk(text, legalAsks(get().state as GoFishState, playerSide))
          : parseAction(text)

    // Off your turn, or on it with something that is not a move: with chat back on the words are
    // kept as something you said. Nothing about the board moves and no reply is generated; the
    // character reads it on its next turn, which is when it has something to answer with.
    if (!move) {
      if (!useSettings.getState().gameChatBack) {
        set({
          notice:
            game.kind === 'goFish'
              ? 'That is not a rank you hold. Try "got any sevens".'
              : 'Say hit or stand.',
        })
        return
      }
      set({ notice: '' })
      await appendEvents(get, set, [{ kind: 'say', by: playerSide, text: text.trim() }])
      if (useSettings.getState().gameChatBackReply) await react(get, set)
      return
    }
    set({ notice: '' })
    // Stored as typed. Trimmed of surrounding whitespace and nothing else: what the player wrote
    // is what the log shows and what the model reads.
    if (game.kind === 'blackjack') {
      await playBlackjack(get, set, move as blackjack.Action, text.trim())
      return
    }
    await applyMove(get, set, playerSide, move as Rank, text.trim())

    // The character moves until the turn comes back, so a run of hits plays out in one go.
    let guard = 0
    while (get().state.turn === 'char' && !get().state.over && guard++ < 60) {
      const next = chooseMove(get().state as GoFishState, 'char', game.difficulty ?? 'average')
      if (!next) break
      // A beat before they speak again, so a run of hits reads as several moves.
      await beat()
      await applyMove(get, set, 'char', next)
    }
  },

  setDifficulty: async (difficulty) => {
    const game = get().game
    if (!game) return
    await persist(get, set, { ...game, difficulty })
  },

  abandon: async () => {
    const game = get().game
    if (!game) return
    await persist(get, set, { ...game, status: 'abandoned' })
  },

  remove: async (id) => {
    await storage.remove('games', id)
    if (get().game?.id === id) get().close()
    await get().load()
  },
}))

type Get = () => GamesState
type Set = (patch: Partial<GamesState>) => void

/**
 * Apply one side's ask: the ask lands, a beat passes, then what it cost or won, then the line.
 *
 * The split is the whole point. `resolveAsk` works out the move in one go, but writing all of it
 * at once means the card is already drawn before you have read who asked for what.
 */
async function applyMove(get: Get, set: Set, side: Side, rank: Rank, text?: string) {
  const game = get().game
  if (!game) return
  const events = resolveAsk(get().state as GoFishState, side, rank, text)
  const split = Math.max(1, events.findIndex((e) => e.kind !== 'ask'))

  await appendEvents(get, set, events.slice(0, split))
  if (split < events.length) {
    await beat()
    await appendEvents(get, set, events.slice(split))
  }
  await react(get, set)
}

/**
 * Blackjack: the player's decision plays the rest of the round out, so the events land one at a
 * time with a beat between them. Nothing is decided here; `resolveAction` already did all of it.
 * A round that settles opens the next one, quietly, since being dealt to is not worth a line.
 */
async function playBlackjack(get: Get, set: Set, action: blackjack.Action, text: string) {
  const board = get().state as BlackjackState
  const events = blackjack.resolveAction(board, action)

  // The words the player typed ride on their own turn, the way an ask carries them in Go Fish.
  await appendEvents(get, set, [{ kind: 'say', by: playerSide, text }])
  for (const [i, event] of events.entries()) {
    if (i > 0) await beat(event.kind === 'hit' ? moveBeat : moveBeat / 2)
    await appendEvents(get, set, [event])
  }
  await react(get, set)

  const after = get().state as BlackjackState
  if (!after.over && after.turn === null) {
    await beat()
    await appendEvents(get, set, blackjack.dealRound(after))
  }
}

async function appendEvents(get: Get, set: Set, events: GameEvent[]) {
  const game = get().game
  if (!game || events.length === 0) return
  if (!useSettings.getState().gameSoundOff) {
    if (events.some((e) => e.kind === 'book' || e.kind === 'settle')) bookSound()
    else if (events.some((e) => e.kind === 'give' || e.kind === 'draw' || e.kind === 'hit' || e.kind === 'deal')) {
      cardSound()
    }
  }
  const log = [...game.events, ...events]
  const state = boardState({ ...game, events: log })
  await persist(get, set, { ...game, events: log, status: state.over ? 'finished' : game.status }, state)
}

async function persist(get: Get, set: Set, game: Game, state?: AnyGameState) {
  const row: Game = { ...game, updatedAt: Date.now() }
  const id = await storage.put('games', row as unknown as StoredRecord)
  set({ game: { ...row, id }, state: state ?? boardState(row) })
  await get().load()
}

/**
 * Stream the character's line for whatever just happened and append it as a `say` event.
 *
 * The send path is store to connector, the same as every other generation: nothing here calls
 * fetch, so the CLAUDE.md rule stands.
 */
async function react(get: Get, set: Set) {
  const game = get().game
  if (!game) return
  const character = useCharacters.getState().characters.find((c) => c.id === game.characterId)
  if (!character) return

  const connection = resolvedConnection(character, syntheticChat(game))
  if (!connection) {
    set({ error: 'No active connection, pick one in Settings.' })
    return
  }

  const persona =
    usePersonas.getState().personas.find((p) => p.id === game.personaId) ??
    (await usePersonas.getState().ensureActive())

  const controller = new AbortController()
  set({ streaming: true, streamingText: '', error: '' })
  let text = ''
  try {
    const stack = await gameStack(game)
    await loadTokenizer(tokenizerFor(connection))
    const built = buildPrompt(
      {
        stack,
        character,
        persona,
        chat: syntheticChat(game),
        messages: gameMessages(game, 'gameState'),
        game: gameLabels[game.kind],
        tagRules: useSettings.getState().appearance.tagRules,
      },
      budgetOf(connection),
    )
    for await (const chunk of runSecondPass(built.messages, connection, controller.signal)) {
      if (chunk.content) {
        text += chunk.content
        set({ streamingText: text })
      }
    }
  } catch (err) {
    // The board already moved and the log is correct. A game with no reply is still a game.
    set({ streaming: false, streamingText: '', error: (err as Error).message })
    return
  }

  set({ streaming: false, streamingText: '' })
  if (!text.trim()) return
  const current = get().game
  if (!current || current.id !== game.id) return
  await persist(get, set, { ...current, events: [...current.events, { kind: 'say', by: 'char', text: text.trim() }] })
}
