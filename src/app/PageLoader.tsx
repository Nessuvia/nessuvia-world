import { RiLoader4Line } from '@remixicon/react'
import './PageLoader.css'

// Suspense fallback for lazy module chunks.
export default function PageLoader() {
  return (
    <div className="pageLoader">
      <RiLoader4Line size={32} />
    </div>
  )
}
