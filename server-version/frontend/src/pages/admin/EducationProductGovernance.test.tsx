import {render,screen,fireEvent} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import type {User} from '../../types'
import EducationProductGovernance from './EducationProductGovernance'
const state=vi.hoisted(()=>({user:null as User|null}))
vi.mock('../../contexts/AuthContext',()=>({useAuth:()=>state}))
vi.mock('../../api/client',()=>({sessionFetch:vi.fn()}))
vi.mock('../../admin/securityKey',()=>({reauthenticateAdmin:vi.fn()}))
beforeEach(()=>{state.user={id:'admin',username:'admin',role:'TEACHER',platformRole:'STANDARD',entryGrants:[{entry:'HUISCHOOL',version:1},{entry:'HUITEACHER',version:1}]} as User})
describe('education product governance presentation',()=>{
 it.each([['HUISCHOOL','School'],['HUITEACHER','Teacher']] as const)('keeps %s sensitive verification collapsed without clearing the draft',(product,brand)=>{
  render(<MemoryRouter><EducationProductGovernance product={product}/></MemoryRouter>)
  expect(screen.getByText(`${brand} · 管理员工作台`)).toBeInTheDocument()
  const summary=screen.getByText('管理员安全验证')
  expect(summary.closest('details')).not.toHaveAttribute('open')
  fireEvent.click(summary)
  const input=screen.getByLabelText('Authenticator 六位动态码')
  fireEvent.change(input,{target:{value:'123456'}})
  fireEvent.click(summary)
  expect(input).not.toBeVisible()
  fireEvent.click(summary)
  expect(input).toHaveValue('123456')
 })
 it('does not show management or verification when the exact product grant is absent',()=>{
  state.user={id:'ordinary',username:'ordinary',role:'TEACHER',platformRole:'STANDARD',entryGrants:[{entry:'HUITEACHER',version:1}]} as User
  render(<MemoryRouter><EducationProductGovernance product="HUISCHOOL"/></MemoryRouter>)
  expect(screen.getByRole('alert')).toHaveTextContent('需要当前学校产品的入口管理授权')
  expect(screen.queryByText('管理员安全验证')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('学校 Organization UUID')).not.toBeInTheDocument()
 })
})
