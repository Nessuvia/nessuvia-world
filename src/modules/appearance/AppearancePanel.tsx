import type { MarkerKind } from '../../core/stores/settingsStore'
import { lockedHint, usePaletteEditor } from '../../core/stores/palettesStore'
// Rendered in the Settings tab and in the chat rail's Visual Options, so it carries its own styles.
import ColorStack from '../../app/ColorStack'
import WebfontPicker from './WebfontPicker'
import './appearance.css'

// A short list rather than a free-text box: a font the browser doesn't have renders as a silent
// fallback, which is worse than not offering it.
export const fonts: [string, string][] = [
  ['', 'App default'],
  ['Georgia, serif', 'Serif'],
  ['system-ui, sans-serif', 'Sans'],
  ['ui-monospace, monospace', 'Mono'],
]

// The color field each marker kind edits.
export const colorField: Record<MarkerKind, 'emphasisColor' | 'boldColor' | 'quoteColor'> = {
  emphasis: 'emphasisColor',
  bold: 'boldColor',
  quotes: 'quoteColor',
}

/** Font, size and the chat marker colors, all read from and written to the active palette.
 *  `colors` off drops the chat color list, leaving the font and size — the Story rail has its own
 *  colors and the chat's do nothing there. `heading` off is for the palette editor, where the
 *  collapsible container already names the section. `font` off drops the webfont picker (and its
 *  Fontsource credit) — the chat/write rails keep the quick settings light, font choice lives in the
 *  main appearance editor. */
export default function AppearancePanel({
  colors = true,
  heading = true,
  font = true,
}: {
  colors?: boolean
  heading?: boolean
  /** `'compact'` is the chat rail's font row: the four stacks, or the webfont search list alone
   *  when the palette names a webfont. */
  font?: boolean | 'compact'
}) {
  const { palette, locked, patch } = usePaletteEditor()

  return (
    <section className="appearance">
      {heading && <h3>Text</h3>}
      {locked && <p className="hint">{lockedHint}</p>}
      {font && (
        <WebfontPicker
          palette={palette}
          locked={locked}
          patch={patch}
          fonts={fonts}
          compact={font === 'compact'}
        />
      )}

      <label className="appearanceRow">
        <span>Size</span>
        <input
          type="number"
          min={10}
          max={32}
          value={palette.fontSize}
          disabled={locked}
          onChange={(e) => patch({ fontSize: Number(e.target.value) })}
        />
        px
      </label>

      <label className="appearanceRow">
        <span>Line height</span>
        <input
          type="number"
          min={1}
          max={3}
          step={0.05}
          value={palette.lineHeight}
          disabled={locked}
          onChange={(e) => patch({ lineHeight: Number(e.target.value) })}
        />
      </label>

      {colors && (
        <>
          <ColorStack
            order={palette.colorOrder}
            colorOf={(kind) => palette[colorField[kind]]}
            textColor={palette.textColor}
            onOrder={(colorOrder) => patch({ colorOrder })}
            onColor={(kind, color) => patch({ [colorField[kind]]: color })}
            onTextColor={(textColor) => patch({ textColor })}
          />
          <p className="hint">
            Colors text in double quotes, asterisks and underscores. Where they overlap, the top row
            wins.
          </p>
        </>
      )}

      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={palette.mobileFullWidth}
          disabled={locked}
          onChange={(e) => patch({ mobileFullWidth: e.target.checked })}
        />
        Use max width on mobile
      </label>

      {font === true && (
        <p className="hint webfontCredit">
          Fonts provided by{' '}
          <a href="https://fontsource.org/" target="_blank" rel="noreferrer">
            Fontsource
          </a>
          .
        </p>
      )}
    </section>
  )
}
