// The ONLY place a card-import URL is fetched. Throws with a readable message on any failure so
// the modal can show it directly. Returns the parsed card JSON plus an optional avatar data URL
// (chub cards arrive as PNGs with the image embedded).
export type FetchedCard = { json: unknown; avatar: string }

/** characterhub.org / chub.ai character page → the `creator/slug` fullPath the API wants. */
function chubFullPath(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\./, '')
  if (host !== 'characterhub.org' && host !== 'chub.ai') return null
  const m = u.pathname.match(/^\/characters\/(.+)$/)
  return m ? m[1] : null
}

// chub stores the card under node.definition with its own field names (and the quirk that
// `personality` is the description and `tavern_personality` is the personality). Map it onto a
// v2 card so importCard reads it like any other. Mirrors SillyTavern's downloadChubCharacter.
async function fetchChubCard(fullPath: string): Promise<FetchedCard> {
  let res: Response
  try {
    res = await fetch(`https://api.chub.ai/api/characters/${fullPath}?full=true`, {
      headers: { Accept: 'application/json' },
    })
  } catch {
    throw new Error('Could not reach chub.ai')
  }
  if (!res.ok) throw new Error(`chub.ai request failed: ${res.status}`)
  const node = ((await res.json())?.node ?? {}) as Record<string, unknown>
  const def = (node.definition ?? {}) as Record<string, unknown>
  const json = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: def.name,
      description: def.personality,
      personality: def.tavern_personality,
      scenario: def.scenario,
      first_mes: def.first_message,
      mes_example: def.example_dialogs,
      alternate_greetings: def.alternate_greetings,
      system_prompt: def.system_prompt,
      post_history_instructions: def.post_history_instructions,
      extensions: def.extensions,
    },
  }
  return { json, avatar: String(node.max_res_url ?? node.avatar_url ?? '') }
}

export async function fetchCard(url: string): Promise<FetchedCard> {
  const fullPath = chubFullPath(url)
  if (fullPath) return fetchChubCard(fullPath)

  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new Error('Could not reach that URL')
  }
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  const text = await res.text()
  try {
    return { json: JSON.parse(text), avatar: '' }
  } catch {
    throw new Error('That URL did not return valid JSON')
  }
}
