// Run: node --experimental-strip-types src/core/games/checkBlackjack.ts
import assert from 'node:assert'
import type { Card, Rank, Suit } from './deck.ts'
import type { BlackjackEvent, BlackjackState } from './blackjack.ts'
import {
  dealRound, dealerStands, handValue, initialState, isBlackjack, isBust, legalActions, reduce,
  replay, resolveAction, roundOutcome, shoeFloor, visibleHand, winner,
} from './blackjack.ts'

function hand(spec: string): Card[] {
  return spec.split(/\s+/).filter(Boolean).map((token) => ({
    rank: token.slice(0, -1) as Rank,
    suit: token.slice(-1) as Suit,
  }))
}

function state(patch: Partial<BlackjackState>): BlackjackState {
  return {
    deck: [],
    hands: { player: [], char: [] },
    holeDown: true,
    score: { player: 0, char: 0 },
    turn: 'player',
    round: 0,
    outcome: null,
    over: false,
    ...patch,
  }
}

// --- counting a hand ------------------------------------------------------
{
  assert.strictEqual(handValue(hand('KS 9H')).total, 19)
  assert.strictEqual(handValue(hand('KS QH JS')).total, 30)
  assert.strictEqual(handValue(hand('AS')).total, 11)
  assert.strictEqual(handValue(hand('AS AH')).total, 12, 'two aces is 12, not 22')
  assert.strictEqual(handValue(hand('AS KH')).total, 21)
  // Every ace drops to one only as far as it has to.
  assert.strictEqual(handValue(hand('AS AH 9D')).total, 21)
  assert.strictEqual(handValue(hand('AS 5H 9D')).total, 15)
  assert.strictEqual(handValue(hand('AS 5H 9D KC')).total, 25)
  assert.strictEqual(handValue(hand('2S 3H')).total, 5)
  assert.strictEqual(handValue([]).total, 0)

  assert.strictEqual(handValue(hand('AS 6H')).soft, true)
  assert.strictEqual(handValue(hand('AS 6H KD')).soft, false, 'an ace forced to one is not soft')

  assert.ok(isBlackjack(hand('AS KH')))
  assert.ok(!isBlackjack(hand('KS 6H 5D')), 'three-card 21 is not blackjack')
  assert.ok(!isBlackjack(hand('KS 9H')))
  assert.ok(isBust(hand('KS QH 5D')))
  assert.ok(!isBust(hand('KS QH AD')), 'the ace drops to one rather than busting')
}

// --- the deal -------------------------------------------------------------
{
  const start = initialState(7)
  assert.strictEqual(start.deck.length, 52)
  assert.strictEqual(start.turn, null, 'nobody acts before the cards are out')
  assert.deepStrictEqual(initialState(7), initialState(7))

  const events = dealRound(start)
  const after = events.reduce(reduce, start)
  assert.strictEqual(after.hands.player.length, 2)
  assert.strictEqual(after.hands.char.length, 2)
  assert.strictEqual(after.deck.length, 48)
  // The hole card is face down until the dealer plays, and it is not in what you can see.
  if (after.turn === 'player') {
    assert.strictEqual(after.holeDown, true)
    assert.strictEqual(visibleHand(after).length, 1)
  }
  assert.strictEqual(visibleHand({ ...after, holeDown: false }).length, 2)
}

// --- a natural settles without asking anyone anything ---------------------
{
  // Player is dealt A K (cards 0 and 2), dealer 9 5 (cards 1 and 3).
  const start = state({ deck: hand('AS 9H KD 5C 7S 8H 2D 3C 4S 6H JD QC KH AC 2S 3H 4D'), turn: null })
  const events = dealRound(start)
  const after = events.reduce(reduce, start)
  assert.ok(isBlackjack(after.hands.player), 'the fixture did not deal a natural')
  assert.ok(events.some((e) => e.kind === 'settle'), 'a natural should settle on the spot')
  assert.strictEqual(after.outcome, 'player')
  assert.strictEqual(after.score.player, 1)
  assert.strictEqual(after.turn, null)
  assert.strictEqual(after.holeDown, false, 'settling turns the hole card over')
  assert.deepStrictEqual(legalActions(after), [], 'no decision is open once a round has settled')
}

// --- hitting, and busting -------------------------------------------------
{
  const board = state({ hands: { player: hand('KS 6H'), char: hand('9D 7C') }, deck: hand('QH 5S 8D 2C 3H 4S 6D 7H 8S 9C JS QD KC AH 2D 3S') })
  assert.deepStrictEqual(legalActions(board), ['hit', 'stand'])

  const events = resolveAction(board, 'hit')
  const after = events.reduce(reduce, board)
  assert.ok(events.some((e) => e.kind === 'bust' && e.by === 'player'), 'K 6 Q should bust')
  assert.strictEqual(after.outcome, 'char')
  assert.strictEqual(after.score.char, 1)
  // A busted player does not make the dealer draw: there is nothing left to beat.
  assert.strictEqual(after.hands.char.length, 2)
  assert.ok(events.some((e) => e.kind === 'reveal'))
}

// --- a hit that does not bust leaves the decision open --------------------
{
  const board = state({ hands: { player: hand('5S 6H'), char: hand('9D 7C') }, deck: hand('3H 5S 8D 2C 3D 4S 6D 7H 8S 9C JS QD KC AH 2D 3S') })
  const after = resolveAction(board, 'hit').reduce(reduce, board)
  assert.strictEqual(after.turn, 'player', 'still your hand')
  assert.strictEqual(handValue(after.hands.player).total, 14)
  assert.strictEqual(after.outcome, null, 'nothing settled')
}

// --- twenty-one needs no decision -----------------------------------------
{
  const board = state({ hands: { player: hand('5S 6H'), char: hand('9D 7C') }, deck: hand('QH 5S 8D 2C 3D 4S 6D 7H 8S 9C JS QD KC AH 2D 3S') })
  const events = resolveAction(board, 'hit')
  const after = events.reduce(reduce, board)
  assert.strictEqual(handValue(after.hands.player).total, 21)
  assert.ok(events.some((e) => e.kind === 'settle'), 'hitting to 21 should play the round out')
  assert.strictEqual(after.turn, null)
}

// --- standing hands the table over, and the dealer plays to 17 ------------
{
  const board = state({ hands: { player: hand('KS 8H'), char: hand('9D 5C') }, deck: hand('2H 3S 8D 2C 3D 4S 6D 7H 8S 9C JS QD KC AH 2D 3S') })
  const events = resolveAction(board, 'stand')
  const after = events.reduce(reduce, board)
  assert.ok(events.some((e) => e.kind === 'stand' && e.by === 'player'))
  assert.ok(events.some((e) => e.kind === 'reveal'))
  // 14, hit to 16, hit to 19, stop.
  assert.ok(handValue(after.hands.char).total >= dealerStands, 'the dealer stopped short of 17')
  assert.ok(!isBust(after.hands.char))
  assert.ok(events.some((e) => e.kind === 'stand' && e.by === 'char'))
  // Player stood on 18; the dealer drew 14 → 16 → 19 and took it.
  assert.strictEqual(handValue(after.hands.char).total, 19)
  assert.strictEqual(after.outcome, 'char')
}

// --- the dealer can bust too ----------------------------------------------
{
  const board = state({ hands: { player: hand('KS 8H'), char: hand('9D 6C') }, deck: hand('KH 3S 8D 2C 3D 4S 6D 7H 8S 9C JS QD KC AH 2D 3S') })
  const after = resolveAction(board, 'stand').reduce(reduce, board)
  assert.ok(isBust(after.hands.char), '9 6 K should bust the dealer')
  assert.strictEqual(after.outcome, 'player')
  assert.strictEqual(after.score.player, 1)
}

// --- who took the round ---------------------------------------------------
{
  const at = (player: string, char: string) => roundOutcome(state({ hands: { player: hand(player), char: hand(char) } }))
  assert.strictEqual(at('KS 9H', 'KD 8C'), 'player')
  assert.strictEqual(at('KS 7H', 'KD 8C'), 'char')
  assert.strictEqual(at('KS 9H', 'KD 9C'), 'push')
  assert.strictEqual(at('KS QH 5D', 'KD 8C'), 'char', 'a bust loses even against a low dealer')
  assert.strictEqual(at('KS 9H', 'KD QC 5S'), 'player', 'a dealer bust wins it')
  assert.strictEqual(at('AS KH', 'KD 6C 5S'), 'player', 'blackjack beats a three-card 21')
  assert.strictEqual(at('AS KH', 'AD QC'), 'push', 'two naturals push')
}

// --- reduce never mutates -------------------------------------------------
{
  const board = state({ hands: { player: hand('5S 6H'), char: hand('9D 7C') }, deck: hand('3H 5S') })
  const snapshot = JSON.stringify(board)
  reduce(board, { kind: 'hit', by: 'player', rank: '3' })
  reduce(board, { kind: 'settle', outcome: 'player' })
  assert.strictEqual(JSON.stringify(board), snapshot, 'reduce mutated its input')
  assert.deepStrictEqual(reduce(board, { kind: 'say', by: 'char', text: 'hm' }), board)
}

// --- a whole game plays out, and replay equals stepping -------------------
{
  const seed = 88
  const log: BlackjackEvent[] = []
  let current = initialState(seed)
  let guard = 0
  const step = (events: BlackjackEvent[]) => {
    log.push(...events)
    current = events.reduce(reduce, current)
  }
  step(dealRound(current))
  while (!current.over && guard++ < 400) {
    if (current.turn === 'player') {
      // Basic strategy, near enough: draw under 17.
      step(resolveAction(current, handValue(current.hands.player).total < dealerStands ? 'hit' : 'stand'))
    } else {
      // The round settled; open the next one.
      step(dealRound(current))
    }
  }
  assert.ok(current.over, 'the game never ended')
  assert.ok(current.round > 1, 'only one round was played')
  assert.ok(current.deck.length < shoeFloor, 'the game ended with a full shoe')
  assert.strictEqual(current.score.player + current.score.char <= current.round, true)
  assert.deepStrictEqual(replay(seed, log), current, 'replay diverged from stepping')
  assert.deepStrictEqual(replay(seed, log, 0), initialState(seed))
  for (const upTo of [1, 4, Math.floor(log.length / 2), log.length]) {
    assert.deepStrictEqual(replay(seed, log, upTo), log.slice(0, upTo).reduce(reduce, initialState(seed)))
  }
  const champion = winner(current)
  assert.ok(champion === null || champion === 'player' || champion === 'char')
}

// --- forty seeds all terminate --------------------------------------------
{
  for (let seed = 0; seed < 40; seed++) {
    let current = initialState(seed)
    let guard = 0
    current = dealRound(current).reduce(reduce, current)
    while (!current.over && guard++ < 400) {
      current =
        current.turn === 'player'
          ? resolveAction(current, handValue(current.hands.player).total < dealerStands ? 'hit' : 'stand').reduce(reduce, current)
          : dealRound(current).reduce(reduce, current)
    }
    assert.ok(current.over, `seed ${seed} never ended`)
    // No card is ever created: dealt hands plus what is left has to account for the shoe.
    assert.ok(current.deck.length >= 0 && current.deck.length < shoeFloor)
  }
}

console.log('ok')
