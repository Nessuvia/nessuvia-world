import { lazy } from 'react'
import { RiStackLine } from '@remixicon/react'
import { registerModule } from '../../app/moduleRegistry'

registerModule({
  id: 'prompts',
  label: 'Prompts',
  icon: RiStackLine,
  route: '/prompts',
  tabs: [
    ['stacks', 'Stacks'],
    ['misc', 'Misc Prompts'],
  ],
  component: lazy(() => import('./StackEditor')),
})
