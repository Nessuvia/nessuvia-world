// Go Fish: the rules, as a reducer over an append-only event log.
//
// Code owns every rule here. Nothing about legality, scoring, shuffling, turn order or the
// opponent's move choice is ever asked of the model; it only gets told what happened. State is
// never stored, only the seed and the events, and `replay` is the only way state is produced.
//
// Rules: 5-card hands, a book is four of a kind, you must hold the rank you ask for, a successful
// ask keeps your turn, and fishing the exact card you asked for also keeps your turn.

import type { Card, Rank } from './deck.ts'
import { fullDeck, ranks, shuffle } from './deck.ts'

export type Side = 'player' | 'char'

export const handSize = 5

export function other(side: Side): Side {
  return side === 'player' ? 'char' : 'player'
}

export type GoFishEvent =
  /** `text` is what the player actually typed, kept verbatim. The rules only ever read `rank`, but
   *  the words are the turn: they go to the model and they are what the log shows. Absent on the
   *  character's asks, which code chooses and nobody typed. */
  | { kind: 'ask'; by: Side; rank: Rank; text?: string }
  /** Every card of `rank` moves at once: a hand never holds two of the same rank apart. */
  | { kind: 'give'; from: Side; to: Side; rank: Rank; count: number }
  /** Takes the top of the deck. `rank` is a copy for the event line; the reducer reads the deck. */
  | { kind: 'draw'; by: Side; rank: Rank }
  | { kind: 'book'; by: Side; rank: Rank }
  | { kind: 'turn'; to: Side }
  | { kind: 'end' }
  /** The character's line. Carries no rules meaning, which is why the reducer ignores it. */
  | { kind: 'say'; by: Side; text: string }

export interface GoFishState {
  deck: Card[]
  hands: Record<Side, Card[]>
  books: Record<Side, Rank[]>
  /** Ranks each side has asked for, in order. This is the only public knowledge in the game, and
   *  it is what `chooseMove` plays off. */
  asked: Record<Side, Rank[]>
  turn: Side
  over: boolean
}

/** Deal 5 and 5, book anything dealt as four of a kind. The player asks first. */
export function initialState(seed: number): GoFishState {
  const deck = shuffle(fullDeck(), seed)
  const state: GoFishState = {
    deck: deck.slice(handSize * 2),
    hands: { player: deck.slice(0, handSize), char: deck.slice(handSize, handSize * 2) },
    books: { player: [], char: [] },
    asked: { player: [], char: [] },
    turn: 'player',
    over: false,
  }
  for (const side of ['player', 'char'] as Side[]) {
    for (const rank of completedBooks(state.hands[side])) {
      state.hands[side] = state.hands[side].filter((c) => c.rank !== rank)
      state.books[side] = [...state.books[side], rank]
    }
  }
  return state
}

function completedBooks(hand: Card[]): Rank[] {
  return ranks.filter((rank) => hand.filter((c) => c.rank === rank).length === 4)
}

/** Pure: returns a new state and never mutates the one it was handed. */
export function reduce(state: GoFishState, event: GoFishEvent): GoFishState {
  switch (event.kind) {
    case 'ask':
      return { ...state, asked: { ...state.asked, [event.by]: [...state.asked[event.by], event.rank] } }
    case 'give': {
      const moving = state.hands[event.from].filter((c) => c.rank === event.rank)
      return {
        ...state,
        hands: {
          ...state.hands,
          [event.from]: state.hands[event.from].filter((c) => c.rank !== event.rank),
          [event.to]: [...state.hands[event.to], ...moving],
        },
      }
    }
    case 'draw': {
      const card = state.deck[0]
      if (!card) return state
      return {
        ...state,
        deck: state.deck.slice(1),
        hands: { ...state.hands, [event.by]: [...state.hands[event.by], card] },
      }
    }
    case 'book':
      return {
        ...state,
        hands: { ...state.hands, [event.by]: state.hands[event.by].filter((c) => c.rank !== event.rank) },
        books: { ...state.books, [event.by]: [...state.books[event.by], event.rank] },
      }
    case 'turn':
      return { ...state, turn: event.to }
    case 'end':
      return { ...state, over: true }
    case 'say':
      return state
  }
}

/** Fold the log from the deal. The only way a state is ever produced. `upTo` is an event count,
 *  which is what the History scrubber moves. */
export function replay(seed: number, events: GoFishEvent[], upTo?: number): GoFishState {
  const slice = upTo === undefined ? events : events.slice(0, upTo)
  return slice.reduce(reduce, initialState(seed))
}

/** The ranks a side may ask for: the ones it holds. Drives both validation and the opponent. */
export function legalAsks(state: GoFishState, side: Side): Rank[] {
  const held = new Set(state.hands[side].map((c) => c.rank))
  return ranks.filter((rank) => held.has(rank))
}

/** The full consequence of one ask: the give or the draw, any book formed, the top-ups, who moves
 *  next, and the end of the game. Returns events; applying them is the caller's job. */
export function resolveAsk(state: GoFishState, side: Side, rank: Rank, text?: string): GoFishEvent[] {
  const events: GoFishEvent[] = []
  let current = state
  const emit = (event: GoFishEvent) => {
    events.push(event)
    current = reduce(current, event)
  }

  const opponent = other(side)
  emit(text === undefined ? { kind: 'ask', by: side, rank } : { kind: 'ask', by: side, rank, text })

  let keepsTurn: boolean
  const held = current.hands[opponent].filter((c) => c.rank === rank).length
  if (held > 0) {
    emit({ kind: 'give', from: opponent, to: side, rank, count: held })
    keepsTurn = true
  } else if (current.deck.length > 0) {
    const drawn = current.deck[0]
    emit({ kind: 'draw', by: side, rank: drawn.rank })
    keepsTurn = drawn.rank === rank
  } else {
    keepsTurn = false
  }

  // Only the asker's hand grew, so only the asker can have completed a book.
  for (const booked of completedBooks(current.hands[side])) emit({ kind: 'book', by: side, rank: booked })

  // An empty hand draws one, so a side is never stuck holding nothing while cards remain. Both
  // sides: giving your last card away empties a hand that is not the asker's. One card cannot
  // complete a book, so there is nothing to check afterwards.
  for (const who of [side, opponent]) {
    if (current.hands[who].length === 0 && current.deck.length > 0) {
      emit({ kind: 'draw', by: who, rank: current.deck[0].rank })
    }
  }

  let next = keepsTurn ? side : opponent
  // Whoever is up must have something to ask with. With an empty hand and an empty deck they
  // cannot move, so the turn goes back; if neither side can move, `isOver` catches it below.
  if (current.hands[next].length === 0) next = other(next)
  emit({ kind: 'turn', to: next })

  if (isOver(current)) emit({ kind: 'end' })
  return events
}

/** How well the mover plays. Today this only seeds the prompt; a later difficulty setting points
 *  the opponent's actual move at it. */
export type MoveQuality = 'best' | 'average' | 'worst'

/** Pick a rank for `side` to ask for, or null when it holds nothing. Never consults the model. */
export function chooseMove(state: GoFishState, side: Side, quality: MoveQuality): Rank | null {
  const legal = legalAsks(state, side)
  if (legal.length === 0) return null
  const count = (rank: Rank) => state.hands[side].filter((c) => c.rank === rank).length

  if (quality === 'best') {
    // What the opponent asked for, it held at the time. Most recent first: it is the least likely
    // to have been booked away since.
    const knownHeld = [...state.asked[other(side)]].reverse().find((rank) => legal.includes(rank))
    if (knownHeld) return knownHeld
    // Otherwise ask where you hold the most: the fewest cards left to find.
    return legal.reduce((best, rank) => (count(rank) > count(best) ? rank : best), legal[0])
  }
  if (quality === 'worst') {
    return legal.reduce((worst, rank) => (count(rank) < count(worst) ? rank : worst), legal[0])
  }
  // 'average': no reasoning at all. Index derived from the log length so a replay picks the same
  // rank; the caller keeps its own randomness out of the reducer.
  const spin = state.asked.player.length + state.asked.char.length
  return legal[spin % legal.length]
}

export function isOver(state: GoFishState): boolean {
  if (state.books.player.length + state.books.char.length === ranks.length) return true
  // Deck spent and a hand empty: that side can never ask again, so nothing more can happen.
  return state.deck.length === 0 && (state.hands.player.length === 0 || state.hands.char.length === 0)
}

/** The side with more books, or null for a tie. */
export function winner(state: GoFishState): Side | null {
  const player = state.books.player.length
  const char = state.books.char.length
  if (player === char) return null
  return player > char ? 'player' : 'char'
}
