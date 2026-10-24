import {fireEvent,render,screen} from '@testing-library/react'
import {MemoryRouter,Route,Routes,useLocation} from 'react-router-dom'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import type {User} from '../../types'
import AdminTrainingWorkspace from './AdminTrainingWorkspace'
import AdminAccess from '../../admin/AdminAccess'
import {trainingAdminPages} from '../../admin/trainingPages'
import {adminReturnTo} from '../../admin/authority'
import {navigationFor} from '../../components/app-shell/navigation'
import {returnAfterLogin} from '../../components/app-shell/access'
const loads=vi.hoisted(()=>({accounts:vi.fn(),codes:vi.fn(),courses:vi.fn(),resources:vi.fn()}))
const auth=vi.hoisted(()=>({user:null as User|null,isLoading:false}))
vi.mock('../../contexts/AuthContext',()=>({useAuth:()=>auth}))
vi.mock('../UserList',()=>{loads.accounts();return {default:()=> <section aria-label="账号列表与审核"><p>实际账号管理</p></section>}})
vi.mock('../../training/TrainingAdminResources',()=>{loads.resources();return {default:({pageTitle='资源与授权'}:{pageTitle?:string})=> <><h1>{pageTitle}</h1><section aria-label="资源目录与授权管理"><p>实际资源管理</p></section></>}})
vi.mock('../../training/TrainingAdminCourses',()=>{loads.courses();return {default:({pageTitle}:{pageTitle?:string})=> <><h1>{pageTitle}</h1><section aria-label="课程列表与监管"><p>实际课程监管</p></section></>}})
vi.mock('../TeacherCodeList',()=>{loads.codes();return {default:()=> <p>实际注册码管理</p>}})
const manager={id:'training-admin',username:'training-admin',role:'STUDENT',platformRole:'STANDARD',entryGrants:[{entry:'TRAINING',version:1}]} as User
function Location(){const location=useLocation();return <output aria-label="当前路由">{location.pathname}{location.search}</output>}
function mount(path='/admin/training'){
 render(<MemoryRouter initialEntries={[path]}><Location/><Routes><Route path="/admin/training" element={<AdminAccess entries={['TRAINING']}><AdminTrainingWorkspace/></AdminAccess>}/>{trainingAdminPages.map(page=><Route key={page.key} path={page.path} element={<AdminAccess entries={['TRAINING']}><AdminTrainingWorkspace/></AdminAccess>}/>)}<Route path="/admin/login" element={<p>管理员登录</p>}/></Routes></MemoryRouter>)
}
beforeEach(()=>{auth.user=manager})
describe('Training management pages',()=>{
 it('loads no workspace modules behind a denied entry',()=>{
  auth.user={...manager,entryGrants:[{entry:'SURVEY',version:1}]}
  mount('/admin/training/accounts')
  expect(screen.getByText('当前账号没有此入口的管理权限')).toBeInTheDocument()
  for(const load of Object.values(loads))expect(load).not.toHaveBeenCalled()
 })
 it('loads only accounts on first entry and preserves it while opening codes',async()=>{
  mount('/admin/training/accounts')
  expect(await screen.findByRole('region',{name:'账号列表与审核'})).toBeInTheDocument()
  expect(loads.accounts).toHaveBeenCalledTimes(1)
  for(const load of [loads.codes,loads.courses,loads.resources])expect(load).not.toHaveBeenCalled()
  const codes=screen.getByText('培训师注册码管理').closest('details')!
  codes.open=true;fireEvent(codes,new Event('toggle'))
  expect(screen.getByRole('region',{name:'账号列表与审核'})).toBeInTheDocument()
  expect(await screen.findByText('实际注册码管理')).toBeInTheDocument()
  expect(loads.codes).toHaveBeenCalledTimes(1)
  expect(loads.courses).not.toHaveBeenCalled();expect(loads.resources).not.toHaveBeenCalled()
 })
 it('opens registration codes for a direct hash destination',async()=>{
  mount('/admin/training/accounts#training-registration-codes')
  expect(await screen.findByText('实际注册码管理')).toBeInTheDocument()
  expect(screen.getByText('培训师注册码管理').closest('details')).toHaveAttribute('open')
 })
 it('retains the admin menu and legacy return gate',()=>{
  expect(navigationFor('ADMIN',false).some(item=>item.path==='/admin/training')).toBe(true)
  expect(navigationFor('TEACHER',false).some(item=>item.path==='/admin/training')).toBe(false)
  expect(returnAfterLogin('/admin/training/resources','ADMIN')).toBe('/admin/training/resources')
  expect(returnAfterLogin('/admin/training/resources','TEACHER')).toBe('/dashboard')
 })
 it('redirects the former explanation homepage directly to account management',async()=>{
  mount()
  expect(await screen.findByLabelText('当前路由')).toHaveTextContent('/admin/training/accounts')
  expect(await screen.findByRole('region',{name:'账号列表与审核'})).toBeVisible()
  expect(screen.queryByRole('heading',{name:'培训有序，管理有据。'})).not.toBeInTheDocument()
 })
 it('embeds actual account management instead of legacy entry links',async()=>{
  mount('/admin/training/accounts')
  expect(await screen.findByRole('region',{name:'账号列表与审核'})).toBeInTheDocument()
  expect(document.querySelector('a[href^="/users"]')).toBeNull()
  expect(document.querySelector('a[href^="/teacher-codes"]')).toBeNull()
  const codes=screen.getByText('培训师注册码管理').closest('details')!
  fireEvent(codes,new Event('toggle'))
 })
 it('embeds course supervision directly without an intermediate course-list destination',async()=>{
  mount('/admin/training/courses')
  expect(await screen.findByRole('heading',{level:1,name:'课程监管'})).toBeInTheDocument()
  expect(screen.getByRole('region',{name:'课程列表与监管'})).toBeInTheDocument()
  expect(document.querySelector('a[href^="/courses"]')).toBeNull()
  expect(adminReturnTo(manager,'/admin/training/courses')).toBe('/admin/training/courses')
 })
 it('embeds resource management without legacy entry links',async()=>{
  mount('/admin/training/resources')
  expect(await screen.findByRole('heading',{level:1,name:'资源与授权'})).toBeInTheDocument()
  expect(await screen.findByRole('region',{name:'资源目录与授权管理'})).toBeInTheDocument()
  for(const path of ['/scales','/cognitive-assignments','/bundle-products','/admin/material-grants','/admin/instrument-authorizations'])expect(document.querySelector('a[href^="'+path+'"]')).toBeNull()
  expect(adminReturnTo(manager,'/admin/training/resources')).toBe('/admin/training/resources')
  expect(adminReturnTo(manager,'/admin/training/profile')).toBe('/admin/training/profile')
 })
 it.each(['accounts','courses','resources'])('redirects the old %s section link to its dedicated page',async key=>{
  mount('/admin/training#training-admin-'+key)
  expect(await screen.findByLabelText('当前路由')).toHaveTextContent('/admin/training/'+key)
 })
 it.each(['accounts','courses','resources'])('keeps %s behind its explicit Training grant',key=>{
  auth.user={...manager,entryGrants:[{entry:'SURVEY',version:1}]}
  mount('/admin/training/'+key)
  expect(screen.getByText('当前账号没有此入口的管理权限')).toBeInTheDocument()
  expect(screen.queryByRole('region')).not.toBeInTheDocument()
  expect(adminReturnTo(auth.user,'/admin/training/'+key)).toBe('/admin/entrances')
 })
 it('preserves the resource page destination when authentication is needed',()=>{
  auth.user=null;mount('/admin/training/resources')
  expect(screen.getByLabelText('当前路由')).toHaveTextContent('/admin/login?returnTo=%2Fadmin%2Ftraining%2Fresources')
 })
 it('keeps the resource data-boundary help available on demand',async()=>{
  mount('/admin/training/resources')
  const boundary=screen.getByText('管理范围与数据边界').closest('details')!
  expect(boundary).not.toHaveAttribute('open')
  fireEvent.click(screen.getByText('管理范围与数据边界'))
  expect(boundary).toHaveAttribute('open')
  expect(screen.getByText(/培训师拥有材料使用权不代表可以读取全部学员/)).toBeVisible()
 })
})
