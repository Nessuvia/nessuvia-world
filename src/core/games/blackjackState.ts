// What the model is told about a Blackjack table. Same shape as gameState.ts does for Go Fish: a
// tagged block of board state, then one plain line about what just happened, written from the
// character's side. The character deals, so they see both hands, their own hole card included.

import type { BlackjackEvent, BlackjackState, Side } from './blackjack.ts'
import { handValue, isBlackjack } from './blackjack.ts'

export interface StateBlockContext {
  tag?: string
}

function readHand(state: BlackjackState, side: Side): string {
  const cards = state.hands[side]
  if (cards.length === 0) return 'nothing yet'
  const { total, soft } = handValue(cards)
  const natural = isBlackjack(cards) ? ', blackjack' : ''
  return `${cards.map((c) => c.rank).join(', ')} (${soft ? 'soft ' : ''}${total}${natural})`
}

export function buildStateBlock(state: BlackjackState, ctx: StateBlockContext = {}): string {
  const lines: string[] = ['You are dealing Blackjack.']
  lines.push(`Your hand: ${readHand(state, 'char')}`)
  if (state.holeDown && state.hands.char.length > 1) lines.push('Your second card is still face down.')
  lines.push(`Their hand: ${readHand(state, 'player')}`)
  lines.push(`Rounds won: you ${state.score.char}, them ${state.score.player}`)
  lines.push(`Cards left in the shoe: ${state.deck.length}`)
  lines.push(
    state.over
      ? 'The shoe is finished.'
      : state.turn === 'player'
        ? 'Waiting on them to hit or stand.'
        : state.turn === 'char'
          ? 'Your play.'
          : 'Between rounds.',
  )

  const body = lines.join('\n')
  const tag = (ctx.tag ?? 'gameState').trim()
  if (!tag) return body
  return `<${tag}>\n${body}\n</${tag}>`
}

/**
 * The events of one move in the second person. `you` picks whose side it reads from: the character
 * for the prompt, the player for the log on the board.
 */
export function describeEvent(events: BlackjackEvent[], you: Side = 'char'): string {
  const sentences: string[] = []
  const mine = (side: Side) => side === you
  for (const event of events) {
    switch (event.kind) {
      case 'deal':
        sentences.push(you === 'char' ? 'You dealt a new round.' : 'They dealt a new round.')
        break
      case 'hit':
        sentences.push(mine(event.by) ? `You drew a ${event.rank}.` : `They drew a ${event.rank}.`)
        break
      case 'stand':
        sentences.push(mine(event.by) ? 'You stood.' : 'They stood.')
        break
      case 'bust':
        sentences.push(mine(event.by) ? 'You went bust.' : 'They went bust.')
        break
      case 'reveal':
        sentences.push(you === 'char' ? 'You turned your hole card over.' : 'They turned the hole card over.')
        break
      case 'settle':
        sentences.push(
          event.outcome === 'push'
            ? 'The round pushed.'
            : mine(event.outcome)
              ? 'You took the round.'
              : 'They took the round.',
        )
        break
      case 'end':
        sentences.push('The shoe is finished.')
        break
      case 'say':
        break
    }
  }
  return sentences.join(' ')
}
