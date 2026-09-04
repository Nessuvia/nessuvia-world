import type { AvatarSource } from '../../core/storage/types'
import type { GameKind } from '../../core/games/gameEvent'
import type { GoFishState } from '../../core/games/goFish'
import type { BlackjackState } from '../../core/games/blackjack'
import type { AnyGameState } from './gamesStore'
import GoFishBoard from './GoFishBoard'
import BlackjackBoard from './BlackjackBoard'

/** Everything a board needs that is not the board's own state. Both boards take exactly this. */
export interface BoardProps {
  scale?: number
  character: AvatarSource | undefined
  characterName: string
  persona: AvatarSource | undefined
  personaName: string
  /** The character's latest line, or what is streaming right now. */
  line: string
  streaming: boolean
  chatBack?: boolean
  error?: string
  notice?: string
  readOnly?: boolean
  onSubmit?: (text: string) => void
}

/**
 * Picks the board for a game. The cast is the same one the store's rules table makes: `kind` is
 * what decides which game a record is, and it is the only thing that can.
 */
export default function GameBoard({ kind, state, ...rest }: BoardProps & { kind: GameKind; state: AnyGameState }) {
  return kind === 'goFish' ? (
    <GoFishBoard state={state as GoFishState} {...rest} />
  ) : (
    <BlackjackBoard state={state as BlackjackState} {...rest} />
  )
}
