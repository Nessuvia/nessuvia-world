import { RiQuestionLine } from '@remixicon/react'
import { useLocation } from 'react-router-dom'
import { tourFor } from '../core/tour/tours'
import { useTour } from '../core/stores/tourStore'
import './tour.css'

/** Starts the current page's tour. Renders nothing on a page that has no tour file. */
export default function TourButton({ className = '' }: { className?: string }) {
  const { pathname } = useLocation()
  const tour = tourFor(pathname)
  const start = useTour((s) => s.start)
  if (!tour) return null
  return (
    <button
      type="button"
      className={`tourButton ${className}`}
      title={`Tour: ${tour.name}`}
      aria-label={`Tour: ${tour.name}`}
      onClick={start}
    >
      <RiQuestionLine size={18} />
    </button>
  )
}
