import { RiBookOpenLine } from '@remixicon/react'
import { lazyView, registerModule } from '../../app/moduleRegistry'

registerModule({
  id: 'learn',
  label: 'Learn',
  icon: RiBookOpenLine,
  route: '/learn',
  component: lazyView(() => import('./LearnView')),
})
