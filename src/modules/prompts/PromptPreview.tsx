import { useEffect, useState } from 'react'
import type { Message, PromptStack, WorldInfoEntry } from '../../core/storage/types'
import { buildPrompt } from '../../core/prompt/buildPrompt'
import { buildStoryPrompt } from '../../core/prompt/buildStoryPrompt'
import { worldInfoText } from '../../core/prompt/worldInfo'
import { useWorldInfo } from '../../core/stores/worldInfoStore'
import { countTokens, loadTokenizer, perMessageOverhead } from '../../core/prompt/budget'
import { useCharacters } from '../../core/stores/charactersStore'
import { usePersonas } from '../../core/stores/personasStore'
import { useSettings, type Connection } from '../../core/stores/settingsStore'
import { CollapseButton, CollapseRail } from '../../app/CollapseButton'
import { budgetOf, maxTokensOf } from '../../core/params/connectionParams'

const defaultUserLine = 'Hello there.'

// Example inputs for the Story-stack preview — never persisted, editable, reset on reload.
const exampleStory = 'The tavern had emptied hours ago. Nessu wiped the last glass and set it down.'
const exampleDirection = 'Write a short paragraph continuing the scene.'
const exampleCast = 'Name: Nessuvia\nNessu is the Development Team Lead.'
const exampleGuide =
  'Chapter 1 — Closing Time [writing now]\n  Nessu shuts the tavern.\n  Beats:\n    · the last glass\nChapter 2 — The Letter [not yet written]\n  A letter arrives with no name on it.'

export default function PromptPreview({
  stack,
  collapsed,
  onToggleCollapsed,
}: {
  stack: PromptStack
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    loadTokenizer().then(() => setReady(true))
  }, [])

  if (collapsed) {
    return <CollapseRail label="Preview" onToggle={onToggleCollapsed} />
  }

  const header = (
    <div className="zoneHeader">
      <CollapseButton label="Preview" collapsed={false} onToggle={onToggleCollapsed} />
      <h3>Preview</h3>
    </div>
  )

  return (stack.kind ?? 'chat') === 'story' ? (
    <StoryPreview stack={stack} header={header} ready={ready} />
  ) : (
    <ChatPreview stack={stack} header={header} ready={ready} />
  )
}

function budgetFor(connection?: Connection) {
  return connection
    ? {
        contextLimit: connection.contextLimit,
        maxTokens: maxTokensOf(connection),
        safetyMarginPct: connection.safetyMarginPct,
      }
    : undefined
}

// A Story stack has no character and no chat history: the Co-Writer takes a Story-context blob and
// a Direction, so the preview mirrors that — example prose + an example Direction, nothing else.
function StoryPreview({ stack, header, ready }: { stack: PromptStack; header: React.ReactNode; ready: boolean }) {
  const connection = useSettings((s) => s.connections.find((c) => c.id === s.activeConnectionId))
  const [storyText, setStoryText] = useState(exampleStory)
  const [direction, setDirection] = useState(exampleDirection)

  const built = buildStoryPrompt(
    { stack, castText: exampleCast, authorNote: '', chapterGuide: exampleGuide, storyText, direction },
    budgetFor(connection),
  )

  return (
    <section className="panel stackZone preview">
      {header}

      <div className="previewExamples">
        <label>
          Example Story context
          <textarea rows={3} value={storyText} onChange={(e) => setStoryText(e.target.value)} />
        </label>
        <label>
          Example Direction
          <textarea rows={2} value={direction} onChange={(e) => setDirection(e.target.value)} />
        </label>
      </div>

      {!connection && <p className="hint">No active connection — token limits unknown.</p>}
      {!ready && <p className="hint">Loading tokenizer…</p>}

      {built.droppedChars > 0 && (
        <p className="hint">
          {built.droppedChars} characters of older Story prose would be dropped to fit the budget.
        </p>
      )}

      <div className="previewList">
        {built.messages.map((m, i) => (
          <div className="previewMessage" key={i}>
            <div className="previewMessageHeader">
              <span className="blockRole">{m.role}</span>
              <span className="hint">{countTokens(m.content) + perMessageOverhead} tokens</span>
            </div>
            <pre>{m.content}</pre>
          </div>
        ))}
        {built.messages.length === 0 && <p className="placeholder">Nothing to send.</p>}
      </div>
    </section>
  )
}

function ChatPreview({ stack, header, ready }: { stack: PromptStack; header: React.ReactNode; ready: boolean }) {
  const { characters, load } = useCharacters()
  const connection = useSettings((s) => s.connections.find((c) => c.id === s.activeConnectionId))
  const personas = usePersonas((s) => s.personas)
  const ensurePersona = usePersonas((s) => s.ensureActive)
  const activePersonaId = useSettings((s) => s.activePersonaId)

  const [characterId, setCharacterId] = useState<number | null>(null)
  const [charLine, setCharLine] = useState<string | null>(null)
  const [userLine, setUserLine] = useState(defaultUserLine)
  const [entries, setEntries] = useState<WorldInfoEntry[]>([])

  useEffect(() => {
    load()
    ensurePersona()
  }, [load, ensurePersona])

  const character = characters.find((c) => c.id === characterId) ?? characters[0]
  const previewedId = character?.id ?? null

  useEffect(() => {
    if (!previewedId) return setEntries([])
    useWorldInfo.getState().fetchFor(previewedId).then(setEntries)
  }, [previewedId])

  const persona = personas.find((p) => p.id === activePersonaId) ?? personas[0]

  // example lines only, never persisted — reload resets them.
  const history: Message[] = [
    {
      ownerId: 'local',
      chatId: 0,
      role: 'assistant',
      content: charLine ?? character?.firstMessage ?? 'Hello yourself.',
      createdAt: 1,
    },
    { ownerId: 'local', chatId: 0, role: 'user', content: userLine, createdAt: 2 },
  ]

  if (!character || !persona) {
    return (
      <section className="panel stackZone">
        {header}
        <p className="hint">Add a character to preview the assembled prompt.</p>
      </section>
    )
  }

  // The same call the send path makes — the preview can't drift from what gets sent. Counts and
  // warnings read from this one, so indentation never touches the numbers.
  // Matched against the example lines above, so a key typed into the user line shows its entry
  // appearing in the preview.
  const worldInfo = worldInfoText(entries, history, character.worldBook)

  const built = buildPrompt({ stack, character, persona, messages: history, worldInfo }, budgetOf(connection))
  // A second, display-only pass with nested content indented. Same inputs, so its messages line up
  // 1:1 with `built` (indentation doesn't change role boundaries), and the <pre> shows this text.
  const display = buildPrompt(
    { stack, character, persona, messages: history, worldInfo, indent: true },
    budgetOf(connection),
  )

  return (
    <section className="panel stackZone preview">
      {header}

      <select
        value={character.id}
        onChange={(e) => {
          setCharacterId(Number(e.target.value))
          setCharLine(null)
        }}
        aria-label="Preview character"
      >
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div className="previewExamples">
        <label>
          Example first message
          <textarea
            rows={2}
            value={charLine ?? character.firstMessage ?? ''}
            onChange={(e) => setCharLine(e.target.value)}
          />
        </label>
        <label>
          Example user reply
          <textarea rows={2} value={userLine} onChange={(e) => setUserLine(e.target.value)} />
        </label>
      </div>

      {!connection && <p className="hint">No active connection — token limits unknown.</p>}
      {!ready && <p className="hint">Loading tokenizer…</p>}

      {built.overflow && (
        <p className="error">
          The context limit can't fit the fixed blocks plus the reply reserve. No history is being
          sent — raise contextLimit or lower maxTokens.
        </p>
      )}

      {built.droppedCount > 0 && !built.overflow && (
        <p className="hint">
          {built.droppedCount} older history message{built.droppedCount === 1 ? '' : 's'} would be
          dropped.
        </p>
      )}

      <div className="previewList">
        {built.messages.map((m, i) => (
          <div className="previewMessage" key={i}>
            <div className="previewMessageHeader">
              <span className="blockRole">{m.role}</span>
              <span className="hint">{countTokens(m.content) + perMessageOverhead} tokens</span>
            </div>
            <pre>{display.messages[i]?.content ?? m.content}</pre>
          </div>
        ))}
        {built.messages.length === 0 && <p className="placeholder">Nothing to send.</p>}
      </div>
    </section>
  )
}
