// Click resolution: turn a click on the displayed figure into a partId, from image-space
// coordinates against the map's polygon regions.

import type { BodyView, Region } from './types'

/** Map a click from displayed (CSS) coordinates to image-space (natural pixel) coordinates.
 *  Works regardless of the element's rendered size or device pixel ratio: the DOMRect is in CSS
 *  pixels and natural size is intrinsic, so the ratio between them is the scale. Assumes the image
 *  fills the rect (object-fit: fill / no letterboxing), which is how the widget renders it. */
export function toImageSpace(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  naturalW: number,
  naturalH: number,
): { x: number; y: number } {
  const x = ((clientX - rect.left) / rect.width) * naturalW
  const y = ((clientY - rect.top) / rect.height) * naturalH
  return { x, y }
}

/** Ray-casting point-in-polygon test. Polygon is a list of [x, y] in image space. */
export function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

/** Resolve a click against polygon regions for the current view. First hit wins. */
export function resolvePolygon(
  x: number,
  y: number,
  regions: Region[],
  view: BodyView,
): string | null {
  for (const r of regions) {
    if (r.view !== view || !r.polygon) continue
    if (pointInPolygon(x, y, r.polygon)) return r.partId
  }
  return null
}
