import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { RiStarFill } from '@remixicon/react'
import { useChats } from '../../core/stores/chatStore'

/** Bookmarked chats pinned under the Chat nav item. Muted titles; the star clears the bookmark. */
export default function BookmarkList() {
  const bookmarks = useChats((s) => s.bookmarks)
  const loadBookmarks = useChats((s) => s.loadBookmarks)
  const toggleBookmark = useChats((s) => s.toggleBookmark)

  useEffect(() => {
    loadBookmarks()
  }, [loadBookmarks])

  if (bookmarks.length === 0) return null

  return (
    <ul className="sidebarBookmarks">
      {bookmarks.map((c) => (
        <li key={c.id}>
          <Link to={`/chat/${c.id}`} className="bookmarkTitle">
            {c.title}
          </Link>
          <button
            type="button"
            className="starButton"
            title="Remove bookmark"
            aria-label="Remove bookmark"
            onClick={() => toggleBookmark(c.id!)}
          >
            <RiStarFill size={14} />
          </button>
        </li>
      ))}
    </ul>
  )
}
