import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { forgetMotion, noteMotion } from './cardMotion'

/**
 * FLIP for the cards. Motion is normally off limits until polish, this is the polish pass and it
 * was asked for.
 *
 * The board renders state, so nothing about it moves on its own: a card given to you simply stops
 * being drawn in one row and starts being drawn in another. This measures every card before and
 * after a state change and plays the difference, which is why cards carry a `data-cardid` that
 * survives moving between rows: the lookup is by that attribute, not by DOM node, and a node
 * unmounted from one row and mounted in another still matches its old rectangle.
 *
 * A card with no previous rectangle is new to the board. It comes in from `origin`, the zone that
 * just shrank, so a fished card flies off the deck and a card you won flies out of their hand.
 * With no origin (the deal) the hand fans in, staggered by position.
 *
 * A face-up arrival plays in three beats: it travels face down, settles, then turns over. The back
 * is `.cardTableCard::after`, an opaque cover animated on the pseudo-element, so the card's face
 * stays in the DOM the whole time and nothing about the markup changes.
 *
 * `prefers-reduced-motion` skips all of it, and the board is correct without any of it.
 */

/** The whole arrival, travel through turn-over. Tuned by eye; one number moves the lot. */
const arriveMs = 4000
/** Fractions of `arriveMs`: travel, then a beat of stillness, then the turn. */
const settled = 0.55
const turnStart = 0.68
const turnEdge = 0.84
const moveMs = 2400
const dealMs = 900
const dealStaggerMs = 220
/** Slow out of the throw and into the landing, rather than braking the whole way. */
const travelEase = 'cubic-bezier(0.33, 0.9, 0.25, 1)'

export function useCardMotion(
  root: RefObject<HTMLElement | null>,
  origin: string | null,
  /** Changes whenever the board does. */
  version: unknown,
  /** Whether the store should wait for this board. False for History's scrubber: it replays a
   *  finished game and nothing is listening. */
  report = true,
) {
  const previous = useRef(new Map<string, DOMRect>())
  const dealt = useRef(false)

  // A board that goes away takes its outstanding motion with it.
  useEffect(() => () => forgetMotion(), [])

  useLayoutEffect(() => {
    const node = root.current
    if (!node) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const cards = Array.from(node.querySelectorAll<HTMLElement>('[data-cardid]'))
    const started: Animation[] = []
    const play = (
      card: HTMLElement,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) => {
      started.push(card.animate(frames, options))
    }
    const next = new Map<string, DOMRect>()
    const from = origin ? node.querySelector<HTMLElement>(`[data-zone='${origin}']`) : null
    const fromRect = from?.getBoundingClientRect()

    cards.forEach((card, i) => {
      const id = card.dataset.cardid
      if (!id) return
      const rect = card.getBoundingClientRect()
      next.set(id, rect)
      if (reduced) return

      const before = previous.current.get(id)
      if (before) {
        const dx = before.left - rect.left
        const dy = before.top - rect.top
        // A sub-pixel shift is reflow, not a move, and animating it reads as a twitch.
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return
        play(
          card,
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
          { duration: moveMs, easing: travelEase },
        )
        return
      }

      if (fromRect) {
        const dx = fromRect.left - rect.left
        const dy = fromRect.top - rect.top
        const faceUp = !card.classList.contains('cardTableCardBack')
        if (!faceUp) {
          play(
            card,
            [
              { transform: `translate(${dx}px, ${dy}px)`, opacity: 0.4 },
              { transform: 'none', opacity: 1 },
            ],
            { duration: arriveMs * settled, easing: travelEase },
          )
          return
        }

        play(
          card,
          [
            { offset: 0, transform: `translate(${dx}px, ${dy}px)`, easing: travelEase },
            { offset: settled, transform: 'none' },
            { offset: turnStart, transform: 'none', easing: 'ease-in' },
            { offset: turnEdge, transform: 'rotateY(90deg)', easing: 'ease-out' },
            { offset: 1, transform: 'none' },
          ],
          { duration: arriveMs },
        )
        // The face is under a cover that lifts at the edge-on frame, which is what makes the travel
        // read as face down and the landing as a turn.
        play(
          card,
          [
            { offset: 0, opacity: 1 },
            { offset: turnEdge, opacity: 1 },
            { offset: Math.min(turnEdge + 0.001, 1), opacity: 0 },
            { offset: 1, opacity: 0 },
          ],
          { duration: arriveMs, pseudoElement: '::after' },
        )
        return
      }

      play(
        card,
        [{ opacity: 0, transform: 'translateY(-12px)' }, { opacity: 1, transform: 'none' }],
        // The opening deal lands one card at a time; every later arrival is immediate.
        {
          duration: dealMs,
          delay: dealt.current ? 0 : i * dealStaggerMs,
          easing: travelEase,
          fill: 'backwards',
        },
      )
    })

    previous.current = next
    dealt.current = true
    // The store waits on these before it writes the next event, so a card is never replaced
    // mid-flight by the same card in its final place.
    if (report) noteMotion(started)
  }, [root, origin, version, report])
}
