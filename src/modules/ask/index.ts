import { RiQuestionAnswerLine } from '@remixicon/react'
import { lazyView, registerModule } from '../../app/moduleRegistry'
import './ask.css'

registerModule({
  id: 'ask',
  label: 'Ask',
  icon: RiQuestionAnswerLine,
  route: '/ask',
  component: lazyView(() => import('./AskView')),
})
