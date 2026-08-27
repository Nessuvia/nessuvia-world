import { lazy } from 'react'
import { RiCloudLine } from '@remixicon/react'
import { registerModule } from '../../app/moduleRegistry'
import './sync.css'

registerModule({
  id: 'sync',
  label: 'Online Sync',
  icon: RiCloudLine,
  route: '/sync',
  component: lazy(() => import('./SyncView')),
})
