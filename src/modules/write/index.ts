import { lazy } from 'react'
import { RiBookLine } from '@remixicon/react'
import { registerModule } from '../../app/moduleRegistry'
import './write.css'

registerModule({
  id: 'write',
  label: 'Write',
  icon: RiBookLine,
  route: '/write',
  component: lazy(() => import('./WriteView')),
})
