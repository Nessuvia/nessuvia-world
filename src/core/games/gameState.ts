// What the model is told. A tagged block of board state, then one plain line about what just
// happened. Written from the character's side of the table: "you" is the character, "they" is the
// player. Modelled on modules/bodyMap/output.ts::buildBlock, tag wrapper included, so an appearance
// tag rule can collapse it.

import { rankPlural, sortHand } from './deck.ts'
import type { GoFishEvent, GoFishState, Side } from './goFish.ts'
import { chooseMove } from './goFish.ts'

export interface StateBlockContext {
  /** Wrapper tag. Empty means the lines go in bare. */
  tag?: string
  /** Add the line naming a sharp and a careless ask. The model still never chooses. */
  seedMove?: boolean
}

export function buildStateBlock(state: GoFishState, ctx: StateBlockContext = {}): string {
  // Which game this is comes from the block, so the prompt stack does not have to name one.
  const lines: string[] = ['You are playing Go Fish.']
  const hand = sortHand(state.hands.char).map((c) => c.rank)
  lines.push(`Your hand: ${hand.length ? hand.join(', ') : 'empty'}`)
  lines.push(`Your books: ${state.books.char.length ? state.books.char.join(', ') : 'none'}`)
  lines.push(`Their books: ${state.books.player.length ? state.books.player.join(', ') : 'none'}`)
  lines.push(`Cards left in the deck: ${state.deck.length}`)
  lines.push(state.over ? 'The game is over.' : state.turn === 'char' ? 'Your turn.' : 'Their turn.')

  if (ctx.seedMove && !state.over) {
    const best = chooseMove(state, 'char', 'best')
    const worst = chooseMove(state, 'char', 'worst')
    if (best && worst && best !== worst) lines.push(`A good ask would be ${best}. A poor ask would be ${worst}.`)
  }

  const body = lines.join('\n')
  const tag = (ctx.tag ?? 'gameState').trim()
  if (!tag) return body
  return `<${tag}>\n${body}\n</${tag}>`
}

/**
 * One or two sentences covering the events of a single move, in the second person.
 *
 * `you` picks whose side the sentences are written from: the character, which is what the prompt
 * sends, or the player, which is what the log on the board shows. A card the reader cannot see is
 * never named.
 */
export function describeEvent(events: GoFishEvent[], you: Side = 'char'): string {
  const sentences: string[] = []
  const mine = (side: Side) => side === you
  for (const event of events) {
    switch (event.kind) {
      case 'ask':
        sentences.push(
          mine(event.by)
            ? `You asked them for ${rankPlural(event.rank)}.`
            : `They asked you for ${rankPlural(event.rank)}.`,
        )
        break
      case 'give':
        sentences.push(
          mine(event.to)
            ? `They handed you ${event.count} ${rankPlural(event.rank)}.`
            : `You handed them ${event.count} ${rankPlural(event.rank)}.`,
        )
        break
      case 'draw':
        // The other side's draw is face down, so its rank stays out of the line.
        sentences.push(mine(event.by) ? `You drew a ${event.rank}.` : 'They drew from the deck.')
        break
      case 'book':
        sentences.push(
          mine(event.by)
            ? `You completed a book of ${rankPlural(event.rank)}.`
            : `They completed a book of ${rankPlural(event.rank)}.`,
        )
        break
      case 'turn':
        sentences.push(mine(event.to) ? 'It is your turn.' : 'It is their turn.')
        break
      case 'end':
        sentences.push('The game is over.')
        break
      case 'say':
        break
    }
  }
  return sentences.join(' ')
}
