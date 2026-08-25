import { lazy } from 'react'
import { RiBodyScanLine } from '@remixicon/react'
import { registerModule } from '../../app/moduleRegistry'
import BodyMapPanel from './BodyMapPanel'
import { useBodyMap } from './bodyMapStore'

// The tab is the authoring tool. Maps are set up here once and saved as presets; the runtime lives
// in the chat sidebar (BodyMapPanel), which is where a map is picked and states are attached.
registerModule({
  id: 'bodyMap',
  label: 'Body map',
  icon: RiBodyScanLine,
  route: '/body-map',
  component: lazy(() => import('./BodyMapAuthor')),
  plugin: true,
  chatPanels: [{ label: 'Body map', component: BodyMapPanel }],
  // The panel opens the tracker when it mounts, but that races the first send, and a send can
  // arrive for a chat whose panel was never opened. Opening here when the ids disagree makes the
  // block depend on the chat being sent to rather than on mount timing.
  async decorateMessage(ctx) {
    if (useBodyMap.getState().chatId !== ctx.chatId) await useBodyMap.getState().open(ctx.chatId)
    return useBodyMap.getState().payload({ user: ctx.user, char: ctx.char })
  },
})
