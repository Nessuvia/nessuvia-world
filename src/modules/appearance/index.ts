import { RiPaletteLine } from '@remixicon/react'
import { lazyView, registerModule } from '../../app/moduleRegistry'
import { tabs } from './tabs'

registerModule({
  id: 'appearance',
  label: 'Palette',
  icon: RiPaletteLine,
  route: '/appearance',
  component: lazyView(() => import('./AppearanceView')),
  tabs,
})
