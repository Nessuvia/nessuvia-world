import { RiCloudLine } from '@remixicon/react'
import { lazyView, registerModule } from '../../app/moduleRegistry'
import './sync.css'

registerModule({
  id: 'sync',
  label: 'Online Sync',
  icon: RiCloudLine,
  route: '/sync',
  component: lazyView(() => import('./SyncView')),
})
