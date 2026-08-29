/** Which edges of a horizontal scroller still have something past them. Drives the carets on the
 *  plot layout's tab bar: no caret on the side you can't go.
 *
 *  Split out from the component so it can be checked without a DOM. See checkTabScroll.ts. */
export interface EdgeState {
  atStart: boolean
  atEnd: boolean
  /** False when everything fits, which is the desktop case: no carets at all. */
  scrollable: boolean
}

export function edgeState(scrollLeft: number, scrollWidth: number, clientWidth: number): EdgeState {
  // Sub-pixel layout means scrollLeft never quite reaches max, so both ends get a 1px tolerance.
  const max = scrollWidth - clientWidth
  return {
    atStart: scrollLeft <= 1,
    atEnd: scrollLeft >= max - 1,
    scrollable: max > 1,
  }
}
