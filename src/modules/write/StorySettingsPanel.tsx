import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSettings, type MarkerKind } from '../../core/stores/settingsStore'
import { lockedHint, usePaletteEditor } from '../../core/stores/palettesStore'
import ColorStack from '../../app/ColorStack'
import { useStacks } from '../../core/stores/stacksStore'
import { useWrite } from '../../core/stores/writeStore'
import AppearancePanel from '../appearance/AppearancePanel'
import PromptToggles from '../prompts/PromptToggles'
import ParamEditor from '../characters/ParamEditor'
import StoryPromptPanel from './StoryPromptPanel'
import FindReplace from './FindReplace'

// The Story color field each marker kind edits — the Write-mode twin of AppearancePanel's table.
const storyColorField: Record<MarkerKind, 'storyEmphasisColor' | 'storyBoldColor' | 'storyQuoteColor'> = {
  emphasis: 'storyEmphasisColor',
  bold: 'storyBoldColor',
  quotes: 'storyQuoteColor',
}

/**
 * The open Story's settings, rendered in the app nav rail — mirroring how the chat settings panel
 * takes the rail over while a chat is open. Global controls the chat side also has: connection, the
 * active Story stack and its toggles, appearance. Story-exclusive controls (Direction, cast,
 * chapters) live in the Story's own right sidebar, not here.
 */
export default function StorySettingsPanel() {
  const connections = useSettings((s) => s.connections)
  const activeConnectionId = useSettings((s) => s.activeConnectionId)
  const setActiveConnection = useSettings((s) => s.setActiveConnection)
  const activeStoryStackId = useSettings((s) => s.activeStoryStackId)
  const stacks = useStacks((s) => s.stacks)
  const saveStack = useStacks((s) => s.save)
  const loadStacks = useStacks((s) => s.load)
  const { palette, locked, patch } = usePaletteEditor()
  const story = useWrite((s) => s.story)
  const setStoryWidth = useWrite((s) => s.setStoryWidth)
  const setParamOverrides = useWrite((s) => s.setParamOverrides)
  const connection = connections.find((c) => c.id === activeConnectionId)

  useEffect(() => {
    loadStacks()
  }, [loadStacks])

  const storyStacks = stacks.filter((s) => (s.kind ?? 'chat') === 'story')
  const stack = storyStacks.find((s) => s.id === activeStoryStackId)

  return (
    <section className="panel chatSettings screenBody">
      <label className="chatSettingsPick">
        Connection
        <select
          value={activeConnectionId ?? ''}
          onChange={(e) => setActiveConnection(e.target.value || null)}
        >
          {connections.length === 0 && <option value="">No connections</option>}
          {connections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <details>
        <summary>Prompt Stack</summary>
        <label className="chatSettingsPick">
          <select
            value={activeStoryStackId ?? ''}
            onChange={(e) => useSettings.setState({ activeStoryStackId: Number(e.target.value) })}
          >
            {storyStacks.length === 0 && <option value="">Default (created on first use)</option>}
            {storyStacks.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {stack && <PromptToggles stack={stack} onChange={saveStack} />}
        <Link to="/prompts?kind=story" className="editStackLink">
          Edit on the Prompts tab
        </Link>
      </details>

      {/* Per Story, not per Chapter and not global: sampling is a property of the work being
          written. The cast is deliberately not a layer — see Story.paramOverrides. */}
      <details>
        <summary>Parameters</summary>
        {connection ? (
          <>
            <p className="hint">Used for this Story only. An empty field uses the connection's value.</p>
            <ParamEditor
              overrides={story?.paramOverrides ?? {}}
              connection={connection}
              scopeLabel="story"
              onChange={(paramOverrides) => setParamOverrides(paramOverrides)}
            />
          </>
        ) : (
          <p className="hint">Pick an active connection in Settings to set parameters.</p>
        )}
      </details>

      <details>
        <summary>Appearance</summary>
        {/* Per Story, like the chat's width is per chat — the panel is only here while a Story is
            open, so the scope is the Story on screen. The palette's Story width is the default
            every Story that has none of its own uses. */}
        <label className="storyWidth">
          <span>Story width</span>
          <input
            type="range"
            min={20}
            max={100}
            value={story?.storyWidth ?? palette.storyWidth}
            onChange={(e) => setStoryWidth(Number(e.target.value))}
          />
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={story?.storyWidth ?? palette.storyWidth}
            onChange={(e) => setStoryWidth(Number(e.target.value))}
          />
          %
        </label>
        <p className="hint">Overrides the Story width in the palette.</p>
        {/* Font and size only: the chat's colors don't reach a Story, so showing them here would be
            a control that does nothing. */}
        <AppearancePanel colors={false} font={false} />
        {/* Write-only, so these sit here rather than in AppearancePanel, which the chat rail shows
            too. Global like the chat's colors, applied to every Story, and independent of them. */}
        <h3>Story colors</h3>
        {locked && <p className="hint">{lockedHint}</p>}
        <ColorStack
          order={palette.storyColorOrder}
          colorOf={(kind) => palette[storyColorField[kind]]}
          textColor={palette.storyTextColor}
          onOrder={(storyColorOrder) => patch({ storyColorOrder })}
          onColor={(kind, color) => patch({ [storyColorField[kind]]: color })}
          onTextColor={(storyTextColor) => patch({ storyTextColor })}
        />
        <p className="hint">
          Colors Story text in double quotes, asterisks and underscores. Where they overlap, the top
          row wins.
        </p>
      </details>

      <details>
        <summary>Find and Replace</summary>
        <FindReplace />
      </details>

      <details>
        <summary>Prompt preview</summary>
        <StoryPromptPanel />
      </details>
    </section>
  )
}
