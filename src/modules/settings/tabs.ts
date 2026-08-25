// Its own file so the module's index can register the tab list without pulling in the view, which
// is lazily loaded.
export const tabs = [
  ['connections', 'Connections'],
  ['textRules', 'Text Rules'],
  ['relay', 'Multiplayer'],
  ['debug', 'Miscellaneous'],
] as const
