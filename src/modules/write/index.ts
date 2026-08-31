import { RiBookLine } from '@remixicon/react'
import { lazyView, registerModule } from '../../app/moduleRegistry'
import './write.css'

registerModule({
  id: 'write',
  label: 'Write',
  icon: RiBookLine,
  route: '/write',
  component: lazyView(() => import('./WriteView')),
})
