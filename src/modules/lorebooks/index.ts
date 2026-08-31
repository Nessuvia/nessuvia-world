import { RiBook2Line } from '@remixicon/react'
import { lazyView, registerModule } from '../../app/moduleRegistry'
import LorebooksPanel from './LorebooksPanel'
import './lorebooks.css'

registerModule({
  id: 'lorebooks',
  label: 'Lorebooks',
  icon: RiBook2Line,
  route: '/lorebooks',
  component: lazyView(() => import('./LorebooksView')),
  chatPanels: [{ label: 'Lorebooks', component: LorebooksPanel }],
})
