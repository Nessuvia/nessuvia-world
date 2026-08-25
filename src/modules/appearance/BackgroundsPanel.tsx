import { useEffect, useMemo, useState } from 'react'
import { RiDeleteBinLine, RiUploadLine } from '@remixicon/react'
import {
  backgroundFits,
  backgroundSlots,
  type Background,
  type BackgroundFit,
  type BackgroundSlot,
} from '../../core/palette/palette'
import { sanitizeBackgroundHtml } from '../../core/palette/sanitizeHtml'
import { scopeBackgroundCss } from '../../core/palette/scopeCss'
import { lockedHint, usePaletteEditor } from '../../core/stores/palettesStore'
import { useBackgroundCss } from '../../core/stores/backgroundCssStore'
import { useBackgroundImages } from '../../core/stores/backgroundImagesStore'
import './backgrounds.css'

const slotLabel: Record<BackgroundSlot, string> = {
  all: 'All pages',
  chat: 'Chat',
  write: 'Write',
  prompts: 'Prompts',
}

const fitLabel: Record<BackgroundFit, string> = {
  center: 'Center',
  cover: 'Fill',
  contain: 'Fit',
  stretch: 'Stretch',
  tile: 'Tile',
}

/** How long after the last keystroke the layer picks up the drafts. */
const previewDelay = 250

export default function BackgroundsPanel() {
  const { palette, locked, patch } = usePaletteEditor()
  const images = useBackgroundImages((s) => s.images)
  const loadImages = useBackgroundImages((s) => s.load)
  const removeImage = useBackgroundImages((s) => s.remove)
  const addImage = useBackgroundImages((s) => s.add)
  const setPreview = useBackgroundCss((s) => s.setPreview)
  const clearPreview = useBackgroundCss((s) => s.clearPreview)

  const [slot, setSlot] = useState<BackgroundSlot>('all')
  // The CSS and HTML boxes are the controls here that don't autosave, so they keep their own drafts.
  // The layer previews them live; Apply is what writes them to the palette.
  // Kept per slot so flipping sub-tabs doesn't throw away unapplied text — leaving the Backgrounds
  // tab unmounts this panel, which is what clears them.
  const [drafts, setDrafts] = useState<Record<BackgroundSlot, { css: string; html: string }>>(() =>
    Object.fromEntries(
      backgroundSlots.map((id) => [id, { css: palette.backgrounds[id].css, html: palette.backgrounds[id].html }]),
    ) as Record<BackgroundSlot, { css: string; html: string }>,
  )
  const { css: cssDraft, html: htmlDraft } = drafts[slot]
  const setCssDraft = (css: string) =>
    setDrafts((d) => ({ ...d, [slot]: { ...d[slot], css } }))
  const setHtmlDraft = (html: string) =>
    setDrafts((d) => ({ ...d, [slot]: { ...d[slot], html } }))

  // Checked on every keystroke rather than on Apply: the drafts are already on screen, so the reason
  // nothing rendered belongs next to the box that caused it.
  const invalidHtml = useMemo(() => sanitizeBackgroundHtml(htmlDraft).invalid, [htmlDraft])
  const cssEscaped = useMemo(() => scopeBackgroundCss(cssDraft).escaped, [cssDraft])

  useEffect(() => {
    loadImages()
  }, [loadImages])

  const background = palette.backgrounds[slot]
  const baseline = palette.backgrounds.all
  // The image the layer will actually paint for this slot, baseline fallback included.
  const inherits = slot !== 'all' && !background.imageId && !background.url
  const shown = inherits ? baseline : background
  const image = images.find((img) => img.id === shown.imageId)
  const preview = image?.dataUrl || shown.url

  // Switching preset abandons drafts. Only the palette row: keying on the backgrounds object would
  // reset the drafts every time one of the autosaving controls above wrote to it.
  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        backgroundSlots.map((id) => [
          id,
          { css: palette.backgrounds[id].css, html: palette.backgrounds[id].html },
        ]),
      ) as Record<BackgroundSlot, { css: string; html: string }>,
    )
  }, [palette.id]) // eslint-disable-line

  // Live preview. Debounced so a keystroke doesn't restyle mid-word, and in memory only — a reload
  // drops it, which is still the way out of css that made the page unreadable.
  useEffect(() => {
    const timer = setTimeout(() => setPreview(slot, cssDraft, htmlDraft), previewDelay)
    return () => clearTimeout(timer)
  }, [slot, cssDraft, htmlDraft, setPreview])

  // Leaving the panel hands the layer back to what's saved.
  useEffect(() => () => clearPreview(), [clearPreview])

  const cssDirty = cssDraft !== background.css
  const htmlDirty = htmlDraft !== background.html
  const dirty = cssDirty || htmlDirty
  // Both inputs are reject-the-whole-thing: nothing is saved (or rendered) until they're clean.
  const canApply = dirty && !locked && invalidHtml.length === 0 && !cssEscaped

  const patchSlot = (fields: Partial<Background>) =>
    patch({ backgrounds: { ...palette.backgrounds, [slot]: { ...background, ...fields } } })

  const apply = () => {
    if (!canApply) return
    patchSlot({ css: cssDraft, html: htmlDraft })
  }

  const discard = () => {
    setCssDraft(background.css)
    setHtmlDraft(background.html)
  }

  return (
    <section className="backgrounds">
      {locked && <p className="backgroundsHint">{lockedHint}</p>}

      <nav className="navbar pageTabs">
        {backgroundSlots.map((id) => (
          <button
            key={id}
            type="button"
            className={`pageTab${slot === id ? ' current' : ''}`}
            onClick={() => setSlot(id)}
          >
            {slotLabel[id]}
          </button>
        ))}
      </nav>

      <p className="backgroundsHint">
        {slot === 'all'
          ? 'Applies to every page unless a page sets its own.'
          : `Applies to ${slotLabel[slot]}. Leave empty to use the one from "All pages".`}
      </p>

      <div className="backgroundsLayout">
        <div className="backgroundsLeft">
          <div className="backgroundPreview">
            {preview ? (
              <img src={preview} alt="" />
            ) : (
              <span className="backgroundEmpty">No image</span>
            )}
            {inherits && preview && <span className="backgroundInherited">From All pages</span>}
          </div>

          <div className="backgroundSource">
            {/* File inputs can't be styled; the label is the button. */}
            <label className="backgroundUpload">
              <RiUploadLine size={16} />
              Upload
              <input
                type="file"
                accept="image/*"
                disabled={locked}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  const imageId = await addImage(file)
                  patchSlot({ imageId, url: '' })
                }}
              />
            </label>

            <label>
              Image URL
              <input
                type="text"
                value={background.url}
                disabled={locked}
                placeholder="https://"
                onChange={(e) => patchSlot({ url: e.target.value, imageId: 0 })}
              />
            </label>

            <button
              type="button"
              className="secondary"
              disabled={locked || (!background.imageId && !background.url)}
              onClick={() => patchSlot({ imageId: 0, url: '' })}
            >
              Clear
            </button>
          </div>

          <label className="backgroundFit">
            Fit
            <select
              value={background.fit}
              disabled={locked}
              onChange={(e) => patchSlot({ fit: e.target.value as BackgroundFit })}
            >
              {backgroundFits.map((fit) => (
                <option key={fit} value={fit}>
                  {fitLabel[fit]}
                </option>
              ))}
            </select>
          </label>

          <label className="backgroundExcludeNav">
            <input
              type="checkbox"
              checked={background.excludeNav}
              disabled={locked}
              onChange={(e) => patchSlot({ excludeNav: e.target.checked })}
            />
            Start after the navigation bar
          </label>
        </div>

        <div className="backgroundsRight">
          <div className="backgroundCss">
            <label className="grow">
              HTML
              <textarea
                rows={6}
                spellCheck={false}
                value={htmlDraft}
                disabled={locked}
                placeholder={'<div class="orb"></div>'}
                onChange={(e) => setHtmlDraft(e.target.value)}
              />
            </label>
            <p className="backgroundsHint">
              Elements placed inside <code>.pageBackground</code> for your CSS to target. Allowed:{' '}
              <code>div span hr br p img</code>, with <code>class</code>, <code>id</code>,{' '}
              <code>style</code>, <code>src</code>, <code>alt</code>. Anything else is rejected until
              you remove it. Put CSS in the CSS box, not in a <code>&lt;style&gt;</code> tag.
            </p>
            {invalidHtml.length > 0 && (
              <p className="backgroundCssInvalid">Not allowed: {invalidHtml.join(', ')}</p>
            )}

            <label className="grow">
              CSS
              <textarea
                rows={10}
                spellCheck={false}
                value={cssDraft}
                disabled={locked}
                placeholder=".pageBackground { filter: blur(4px); }"
                onChange={(e) => setCssDraft(e.target.value)}
              />
            </label>
            <p className="backgroundsHint">
              The background layer is <code>.pageBackground</code>. The page updates both boxes as you type; changes aren't saved to the preset until you click <code>Apply</code>. Load the page with{' '}
              <code>?nocss=1</code> to turn saved CSS and HTML off.
            </p>
            {cssEscaped && (
              <p className="backgroundCssInvalid">
                Unbalanced braces. The CSS ends before its last rule.
              </p>
            )}
            <div className="backgroundCssActions">
              <button type="button" onClick={apply} disabled={!canApply}>
                Apply
              </button>
              <button type="button" className="secondary" onClick={discard} disabled={!dirty}>
                Discard
              </button>
            </div>
          </div>
        </div>
      </div>

      {images.length > 0 && (
        <div className="backgroundLibrary">
          <h3>Uploaded images</h3>
          <ul>
            {images.map((img) => (
              <li key={img.id}>
                <button
                  type="button"
                  className={`backgroundThumb${background.imageId === img.id ? ' current' : ''}`}
                  disabled={locked}
                  title={img.name}
                  onClick={() => patchSlot({ imageId: img.id!, url: '' })}
                >
                  <img src={img.dataUrl} alt="" />
                </button>
                <button
                  type="button"
                  className="danger"
                  title="Delete"
                  onClick={() => removeImage(img.id!)}
                >
                  <RiDeleteBinLine size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
