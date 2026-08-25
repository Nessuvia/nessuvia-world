import { useEffect } from 'react'
import { RiCloseLine } from '@remixicon/react'

/**
 * Full-size view of one gallery image. Reuses `.dialogBackdrop` from chat.css but not `.dialog` —
 * that fixes a card width, and this has to hug the image instead. Sizing is entirely CSS: the
 * `<img>` gets no dimensions, so it renders at natural size and the max-* caps only shrink it.
 */
export default function GalleryLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="dialogBackdrop" onClick={onClose}>
      <div className="galleryLightbox" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="galleryLightboxClose" onClick={onClose} aria-label="Close">
          <RiCloseLine size={20} />
        </button>
        <img src={src} alt="" />
      </div>
    </div>
  )
}
