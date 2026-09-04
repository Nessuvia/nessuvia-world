import { useRef, useState, type CSSProperties } from 'react'
import { Avatar } from '../../app/Avatar'
import type { AvatarSource } from '../../core/storage/types'
import type { BlackjackState } from '../../core/games/blackjack'
import { handValue, isBust, legalActions, winner } from '../../core/games/blackjack'
import { Card } from './Card'
import { useCardMotion } from './useCardMotion'
import { useStickToBottom } from './useStickToBottom'

/**
 * The Blackjack table. Same column as Go Fish, and the same shared `cardTable*` chrome: the
 * character deals from the top, you play at the bottom, and the shoe sits between you.
 *
 * Hit and Stand are buttons as well as words. Blackjack has exactly two moves and making someone
 * type them every round would be a worse game, but the box stays because the character is the
 * point and talking to them is half of it.
 */
export default function BlackjackBoard({
  state,
  scale = 1,
  character,
  characterName,
  persona,
  personaName,
  line,
  streaming,
  chatBack = false,
  error,
  notice,
  readOnly = false,
  onSubmit,
}: {
  state: BlackjackState
  scale?: number
  character: AvatarSource | undefined
  characterName: string
  persona: AvatarSource | undefined
  personaName: string
  line: string
  streaming: boolean
  chatBack?: boolean
  error?: string
  notice?: string
  readOnly?: boolean
  onSubmit?: (text: string) => void
}) {
  const [text, setText] = useState('')
  const actions = legalActions(state)
  const canAct = !readOnly && !streaming && actions.length > 0
  // With chat back on the box stays live between rounds: what you type there is speech, not a move.
  const locked = readOnly || streaming || (!canAct && !chatBack)

  const table = useRef<HTMLDivElement>(null)
  const before = useRef<BlackjackState | null>(null)
  const previous = before.current
  // Every card on this table comes off the shoe, so the origin never has to be worked out.
  const origin = previous && previous.deck.length > state.deck.length ? 'deck' : null
  before.current = state
  useCardMotion(table, origin, state, !readOnly)

  const lineRef = useStickToBottom(line)

  const send = () => {
    if (locked || !text.trim() || !onSubmit) return
    onSubmit(text)
    setText('')
  }

  const dealerCount = state.holeDown ? handValue(state.hands.char.slice(0, 1)).total : handValue(state.hands.char).total
  const playerHand = handValue(state.hands.player)

  return (
    <div className="cardTableBoard" ref={table} style={{ '--cardTableScale': scale } as CSSProperties}>
      <div className="cardTableSpeakerRow">
        <Avatar
          of={character}
          name={characterName}
          className={`avatar cardTableAvatar${state.turn === 'char' && !state.over ? ' cardTableAvatarActive' : ''}`}
          title={characterName}
        />
        <p className="cardTableLine" ref={lineRef}>
          {line || (streaming ? '…' : '')}
        </p>
      </div>

      <div className="cardTableField">
        <div className="cardTableHandRow" data-zone="charHand">
          {state.hands.char.map((card, i) =>
            // The hole card is face down until the dealer plays, so its rank is not in the DOM.
            state.holeDown && i === 1 ? (
              <Card key="hole" id="hole" faceDown />
            ) : (
              <Card key={`${card.rank}${card.suit}`} id={`${card.rank}${card.suit}`} card={card} />
            ),
          )}
        </div>
        <p className="blackjackCount">
          {state.hands.char.length > 0 && `${characterName}: ${dealerCount}${state.holeDown ? ' showing' : ''}`}
        </p>

        <div className="blackjackShoe">
          <span className="cardTableDeck" data-zone="deck">
            <Card faceDown id="shoeTop" />
            <span className="cardTableDeckCount">{state.deck.length}</span>
          </span>
          <span className="cardTableDeckCount">
            Rounds {state.score.player} - {state.score.char}
          </span>
        </div>

        <p className="blackjackCount">
          {state.hands.player.length > 0 &&
            `You: ${playerHand.soft ? 'soft ' : ''}${playerHand.total}${isBust(state.hands.player) ? ' — bust' : ''}`}
        </p>
        <div className="cardTableHandRow" data-zone="playerHand">
          {state.hands.player.map((card) => (
            <Card key={`${card.rank}${card.suit}`} id={`${card.rank}${card.suit}`} card={card} />
          ))}
        </div>

        {canAct && (
          <div className="blackjackActions">
            <button type="button" className="blackjackButton" onClick={() => onSubmit?.('hit')}>
              Hit
            </button>
            <button type="button" className="blackjackButton" onClick={() => onSubmit?.('stand')}>
              Stand
            </button>
          </div>
        )}
      </div>

      <div className="cardTableSpeakerRow cardTableSpeakerRowPlayer">
        {readOnly ? (
          <span className="cardTableInputStandIn" />
        ) : state.over ? (
          <p className="cardTableResult">
            {winner(state) === 'player'
              ? 'You win the shoe.'
              : winner(state) === 'char'
                ? `${characterName} wins the shoe.`
                : 'A tie.'}
          </p>
        ) : (
          <input
            className="cardTableInput"
            value={text}
            disabled={locked}
            placeholder={locked ? 'Waiting…' : canAct ? 'hit or stand' : 'say something'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send()
            }}
          />
        )}
        <Avatar
          of={persona}
          name={personaName}
          className={`avatar cardTableAvatar${state.turn === 'player' && !state.over ? ' cardTableAvatarActive' : ''}`}
          title={personaName}
        />
      </div>

      <div className="cardTableFooter">
        {notice ? <p className="cardTableNotice">{notice}</p> : null}
        {error ? <p className="cardTableError">{error}</p> : null}
      </div>
    </div>
  )
}
