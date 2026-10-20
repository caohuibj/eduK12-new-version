import {beforeEach,describe,expect,it,vi} from 'vitest'
import {render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter,Route,Routes,useLocation,Link} from 'react-router-dom'
const {me}=vi.hoisted(()=>({me:vi.fn()}))
vi.mock('../api/auth',()=>({authApi:{me,csrf:vi.fn(),logout:vi.fn(),login:vi.fn()}}))
import {AuthProvider,AccountViewProvider,useAuth} from '../contexts/AuthContext'
import {RouteAccess} from '../components/app-shell/RouteAccess'
import AdminAccess from './AdminAccess'
import AdminTrainingWorkspace from '../pages/admin/AdminTrainingWorkspace'
import {accountView} from './accountView'
import {adminNavigation} from './navigation'
import type {User} from '../types'
const identity=(businessRole:User['role'],system=false):User=>({id:'overlap',username:'synthetic',role:'ADMIN',businessRole,
  platformRole:system?'SYSTEM_ADMIN':'STANDARD',entryGrants:system?[]:[{entry:'TRAINING',version:1}]})
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();window.history.replaceState(null,'','/')})
function Frame(){
  const location=useLocation()
  return <AccountViewProvider view={accountView(location.pathname,location.search)}><Links/><Routes>
    <Route path="/admin/training" element={<AdminAccess entries={['TRAINING']}><p>management allowed</p></AdminAccess>}/>
    <Route path="/student" element={<RouteAccess roles={['STUDENT']}><p>student allowed</p></RouteAccess>}/>
    <Route path="/teacher/situational" element={<RouteAccess roles={['TEACHER']}><p>teacher allowed</p></RouteAccess>}/>
    <Route path="/admin/reporting-content" element={<AdminAccess system><p>reporting governance allowed</p></AdminAccess>}/>
  </Routes></AccountViewProvider>
}
function Links(){const {user}=useAuth();return <><output>{user?.role??'waiting'}</output><Link to="/admin/training">management</Link><Link to="/student">student</Link><Link to="/teacher/situational">teacher</Link></>}
describe('Training grant and business identity coexist without broad role admission',()=>{
  it.each(['STUDENT','TEACHER'] as const)('%s business deep link and management switch preserve their separate identities',async role=>{
    const user=identity(role);me.mockResolvedValue({code:0,data:user})
    const initial=role==='STUDENT'?'/student':'/teacher/situational'
    render(<AuthProvider><MemoryRouter initialEntries={[initial]}><Frame/></MemoryRouter></AuthProvider>)
    await screen.findByText(role==='STUDENT'?'student allowed':'teacher allowed')
    expect(screen.getByRole('status')).toHaveTextContent(role)
    const navigation=adminNavigation(user)
    expect(navigation.some(x=>x.path===(role==='STUDENT'?'/student':'/dashboard')+'?workspace=business')).toBe(true)
    await userEvent.click(screen.getByRole('link',{name:'management'}))
    await screen.findByText('management allowed');expect(screen.getByRole('status')).toHaveTextContent('ADMIN')
    await userEvent.click(screen.getByRole('link',{name:role==='STUDENT'?'teacher':'student'}))
    await screen.findByText('当前账户无法访问此页面')
  })
  it('an ADMIN business label cannot enter a student page merely through a management grant',async()=>{
    me.mockResolvedValue({code:0,data:identity('ADMIN')})
    render(<AuthProvider><MemoryRouter initialEntries={['/student']}><Frame/></MemoryRouter></AuthProvider>)
    await screen.findByText('当前账户无法访问此页面')
    expect(screen.queryByText('student allowed')).not.toBeInTheDocument()
  })
  it.each([true,false])('reporting governance follows only SYSTEM_ADMIN, system=%s',async system=>{
    const user=identity('STUDENT',system);me.mockResolvedValue({code:0,data:user})
    render(<AuthProvider><MemoryRouter initialEntries={['/admin/reporting-content']}><Frame/></MemoryRouter></AuthProvider>)
    if(system)await screen.findByText('reporting governance allowed')
    else await screen.findByText('当前账号没有此入口的管理权限')
    expect(adminNavigation(user).some(x=>x.path==='/admin/reporting-content')).toBe(system)
  })
  it('Training workspace does not advertise system reporting governance',async()=>{
    render(<MemoryRouter><AdminTrainingWorkspace/></MemoryRouter>)
    await waitFor(()=>expect(screen.queryByRole('link',{name:/报告方案与内容审核/})).not.toBeInTheDocument())
    expect(screen.queryByRole('heading',{name:'内容审核与报告配置'})).not.toBeInTheDocument()
  })
  it('retains an explicit tab view across shared-page navigation and refresh',()=>{
    expect(accountView('/admin/training','')).toBe('MANAGEMENT')
    expect(accountView('/courses','')).toBe('MANAGEMENT')
    expect(accountView('/dashboard','?workspace=business')).toBe('BUSINESS')
    expect(accountView('/courses','')).toBe('BUSINESS')
    expect(accountView('/courses','?workspace=training')).toBe('MANAGEMENT')
    expect(accountView('/student','')).toBe('BUSINESS')
  })
})
