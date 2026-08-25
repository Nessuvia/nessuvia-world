import { lazy } from 'react'
import { RiUserLine } from '@remixicon/react'
import { registerModule } from '../../app/moduleRegistry'
import './personas.css'

registerModule({
  id: 'personas',
  label: 'Personas',
  icon: RiUserLine,
  route: '/personas',
  component: lazy(() => import('./PersonasView')),
})
