import { useEffect, useRef, useState } from 'react'
import {
  RiCircleLine,
  RiCloseLine,
  RiCursorLine,
  RiDeleteBinLine,
  RiMagicLine,
  RiSquareLine,
} from '@remixicon/react'
import { useBodyMap } from './bodyMapStore'
import type { ActionDef, BodyMap, BodyView, Region } from './types'
import { defaultActions } from './defaultMap'
import { parseBodyMapReply } from './parseBodyMap'
import { floodFillMask, maskBounds } from './wandSelect'
import '../../app/formPage.css'
import './bodyMap.css'

// Bundled authoring tool. Builds a BodyMap the runtime consumes unchanged: upload a base image for
// front/back, define regions by clicking points, dragging a rectangle/oval, or wand-selecting a
// same-colored area over the base image, edit the reusable action set, then export the JSON.
//
// Hosts on the page, not a modal — the figure + region panel need the room.

type DrawTool = 'point' | 'rect' | 'circle' | 'wand'

// Rect/circle are draw-and-release shortcuts, not a distinct geometry — the drag is converted to
// a polygon on release so Region keeps its single point-list shape (types.ts stays untouched).
function rectPolygon(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const x = [Math.round(Math.min(x0, x1)), Math.round(Math.max(x0, x1))]
  const y = [Math.round(Math.min(y0, y1)), Math.round(Math.max(y0, y1))]
  return [
    [x[0], y[0]],
    [x[1], y[0]],
    [x[1], y[1]],
    [x[0], y[1]],
  ]
}

const OVAL_SEGMENTS = 24

function ovalPolygon(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const rx = Math.abs(x1 - x0) / 2
  const ry = Math.abs(y1 - y0) / 2
  const points: [number, number][] = []
  for (let i = 0; i < OVAL_SEGMENTS; i++) {
    const angle = (i / OVAL_SEGMENTS) * Math.PI * 2
    points.push([Math.round(cx + rx * Math.cos(angle)), Math.round(cy + ry * Math.sin(angle))])
  }
  return points
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export default function BodyMapAuthor() {
  const [images, setImages] = useState<Record<BodyView, string>>({ front: '', back: '' })
  const [view, setView] = useState<BodyView>('front')
  const [regions, setRegions] = useState<Region[]>([])
  const [actions, setActions] = useState<ActionDef[]>(defaultActions())
  const [name, setName] = useState('New map')
  const [draft, setDraft] = useState<[number, number][]>([])
  const [error, setError] = useState('')
  const [tolerance, setTolerance] = useState(48)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tool, setTool] = useState<DrawTool>('point')
  // Image-space drag start/end for the rect/circle tools; null when not dragging.
  const [drag, setDrag] = useState<{ start: [number, number]; end: [number, number] } | null>(null)
  // A rect/circle shape that's been drawn but not committed yet — shown with a draggable bounding
  // box until the user clicks outside the figure, which locks it in as a region.
  const [pending, setPending] = useState<{ tool: DrawTool; x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  )
  // In-progress move of the pending shape's bounding box: pointer start + the bounds at that point.
  const [moveDrag, setMoveDrag] = useState<{
    startX: number
    startY: number
    orig: { x0: number; y0: number; x1: number; y1: number }
  } | null>(null)
  const figureRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  // One-deep undo of structural region edits (add / remove / delete-all). Renames aren't tracked —
  // per-keystroke snapshots would make undo revert a single character.
  const [prevRegions, setPrevRegions] = useState<Region[] | null>(null)
  // The library row this map came from (null = unsaved). Save overwrites it; Save as new clears it.
  const [rowId, setRowId] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const savedMaps = useBodyMap((s) => s.savedMaps)
  const loadMaps = useBodyMap((s) => s.loadMaps)
  const saveMap = useBodyMap((s) => s.saveMap)
  const deleteMap = useBodyMap((s) => s.deleteMap)

  useEffect(() => {
    loadMaps()
  }, [loadMaps])

  function buildMap(): BodyMap {
    return {
      id: name.toLowerCase().replace(/\s+/g, '-') || 'map',
      name,
      images,
      regions,
      actions,
    }
  }

  function applyMap(map: BodyMap) {
    setImages(map.images)
    setRegions(map.regions)
    setActions(map.actions)
    setName(map.name)
    setDraft([])
  }

  async function importJsonFile(file?: File) {
    if (!file) return
    setError('')
    try {
      applyMap(parseBodyMapReply(await file.text()))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function onUpload(file?: File) {
    if (!file) return
    const url = await readImage(file)
    setImages((s) => ({ ...s, [view]: url }))
  }

  // Image-space coords: displayed -> natural via the viewBox (natural size set on the <svg>).
  function toImageCoords(e: { clientX: number; clientY: number }): [number, number] | null {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    const vb = svg.viewBox.baseVal
    const x = ((e.clientX - rect.left) / rect.width) * vb.width
    const y = ((e.clientY - rect.top) / rect.height) * vb.height
    return [Math.round(x), Math.round(y)]
  }

  function addRegion(polygon: [number, number][]) {
    setPrevRegions(regions)
    setRegions((r) => [
      ...r,
      {
        partId: `region_${view}_${r.length}`,
        name: `region ${r.length + 1}`,
        view,
        polygon,
      },
    ])
  }

  // Reads the base image into an offscreen canvas at natural size, flood-fills from the clicked
  // pixel within `tolerance`, and hands the fill's bounding box to the same pending-shape workflow
  // rect/oval use — the wand is a faster way to land at a rectangle, not a distinct geometry.
  function runWand(x: number, y: number) {
    const img = imgRef.current
    if (!img) return
    const canvas = document.createElement('canvas')
    canvas.width = dims.w
    canvas.height = dims.h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0, dims.w, dims.h)
    const { data } = ctx.getImageData(0, 0, dims.w, dims.h)
    const px = Math.min(Math.max(Math.round(x), 0), dims.w - 1)
    const py = Math.min(Math.max(Math.round(y), 0), dims.h - 1)
    const mask = floodFillMask(data, dims.w, dims.h, px, py, tolerance)
    const bounds = maskBounds(mask, dims.w, dims.h)
    if (!bounds) return
    setPending({ tool: 'wand', x0: bounds.x0, y0: bounds.y0, x1: bounds.x1, y1: bounds.y1 })
  }

  function onFigureClick(e: React.MouseEvent<SVGSVGElement>) {
    if (pending) return
    const p = toImageCoords(e)
    if (!p) return
    if (tool === 'point') setDraft((d) => [...d, p])
    else if (tool === 'wand') runWand(p[0], p[1])
  }

  function onFigureMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (tool !== 'rect' && tool !== 'circle') return
    if (pending) return
    const p = toImageCoords(e)
    if (!p) return
    setDrag({ start: p, end: p })
  }

  function onFigureMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (moveDrag) {
      const p = toImageCoords(e)
      if (!p) return
      const dx = p[0] - moveDrag.startX
      const dy = p[1] - moveDrag.startY
      const { x0, y0, x1, y1 } = moveDrag.orig
      setPending((cur) => (cur ? { ...cur, x0: x0 + dx, y0: y0 + dy, x1: x1 + dx, y1: y1 + dy } : cur))
      return
    }
    if (!drag) return
    const p = toImageCoords(e)
    if (!p) return
    setDrag((d) => (d ? { ...d, end: p } : d))
  }

  function onFigureMouseUp() {
    if (moveDrag) {
      setMoveDrag(null)
      return
    }
    if (!drag) return
    const [x0, y0] = drag.start
    const [x1, y1] = drag.end
    setDrag(null)
    if (Math.abs(x1 - x0) < 2 || Math.abs(y1 - y0) < 2) return
    setPending({
      tool,
      x0: Math.min(x0, x1),
      y0: Math.min(y0, y1),
      x1: Math.max(x0, x1),
      y1: Math.max(y0, y1),
    })
  }

  // Starts dragging the pending shape's bounding box. stopPropagation so the svg's own mousedown
  // (which would start a new draw) never fires.
  function onPendingBoxMouseDown(e: React.MouseEvent<SVGRectElement>) {
    e.stopPropagation()
    if (!pending) return
    const p = toImageCoords(e)
    if (!p) return
    setMoveDrag({ startX: p[0], startY: p[1], orig: { x0: pending.x0, y0: pending.y0, x1: pending.x1, y1: pending.y1 } })
  }

  function snapPendingToMiddle() {
    setPending((cur) => {
      if (!cur) return cur
      const width = cur.x1 - cur.x0
      const x0 = dims.w / 2 - width / 2
      return { ...cur, x0, x1: x0 + width }
    })
  }

  function commitPending() {
    // Side effects (addRegion) must not live inside the setPending updater — React invokes
    // updater functions twice in dev to check purity, which was double-adding the region.
    if (!pending) return
    addRegion(pending.tool === 'circle' ? ovalPolygon(pending.x0, pending.y0, pending.x1, pending.y1) : rectPolygon(pending.x0, pending.y0, pending.x1, pending.y1))
    setPending(null)
  }

  // Any pointer-down outside the figure (image + toolbar + overlay) locks the pending shape in.
  useEffect(() => {
    if (!pending) return
    function onDocPointerDown(e: MouseEvent) {
      if (figureRef.current?.contains(e.target as Node)) return
      commitPending()
    }
    document.addEventListener('mousedown', onDocPointerDown)
    return () => document.removeEventListener('mousedown', onDocPointerDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  function finishRegion() {
    if (draft.length < 3) return
    addRegion(draft)
    setDraft([])
  }

  // Duplicates a region flipped horizontally about the figure's center, onto the opposite side.
  // partId/name get a best-effort left<->right swap; falls back to a _mirror suffix.
  function mirrorRegion(r: Region) {
    if (!r.polygon) return
    const flipped: [number, number][] = r.polygon.map(([x, y]) => [Math.round(dims.w - x), y])
    const swapSide = (s: string) =>
      /left/i.test(s)
        ? s.replace(/left/gi, (m) => (m[0] === 'L' ? 'Right' : 'right'))
        : /right/i.test(s)
          ? s.replace(/right/gi, (m) => (m[0] === 'R' ? 'Left' : 'left'))
          : `${s}_mirror`
    setPrevRegions(regions)
    setRegions((all) => [
      ...all,
      {
        partId: swapSide(r.partId),
        name: swapSide(r.name),
        view: r.view,
        polygon: flipped,
      },
    ])
  }

  function removeRegion(partId: string) {
    setPrevRegions(regions)
    setRegions((all) => all.filter((x) => x.partId !== partId))
  }

  // Delete-all clears only the current view's regions; the other view is left alone.
  function deleteAllRegions() {
    setPrevRegions(regions)
    setRegions((all) => all.filter((x) => x.view !== view))
  }

  function undoRegions() {
    if (!prevRegions) return
    setRegions(prevRegions)
    setPrevRegions(null)
  }

  function loadSaved(id: number) {
    const found = savedMaps.find((s) => s.rowId === id)
    if (!found) return
    applyMap(found.map)
    setRowId(id)
  }

  // Save overwrites the loaded library row; with none loaded it creates one. Save as new always
  // creates a fresh row so you can fork a map (man -> woman) without clobbering the original.
  async function save(asNew: boolean) {
    const id = await saveMap(buildMap(), asNew ? undefined : (rowId ?? undefined))
    setRowId(id)
  }

  async function removeSaved() {
    if (rowId == null) return
    if (!window.confirm('Delete this saved map? This cannot be undone.')) return
    await deleteMap(rowId)
    setRowId(null)
  }

  // Downloads the map as a .json file rather than printing it to a textarea to copy from.
  function doExport() {
    const blob = new Blob([JSON.stringify(buildMap(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name.toLowerCase().replace(/\s+/g, '-') || 'map'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Natural size for the SVG viewBox. Known only after the base image loads; default to the
  // bundled figure's size so the overlay lines up before a custom upload.
  const [dims, setDims] = useState({ w: 220, h: 520 })
  const viewRegions = regions.filter((r) => r.view === view)

  return (
    <div className="bodyAuthor formPage screenFrame">
      <div className="bodyAuthorHead">
        <h2>Author a body map</h2>
      </div>

      <div className="bodyAuthorCols screenBody">
      <div className="bodyAuthorControls">
      <details className="panel bodyAuthorSection" open>
        <summary>Details</summary>
        <div className="panel bodyAuthorBar">
          <label className="bodyFootField">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="bodyFootField">
            View
            <select value={view} onChange={(e) => setView(e.target.value as BodyView)}>
              <option value="front">Front</option>
              <option value="back">Back</option>
            </select>
          </label>
          <label className="fileButton">
            Import image ({view})
            <input type="file" accept="image/*" onChange={(e) => onUpload(e.target.files?.[0])} />
          </label>
        </div>

        <div className="panel bodyAuthorBar">
          <label className="bodyFootField">
            Saved maps
            <select
              value={rowId ?? ''}
              onChange={(e) => (e.target.value ? loadSaved(Number(e.target.value)) : setRowId(null))}
            >
              <option value="">New (unsaved)</option>
              {savedMaps.map((s) => (
                <option key={s.rowId} value={s.rowId}>
                  {s.map.name || 'Untitled'}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => save(false)} disabled={regions.length === 0}>
            {rowId == null ? 'Save' : 'Save changes'}
          </button>
          <button type="button" onClick={() => save(true)} disabled={regions.length === 0}>
            Save as new
          </button>
          <button
            type="button"
            className="danger"
            title="Delete saved map"
            onClick={removeSaved}
            disabled={rowId == null}
          >
            <RiDeleteBinLine size={16} />
          </button>
        </div>
      </details>

      <details className="panel bodyAuthorSection" open>
        <summary>Region list</summary>
        <div className="bodyMapBody">
          <div className="bodyPanel">
            <div className="panel bodyAuthorBar">
              {tool === 'point' && (
                <>
                  <button type="button" onClick={finishRegion} disabled={draft.length < 3}>
                    Finish region ({draft.length} pts)
                  </button>
                  <button type="button" onClick={() => setDraft([])} disabled={!draft.length}>
                    Clear points
                  </button>
                </>
              )}
              {tool === 'wand' && (
                <label className="bodyFootField">
                  Wand tolerance ({tolerance})
                  <input
                    type="range"
                    min={8}
                    max={128}
                    value={tolerance}
                    onChange={(e) => setTolerance(Number(e.target.value))}
                  />
                </label>
              )}
              <button type="button" onClick={undoRegions} disabled={!prevRegions}>
                Undo
              </button>
              <button type="button" onClick={deleteAllRegions} disabled={viewRegions.length === 0}>
                Delete all
              </button>
            </div>
            <div className="bodyState">
              {viewRegions.length === 0 && <p className="bodyEmpty">No regions on this view.</p>}
              {viewRegions.map((r) => (
                <div
                  key={r.partId}
                  className={`card bodyStatePart${selectedId === r.partId ? ' selected' : ''}`}
                  onClick={() => setSelectedId(r.partId)}
                >
                  <input
                    value={r.name}
                    onChange={(e) =>
                      setRegions((all) =>
                        all.map((x) => (x.partId === r.partId ? { ...x, name: e.target.value } : x)),
                      )
                    }
                  />
                  <button
                    type="button"
                    title="Mirror to opposite side"
                    disabled={!r.polygon}
                    onClick={(e) => {
                      e.stopPropagation()
                      mirrorRegion(r)
                    }}
                  >
                    Mirror
                  </button>
                  <button
                    type="button"
                    title="Remove region"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeRegion(r.partId)
                    }}
                  >
                    <RiCloseLine size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </details>

      <details className="panel bodyAuthorSection" open>
        <summary>Actions</summary>
        <ActionEditor actions={actions} setActions={setActions} />
      </details>

      <div className="bodyAuthorFoot">
        <button type="button" onClick={doExport}>
          Export JSON
        </button>
        <label className="fileButton">
          Import JSON
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => importJsonFile(e.target.files?.[0])}
          />
        </label>
      </div>
      {error && <p className="hint danger">{error}</p>}
      </div>

      <div className="bodyFigureCol">
      <div className="bodyFigure" ref={figureRef}>
        {images[view] && (
          <div className="panel bodyToolbar">
            <button
              type="button"
              title="Point tool: click to place polygon points"
              className={tool === 'point' ? 'active' : ''}
              onClick={() => setTool('point')}
            >
              <RiCursorLine size={16} />
            </button>
            <button
              type="button"
              title="Rectangle tool: drag to draw a rectangular region"
              className={tool === 'rect' ? 'active' : ''}
              onClick={() => setTool('rect')}
            >
              <RiSquareLine size={16} />
            </button>
            <button
              type="button"
              title="Oval tool: drag to draw an oval region"
              className={tool === 'circle' ? 'active' : ''}
              onClick={() => setTool('circle')}
            >
              <RiCircleLine size={16} />
            </button>
            <button
              type="button"
              title="Wand tool: click a color to select the connected area"
              className={tool === 'wand' ? 'active' : ''}
              onClick={() => setTool('wand')}
            >
              <RiMagicLine size={16} />
            </button>
            <button
              type="button"
              className="bodyToolbarWide"
              title="Center the pending shape horizontally"
              disabled={!pending}
              onClick={snapPendingToMiddle}
            >
              Snap
            </button>
          </div>
        )}
        {images[view] ? (
          <img
            ref={imgRef}
            src={images[view]}
            alt={`${view} base`}
            onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
        ) : (
          <p className="bodyEmpty">Upload a base image for {view}.</p>
        )}
        {images[view] && (
          <svg
            ref={svgRef}
            className="bodyOverlay"
            viewBox={`0 0 ${dims.w} ${dims.h}`}
            preserveAspectRatio="none"
            onClick={onFigureClick}
            onMouseDown={onFigureMouseDown}
            onMouseMove={onFigureMouseMove}
            onMouseUp={onFigureMouseUp}
            onMouseLeave={onFigureMouseUp}
          >
            {viewRegions.map((r) => (
              <polygon
                key={r.partId}
                className={`region active${selectedId === r.partId ? ' selected' : ''}`}
                points={(r.polygon ?? []).map((p) => p.join(',')).join(' ')}
                // Clicking a region selects its row. stopPropagation so it doesn't also drop a draft
                // point — the tradeoff is you draw new polygons on empty areas, not over regions.
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedId(r.partId)
                }}
              />
            ))}
            {draft.length > 0 && (
              <polyline
                points={draft.map((p) => p.join(',')).join(' ')}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
              />
            )}
            {drag && (
              <polygon
                className="dragPreview"
                points={(tool === 'circle'
                  ? ovalPolygon(drag.start[0], drag.start[1], drag.end[0], drag.end[1])
                  : rectPolygon(drag.start[0], drag.start[1], drag.end[0], drag.end[1])
                )
                  .map((p) => p.join(','))
                  .join(' ')}
              />
            )}
            {pending && (
              <>
                <polygon
                  className="dragPreview"
                  points={(pending.tool === 'circle'
                    ? ovalPolygon(pending.x0, pending.y0, pending.x1, pending.y1)
                    : rectPolygon(pending.x0, pending.y0, pending.x1, pending.y1)
                  )
                    .map((p) => p.join(','))
                    .join(' ')}
                />
                <rect
                  className="pendingBox"
                  x={pending.x0}
                  y={pending.y0}
                  width={pending.x1 - pending.x0}
                  height={pending.y1 - pending.y0}
                  onMouseDown={onPendingBoxMouseDown}
                />
              </>
            )}
          </svg>
        )}
      </div>
      </div>
      </div>
    </div>
  )
}

function ActionEditor({
  actions,
  setActions,
}: {
  actions: ActionDef[]
  setActions: (fn: (a: ActionDef[]) => ActionDef[]) => void
}) {
  // Quick-add: type the state on the left and the grammar once on the right. {{state}} in the
  // grammar is filled with the state value, producing one action per Add click. The grammar stays
  // so you can fire off a series (touch, pinch, pat…) without retyping it.
  const [qaState, setQaState] = useState('')
  const [qaGrammar, setQaGrammar] = useState('')

  const resolved = qaGrammar.replaceAll('{{state}}', qaState.trim())

  function quickAdd() {
    const state = qaState.trim()
    if (!state || !qaGrammar.trim()) return
    // {{state}} is a build-time macro, not a runtime token — resolve it into the stored
    // template now so the row shows the real text and {{state}} can't leak into output.
    // {{user}}/{{char}}/{{part}} stay literal for resolveTemplate at apply time.
    const descriptionTemplate = qaGrammar.replaceAll('{{state}}', state)
    setActions((all) => [
      ...all,
      { id: crypto.randomUUID(), state, descriptionTemplate },
    ])
    setQaState('')
  }

  return (
    <div className="bodyAuthorActions">
      {actions.map((a) => (
        <div key={a.id} className="card bodyStatePart">
          <input
            value={a.state}
            placeholder="state"
            onChange={(e) =>
              setActions((all) => all.map((x) => (x.id === a.id ? { ...x, state: e.target.value } : x)))
            }
          />
          <input
            value={a.descriptionTemplate}
            placeholder="{{user}} … {{char}}’s {{part}}"
            onChange={(e) =>
              setActions((all) =>
                all.map((x) => (x.id === a.id ? { ...x, descriptionTemplate: e.target.value } : x)),
              )
            }
          />
          <button type="button" title="Remove" onClick={() => setActions((all) => all.filter((x) => x.id !== a.id))}>
            <RiCloseLine size={14} />
          </button>
        </div>
      ))}
      <div className="bodyActionQuickAdd">
        <div className="panel bodyAuthorBar">
          <input
            value={qaState}
            placeholder="state"
            onChange={(e) => setQaState(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') quickAdd()
            }}
          />
          <input
            value={qaGrammar}
            placeholder="{{user}} is {{state}}ing the {{part}} of the {{char}} voodoo doll."
            onChange={(e) => setQaGrammar(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') quickAdd()
            }}
          />
          <button
            type="button"
            onClick={quickAdd}
            disabled={!qaState.trim() || !qaGrammar.trim()}
          >
            Add
          </button>
        </div>
        {qaGrammar.trim() && (
          <p className="hint bodyActionPreview">
            {resolved || <span className="muted">(type a state to preview)</span>}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() =>
          setActions((all) => [...all, { id: crypto.randomUUID(), state: '', descriptionTemplate: '' }])
        }
      >
        Add action
      </button>
    </div>
  )
}
