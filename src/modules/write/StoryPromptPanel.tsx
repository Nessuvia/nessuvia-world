import { useEffect, useState } from 'react'
import { buildRequestBody, redact } from '../../core/connectors/buildRequestBody'
import { buildStoryPrompt, castText, fitChapterGuide } from '../../core/prompt/buildStoryPrompt'
import { storyProseSplit } from '../../core/prompt/chapterGuide'
import { loadTokenizer } from '../../core/prompt/budget'
import { useCharacters } from '../../core/stores/charactersStore'
import { usePersonas } from '../../core/stores/personasStore'
import { useSettings } from '../../core/stores/settingsStore'
import { useStacks } from '../../core/stores/stacksStore'
import { resolveCast, useWrite } from '../../core/stores/writeStore'
import PromptPreviewPanel from '../../app/PromptPreviewPanel'
import { paramDefList } from '../../core/stores/paramDefsStore'
import { maxTokensOf } from '../../core/params/connectionParams'
import { resolveParams } from '../../core/settings/resolveParams'

/**
 * What the next Direct would send, rendered in the Story settings panel. It calls
 * `buildStoryPrompt` and `buildRequestBody` — the same two functions `generate` calls — so what it
 * shows and what goes over the wire can't diverge.
 *
 * The prose comes from the saved Chapter, which the editor writes 800ms after the last keystroke,
 * so the preview trails typing by about that long.
 */
export default function StoryPromptPanel() {
  const story = useWrite((s) => s.story)
  const chapters = useWrite((s) => s.chapters)
  const activeChapterId = useWrite((s) => s.activeChapterId)
  const caret = useWrite((s) => s.caret)
  const direction = useWrite((s) => (story?.id != null ? (s.directions[story.id] ?? '') : ''))
  const baseConnection = useSettings((s) => s.connections.find((c) => c.id === s.activeConnectionId))
  const activeStoryStackId = useSettings((s) => s.activeStoryStackId)
  const stack = useStacks((s) => s.stacks.find((x) => x.id === activeStoryStackId))
  // Subscribed to only so an edit to a cast member's card re-renders the preview.
  useCharacters((s) => s.characters)
  usePersonas((s) => s.personas)

  const [ready, setReady] = useState(false)
  const [typed, setTyped] = useState(direction)

  useEffect(() => {
    loadTokenizer().then(() => setReady(true))
  }, [])

  // Token counting on every keystroke in the Direction box is the one thing here that could feel
  // slow.
  useEffect(() => {
    const timer = setTimeout(() => setTyped(direction), 200)
    return () => clearTimeout(timer)
  }, [direction])

  if (!story || chapters.length === 0) return null
  if (!stack) return <p className="hint">No Story stack yet. It is created on the first Direct.</p>

  // Same fallback generate() uses: no cursor yet means the last Chapter.
  const active = chapters.find((c) => c.id === activeChapterId) ?? chapters.at(-1)

  // The same story > connection resolution generate() does, so the budget shown is the real one.
  const connection = baseConnection && resolveParams(baseConnection, undefined, story)

  // Split at the caret the same way generate() does, so the preview shows the "What follows" block
  // the next Direct would actually send. The prose here is the saved text, so it trails typing.
  const split = storyProseSplit(
    chapters,
    active?.id ?? null,
    caret && caret.chapterId === active?.id ? caret.offset : undefined,
  )

  const budget = connection
    ? {
        contextLimit: connection.contextLimit,
        maxTokens: maxTokensOf(connection),
        safetyMarginPct: connection.safetyMarginPct,
      }
    : undefined

  const built = buildStoryPrompt(
    {
      stack,
      castText: castText(resolveCast(story.cast)),
      authorNote: story.authorNote,
      chapterGuide: fitChapterGuide(chapters, active?.id ?? null, budget),
      storyText: split.text,
      storyTrailing: split.trailing,
      direction: typed,
    },
    budget,
  )

  let body: string | undefined
  let bodyError = ''
  if (connection) {
    try {
      body = JSON.stringify(redact(buildRequestBody(built.messages, connection, paramDefList()), connection))
    } catch (err) {
      bodyError = (err as Error).message
    }
  }

  const margin = connection
    ? Math.floor((connection.contextLimit * connection.safetyMarginPct) / 100)
    : 0

  return (
    <PromptPreviewPanel
      messages={built.messages}
      json={body}
      jsonError={bodyError}
      notes={
        <>
          {!connection && <p className="hint">No active connection. Token limits are unknown.</p>}
          {!ready && <p className="hint">Loading tokenizer…</p>}

          {connection && (
            <p className="hint">
              {built.fixedTokens + built.storyTokens} of {connection.contextLimit} tokens. Fixed
              blocks {built.fixedTokens}, Story prose {built.storyTokens}, reply reserve{' '}
              {maxTokensOf(connection)}, safety margin {connection.safetyMarginPct}% ({margin}).
            </p>
          )}

          {built.droppedChars > 0 && (
            <p className="hint">
              {built.droppedChars} characters of older Story prose are dropped to fit the budget.
            </p>
          )}
        </>
      }
    />
  )
}
