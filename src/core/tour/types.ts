/** One highlighted element and the text beside it. */
export interface Step {
  /** CSS selector for the element to point at. Empty means a centred step with no target. */
  target: string
  /** Forced side for the text box. Unset means the side with the most room wins. */
  side?: 'left' | 'right' | 'top' | 'bottom'
  /** Limits the step to one layout. Unset means it runs on both. */
  only?: 'desktop' | 'mobile'
  /** Paragraphs, split on blank lines. Rendered as text nodes, never as markup. */
  body: string[]
}

export interface Tour {
  /** Matches the module id, which is how a route finds its tour. */
  id: string
  /** Display name, from the `#` line. Shown on the help button and the first-run offer. */
  name: string
  steps: Step[]
}
