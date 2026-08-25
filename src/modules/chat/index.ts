import { lazy } from 'react'
import { RiChat3Line } from '@remixicon/react'
import { registerModule } from '../../app/moduleRegistry'
import './chat.css'

registerModule({
  id: 'chat',
  label: 'Chat',
  icon: RiChat3Line,
  route: '/chat',
  component: lazy(() => import('./ChatModule')),
})
