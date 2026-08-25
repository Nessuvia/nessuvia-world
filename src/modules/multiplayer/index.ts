import { lazy } from 'react'
import { RiGroupLine } from '@remixicon/react'
import { registerModule } from '../../app/moduleRegistry'
import './multiplayer.css'

registerModule({
  id: 'multiplayer',
  label: 'Multiplayer',
  icon: RiGroupLine,
  route: '/multiplayer',
  component: lazy(() => import('./MultiplayerView')),
})
