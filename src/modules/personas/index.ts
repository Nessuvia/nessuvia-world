import { RiUserLine } from '@remixicon/react'
import { lazyView, registerModule } from '../../app/moduleRegistry'
import './personas.css'

registerModule({
  id: 'personas',
  label: 'Personas',
  icon: RiUserLine,
  route: '/personas',
  component: lazyView(() => import('./PersonasView')),
})
