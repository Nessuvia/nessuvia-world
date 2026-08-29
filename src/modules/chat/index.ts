import { RiChat3Line } from '@remixicon/react'
import { lazyView, registerModule } from '../../app/moduleRegistry'
import './chat.css'

registerModule({
  id: 'chat',
  label: 'Chat',
  icon: RiChat3Line,
  route: '/chat',
  component: lazyView(() => import('./ChatModule')),
})
