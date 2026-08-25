import { lazy } from 'react'
import { RiRefreshLine } from '@remixicon/react'
import { registerModule } from '../../app/moduleRegistry'
import './sync.css'

registerModule({
  id: 'sync',
  label: 'Sync',
  icon: RiRefreshLine,
  route: '/sync',
  component: lazy(() => import('./SyncView')),
})
