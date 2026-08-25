// Body Map widget — data model. Phase 1: one generic-male figure, front + back.
// See src/resources/body-map-widget-plan.md for the locked design decisions.

export type BodyView = 'front' | 'back'

/** A clickable region of the figure. Front and back regions are distinct parts with independent
 *  state, so `partId` is unique across both views (e.g. `left_shoulder_front`). */
export interface Region {
  partId: string
  name: string // display name, also substituted for {{part}}
  view: BodyView
  /** Points in image-space coordinates (natural pixels), [x, y] pairs. */
  polygon?: [number, number][]
}

export interface BodyMap {
  id: string
  name: string
  /** Base figure images as data URLs, one per view. */
  images: Record<BodyView, string>
  regions: Region[]
  /** Actions bundled with this map; the runtime menu offers these plus a Type entry. */
  actions: ActionDef[]
}

/** A reusable, definable action. `descriptionTemplate` is the text sent to the LLM and supports
 *  {{user}}, {{char}}, {{part}}. */
export interface ActionDef {
  id: string
  state: string // short label shown in the menu and used in output
  descriptionTemplate: string
  category?: string
  bundled?: boolean // true = shipped default, false/undefined = user-created
}

/** An action currently attached to a part. Either references an ActionDef by id, or is an inline
 *  one-off entered via Type. `resolvedDescription` holds the template with {{...}} already
 *  substituted at apply time, so output never depends on live context drifting. */
export interface AppliedAction {
  actionDefId?: string // set when applied from a defined ActionDef
  state: string
  resolvedDescription: string
}

export type SendMode = 'persistent' | 'immediate'

/** Everything currently set on a body, plus the tracker's on/off and send mode. One saved
 *  TrackerState per chat (see Section 6). */
export interface TrackerState {
  parts: Record<string, AppliedAction[]> // partId -> actions
  enabled: boolean
  sendMode: SendMode
  /** Wrapper tag name for the output block; default 'bodyState'. Empty emits the lines bare. */
  tag: string
  /** Which saved map (bodyMaps row) this chat uses. Undefined falls back to the bundled figure. */
  mapRowId?: number
}

/** Template variables the host supplies. The plugin runs in a 1-on-1 chat, so user/char are
 *  always known; extra vars are allowed and substituted the same way. */
export interface HostContext {
  user: string
  char: string
  [key: string]: string
}

export function emptyTracker(): TrackerState {
  // Off by default: a chat only gets a body map when you turn one on in the panel.
  return { parts: {}, enabled: false, sendMode: 'persistent', tag: 'bodyState' }
}
