import {render,screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {expect,it} from 'vitest'
import TrainingWorkspaceTabs from './TrainingWorkspaceTabs'
import {routeTitle} from '../components/app-shell/navigation'
it.each(['/questionnaire-products','/questionnaires','/composite-assessments/id','/bundle-products'])('marks tools active at %s',path=>{
 render(<MemoryRouter initialEntries={[path]}><TrainingWorkspaceTabs/></MemoryRouter>)
 expect(screen.getByRole('link',{name:'工具'})).toHaveAttribute('aria-current','page')
 expect(screen.getByRole('link',{name:'课程'})).not.toHaveAttribute('aria-current')
})
it('names the questionnaire and bundle directories without a product fallback',()=>{
 expect(routeTitle('/questionnaires')).toBe('组合测评')
 expect(routeTitle('/bundle-products')).toBe('固定测评包')
})
it.each(['/teacher/classrooms','/teacher/classrooms/create','/teacher/classrooms/room/control','/teacher/classrooms/room/questions','/teacher/classrooms/room/qrcode','/teacher/classrooms/room/edit'])(
 'keeps the interaction tab active at %s',path=>{
  render(<MemoryRouter initialEntries={[path]}><TrainingWorkspaceTabs/></MemoryRouter>)
  expect(screen.getByRole('link',{name:'互动',current:'page'})).toHaveAttribute('href','/teacher/classrooms')
  expect(screen.getAllByRole('link',{current:'page'})).toHaveLength(1)
 },
)
