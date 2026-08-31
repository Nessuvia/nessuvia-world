import { RiGroupLine } from '@remixicon/react'
import { lazyView, registerModule } from '../../app/moduleRegistry'
import './multiplayer.css'

registerModule({
  id: 'multiplayer',
  label: 'Multiplayer',
  icon: RiGroupLine,
  route: '/multiplayer',
  component: lazyView(() => import('./MultiplayerView')),
})
