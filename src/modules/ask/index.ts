import { lazy } from 'react'
import { RiQuestionAnswerLine } from '@remixicon/react'
import { registerModule } from '../../app/moduleRegistry'
import './ask.css'

registerModule({
  id: 'ask',
  label: 'Ask',
  icon: RiQuestionAnswerLine,
  route: '/ask',
  component: lazy(() => import('./AskView')),
})
