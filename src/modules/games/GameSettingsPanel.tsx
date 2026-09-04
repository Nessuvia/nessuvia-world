import type { MoveQuality } from '../../core/games/goFish'
import { gameLabels } from '../../core/games/gameEvent'
import { useSettings } from '../../core/stores/settingsStore'
import { useGames } from './gamesStore'

/**
 * The rail for an open game, mirroring the chat's takeover.
 *
 * Deliberately thin. The knobs the plan lists (wait for the reply, notable events only, difficulty)
 * are all later phases, and a control that writes nowhere is worse than no control. Generation
 * settings stay in Settings for now: pointing them at a game would need the fields on the Game
 * record, which is the same per-record upgrade path chats already have.
 */
export default function GameSettingsPanel() {
  const { game, state, abandon, boardScale, setBoardScale, logWidth, setLogWidth } = useGames()
  // A user setting rather than a per-game one: this is how you like to play, not a property of
  // this game. Per-game is the upgrade path, the same one chats have.
  const chatBack = useSettings((s) => s.gameChatBack)
  const setChatBack = useSettings((s) => s.setGameChatBack)
  const chatBackReply = useSettings((s) => s.gameChatBackReply)
  const setChatBackReply = useSettings((s) => s.setGameChatBackReply)
  const soundOff = useSettings((s) => s.gameSoundOff)
  const setSoundOff = useSettings((s) => s.setGameSoundOff)
  // Difficulty is per game, not a user setting: it is a property of this match, and changing it
  // halfway through a game you are losing should not rewrite the ones you already played.
  const setDifficulty = useGames((s) => s.setDifficulty)
  if (!game) return null

  return (
    <div className="gamesRail">
      <p className="gamesRailRow">
        {gameLabels[game.kind]} with {game.characterName}
      </p>

      {/* Blackjack's dealer draws to 17 and has nothing to decide, so there is no skill to set. */}
      {game.kind === 'goFish' && (
        <label className="gamesRailField">
          <span className="gamesRailRow">Difficulty</span>
          <select
            className="gamesRailSelect"
            value={game.difficulty ?? 'average'}
            onChange={(e) => void setDifficulty(e.target.value as MoveQuality)}
          >
            <option value="worst">Careless</option>
            <option value="average">Average</option>
            <option value="best">Sharp</option>
          </select>
        </label>
      )}

      <label className="gamesRailCheck">
        <input type="checkbox" checked={chatBack} onChange={(e) => setChatBack(e.target.checked)} />
        <span className="gamesRailRow">Respond to the character's turn</span>
      </label>
      <p className="gamesRailRow">
        Text that is not a move is kept as something you said. The board does not change.
      </p>

      {chatBack && (
        <label className="gamesRailCheck">
          <input type="checkbox" checked={chatBackReply} onChange={(e) => setChatBackReply(e.target.checked)} />
          <span className="gamesRailRow">Answer it straight away</span>
        </label>
      )}

      <label className="gamesRailCheck">
        <input type="checkbox" checked={!soundOff} onChange={(e) => setSoundOff(!e.target.checked)} />
        <span className="gamesRailRow">Sound</span>
      </label>

      <label className="gamesRailField">
        <span className="gamesRailRow">Board size {boardScale.toFixed(1)}x</span>
        <input
          className="gamesRailSlider"
          type="range"
          min={1}
          max={4}
          step={0.1}
          value={boardScale}
          onChange={(e) => setBoardScale(Number(e.target.value))}
        />
      </label>

      <label className="gamesRailField">
        <span className="gamesRailRow">Log width {logWidth}px</span>
        <input
          className="gamesRailSlider"
          type="range"
          min={220}
          max={720}
          step={10}
          value={logWidth}
          onChange={(e) => setLogWidth(Number(e.target.value))}
        />
      </label>

      <p className="gamesRailRow">
        {'books' in state
          ? `Books ${state.books.player.length} - ${state.books.char.length}`
          : `Rounds ${state.score.player} - ${state.score.char}`}
      </p>
      <p className="gamesRailRow">Cards left {state.deck.length}</p>
      {game.status === 'playing' && (
        <button type="button" className="gamesRailButton" onClick={() => void abandon()}>
          Abandon game
        </button>
      )}
    </div>
  )
}
