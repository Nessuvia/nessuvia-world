// The bundled generic-male body map and its starter action set (Phase 1 default asset).
//
// the figure is a blocky SVG built from the same rectangles that define the clickable
// regions, not an anatomical PNG. One source of truth for geometry, no binary asset to ship, and
// the polygon resolver runs against it exactly as it would a hand-drawn map. Swap in a real
// PNG + traced polygons via the authoring tool (Section 7) when art exists; the runtime is
// unchanged because both paths resolve a click to a partId the same way.

import type { ActionDef, BodyMap, BodyView, Region } from './types'

const W = 220
const H = 520

interface Rect {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
}

// Front layout. Regions go down to hands and feet, no fingers (per the locked granularity).
const frontRects: Rect[] = [
  { id: 'head', name: 'head', x: 88, y: 10, w: 44, h: 60 },
  { id: 'neck', name: 'neck', x: 98, y: 70, w: 24, h: 20 },
  { id: 'left_shoulder', name: 'left shoulder', x: 58, y: 90, w: 34, h: 26 },
  { id: 'right_shoulder', name: 'right shoulder', x: 128, y: 90, w: 34, h: 26 },
  { id: 'chest', name: 'chest', x: 82, y: 90, w: 56, h: 90 },
  { id: 'abdomen', name: 'abdomen', x: 86, y: 180, w: 48, h: 80 },
  { id: 'left_upper_arm', name: 'left upper arm', x: 54, y: 116, w: 30, h: 74 },
  { id: 'right_upper_arm', name: 'right upper arm', x: 136, y: 116, w: 30, h: 74 },
  { id: 'left_forearm', name: 'left forearm', x: 46, y: 190, w: 32, h: 70 },
  { id: 'right_forearm', name: 'right forearm', x: 142, y: 190, w: 32, h: 70 },
  { id: 'left_hand', name: 'left hand', x: 42, y: 260, w: 32, h: 36 },
  { id: 'right_hand', name: 'right hand', x: 146, y: 260, w: 32, h: 36 },
  { id: 'left_thigh', name: 'left thigh', x: 86, y: 260, w: 24, h: 100 },
  { id: 'right_thigh', name: 'right thigh', x: 110, y: 260, w: 24, h: 100 },
  { id: 'left_shin', name: 'left shin', x: 87, y: 360, w: 22, h: 100 },
  { id: 'right_shin', name: 'right shin', x: 111, y: 360, w: 22, h: 100 },
  { id: 'left_foot', name: 'left foot', x: 80, y: 460, w: 30, h: 40 },
  { id: 'right_foot', name: 'right foot', x: 110, y: 460, w: 30, h: 40 },
]

// Back layout: same silhouette, but the torso reads as back/buttocks.
const backRects: Rect[] = frontRects.map((r) => {
  if (r.id === 'chest') return { ...r, name: 'upper back' }
  if (r.id === 'abdomen') return { ...r, name: 'lower back', h: 60 }
  return r
})
backRects.push({ id: 'buttocks', name: 'buttocks', x: 86, y: 240, w: 48, h: 40 })

function rectToPolygon(r: Rect): [number, number][] {
  return [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ]
}

function regionsFor(rects: Rect[], view: BodyView): Region[] {
  return rects.map((r) => ({
    partId: `${r.id}_${view}`,
    name: r.name,
    view,
    polygon: rectToPolygon(r),
  }))
}

function svgFor(rects: Rect[]): string {
  const shapes = rects
    .map(
      (r) =>
        `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="6" ` +
        `fill="#c9b7a4" stroke="#7a6a58" stroke-width="1.5"/>` +
        `<text x="${r.x + r.w / 2}" y="${r.y + r.h / 2}" font-size="7" fill="#3a3128" ` +
        `text-anchor="middle" dominant-baseline="middle">${r.name}</text>`,
    )
    .join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="#f3ede6"/>${shapes}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export const defaultBodyMap: BodyMap = {
  id: 'generic-male',
  name: 'Generic male',
  images: { front: svgFor(frontRects), back: svgFor(backRects) },
  regions: [...regionsFor(frontRects, 'front'), ...regionsFor(backRects, 'back')],
  actions: defaultActions(),
}

/** Starter, reusable actions. Templates use {{user}}/{{char}}/{{part}}. */
export function defaultActions(): ActionDef[] {
  return [
    { id: 'massage', state: 'massaged', descriptionTemplate: '{{user}} gives {{char}} a deep-tissue massage on the {{part}}', bundled: true, category: 'touch' },
    { id: 'caress', state: 'caressed', descriptionTemplate: '{{user}} gently caresses {{char}}’s {{part}}', bundled: true, category: 'touch' },
    { id: 'bandage', state: 'bandaged', descriptionTemplate: '{{char}}’s {{part}} is wrapped in a clean bandage', bundled: true, category: 'care' },
    { id: 'clean', state: 'cleaned', descriptionTemplate: '{{char}}’s {{part}} has been cleaned', bundled: true, category: 'care' },
    { id: 'wound', state: 'wounded', descriptionTemplate: '{{char}}’s {{part}} is bleeding', bundled: true, category: 'harm' },
    { id: 'bruise', state: 'bruised', descriptionTemplate: '{{char}}’s {{part}} is badly bruised', bundled: true, category: 'harm' },
    { id: 'restrained', state: 'restrained', descriptionTemplate: '{{char}}’s {{part}} is restrained', bundled: true, category: 'state' },
  ]
}
