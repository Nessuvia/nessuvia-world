import { lazy } from 'react'
import { RiPaletteLine } from '@remixicon/react'
import { registerModule } from '../../app/moduleRegistry'
import { tabs } from './tabs'

registerModule({
  id: 'appearance',
  label: 'Palette',
  icon: RiPaletteLine,
  route: '/appearance',
  component: lazy(() => import('./AppearanceView')),
  tabs,
})
