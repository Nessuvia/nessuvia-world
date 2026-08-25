import { lazy } from 'react'
import { RiBookOpenLine } from '@remixicon/react'
import { registerModule } from '../../app/moduleRegistry'

registerModule({
  id: 'learn',
  label: 'Learn',
  icon: RiBookOpenLine,
  route: '/learn',
  component: lazy(() => import('./LearnView')),
})
