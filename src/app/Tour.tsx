import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Step, Tour as TourData } from '../core/tour/types'
import { useMediaQuery } from './useMediaQuery'
import './tour.css'

type Side = 'left' | 'right' | 'top' | 'bottom'

// The margin the box keeps off the viewport edge.
const gap = 16

/** How far the fingertip stops short of the highlighted element. */
const tipGap = 8

/** The pointer art. Exported so TourHost can warm it before a tour starts. */
export const handSrc = '/pointer.png'
const handSize = 64

// How much room a hand needs beside the target: its own length, plus the gap it leaves off the
// target. Only the side the hand is standing on has to reserve this; the box hugs the target with
// the ordinary gap everywhere else.
const handRoom = handSize + tipGap

// The art points up. Pointing up is the readable pose, so the hand goes under the target and only
// flips to pointing down when there is no room under it. This is independent of which side the box
// landed on: a hand under the target still reads as pointing at it with the box off to the left.
const handTurn = { up: 0, down: 180 }

// The fingertip sits at 97,15 in the 256px art, so 24,4 at the size it renders, which is -8,-28
// from the image centre. Placement runs backwards from that: the tip goes where it should point,
// and the image is positioned around it.
const tipFromCentre = { up: { x: -8, y: -28 }, down: { x: 8, y: 28 } }

interface Props {
  tour: TourData
  onClose(): void
}

export default function Tour({ tour, onClose }: Props) {
  const phone = useMediaQuery('(max-width: 700px)')
  const steps = useMemo(
    () => tour.steps.filter((s) => !s.only || (s.only === 'mobile') === phone),
    [tour, phone],
  )

  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [box, setBox] = useState<{ side: Side; top: number; left: number } | null>(null)
  const [hand, setHand] = useState<{ left: number; top: number; rot: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  // Which way the user was going, so a step whose target has gone missing is skipped in the same
  // direction rather than bouncing back into the step they just left.
  const direction = useRef(1)

  const step: Step | undefined = steps[index]

  // An index past the last step ends the tour, in an effect rather than inside the updater: the
  // updater runs twice under StrictMode.
  const next = useCallback(() => {
    direction.current = 1
    setIndex((i) => Math.min(i + 1, steps.length))
  }, [steps.length])

  useEffect(() => {
    if (index >= steps.length) onClose()
  }, [index, steps.length, onClose])

  const back = useCallback(() => {
    direction.current = -1
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  // Find the target, put it on screen, then measure it. A step whose selector no longer matches
  // anything is skipped: a renamed class shortens a tour, it does not break the app.
  useEffect(() => {
    if (!step) return
    if (!step.target) {
      setRect(null)
      return
    }
    const el = document.querySelector(step.target)
    if (!el) {
      if (import.meta.env.DEV) console.warn(`tour "${tour.id}" step ${index}: no element for ${step.target}`)
      if (direction.current < 0 && index === 0) onClose()
      else if (direction.current < 0) back()
      else next()
      return
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const measure = () => setRect(el.getBoundingClientRect())
    const frame = requestAnimationFrame(measure)
    // Capture phase: the scroll happens inside whichever pane owns the target, not on window.
    window.addEventListener('scroll', measure, { capture: true, passive: true })
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [step, index, tour.id, next, back, onClose])

  // Place the box once its own size is known. Measured rather than assumed: the copy sets the
  // height, and a two-line step and a five-line one want different sides.
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el || !rect) {
      setBox(null)
      setHand(null)
      return
    }
    const w = el.offsetWidth
    const h = el.offsetHeight
    const room: Record<Side, number> = {
      right: window.innerWidth - rect.right,
      left: rect.left,
      bottom: window.innerHeight - rect.bottom,
      top: rect.top,
    }
    // Only the side the hand stands on has to make room for it.
    // The docked box takes the bottom of the screen, so on a phone the room below the target ends
    // where the box starts.
    const floor = window.innerHeight - (phone ? h : 0) - gap
    const handUp = rect.bottom + handRoom <= floor
    const handSide: Side = handUp ? 'bottom' : 'top'
    const offset = (side: Side) => (side === handSide ? handRoom : gap)
    const needed: Record<Side, number> = {
      right: w + offset('right'),
      left: w + offset('left'),
      top: h + offset('top'),
      bottom: h + offset('bottom'),
    }
    const sides: Side[] = ['right', 'left', 'bottom', 'top']
    const chosen =
      step?.side && room[step.side] >= needed[step.side]
        ? step.side
        : (sides.find((s) => room[s] >= needed[s]) ??
          sides.reduce((best, s) => (room[s] - needed[s] > room[best] - needed[best] ? s : best)))

    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max))
    const d = offset(chosen)
    const top =
      chosen === 'top' ? rect.top - h - d : chosen === 'bottom' ? rect.bottom + d : rect.top + rect.height / 2 - h / 2
    const left =
      chosen === 'left' ? rect.left - w - d : chosen === 'right' ? rect.right + d : rect.left + rect.width / 2 - w / 2

    setBox(
      phone
        ? null
        : {
            side: chosen,
            top: clamp(top, gap, window.innerHeight - h - gap),
            left: clamp(left, gap, window.innerWidth - w - gap),
          },
    )

    // The fingertip stops just short of the target and lines up with its centre.
    const pose = handUp ? 'up' : 'down'
    const tipX = clamp(rect.left + rect.width / 2, gap + handSize / 2, window.innerWidth - gap - handSize / 2)
    const tipY = handUp ? rect.bottom + tipGap : rect.top - tipGap
    const tip = tipFromCentre[pose]
    setHand({ left: tipX - tip.x - handSize / 2, top: tipY - tip.y - handSize / 2, rot: handTurn[pose] })
  }, [rect, phone, step, index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose()
      if (e.key === 'ArrowLeft') return back()
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, back, onClose])

  if (!step) return null

  const anchored = !phone && !!step.target
  const mode = phone ? 'tourBoxDocked' : step.target ? 'tourBoxAnchored' : 'tourBoxCentered'

  return (
    <div className="tourOverlay" onClick={next}>
      {/* A centred step has no rect, so the cutout collapses to nothing in the middle of the
          screen and its 9999px shadow dims everything. */}
      <div
        className="tourCutout"
        style={{
          top: rect?.top ?? window.innerHeight / 2,
          left: rect?.left ?? window.innerWidth / 2,
          width: rect?.width ?? 0,
          height: rect?.height ?? 0,
        }}
      />

      {/* Outside the box, and before it in the DOM, so the wrist end passes behind the box instead
          of painting on top of it. */}
      {hand && (
        <img
          className="tourHand"
          src={handSrc}
          alt=""
          style={{ top: hand.top, left: hand.left, transform: `rotate(${hand.rot}deg)` }}
        />
      )}

      <div
        ref={boxRef}
        className={`tourBox ${mode}`}
        style={anchored ? { top: box?.top ?? 0, left: box?.left ?? 0, visibility: box ? 'visible' : 'hidden' } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {step.body.map((p, i) => (
          <p key={i} className="tourText">{p}</p>
        ))}

        <div className="tourFoot">
          <span className="tourCount">{index + 1} / {steps.length}</span>
          <button type="button" className="tourSkip" onClick={onClose}>Close</button>
          {index > 0 && <button type="button" className="tourBack" onClick={back}>Back</button>}
          <button type="button" className="tourNext" onClick={next}>
            {index + 1 === steps.length ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
