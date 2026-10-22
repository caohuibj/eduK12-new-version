import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import {MemoryRouter,Route,Routes,useLocation} from 'react-router-dom'
import {AuthProvider} from '../contexts/AuthContext'
import AdminAccess from './AdminAccess'
import AdminLogin from '../pages/AdminLogin'
const {me,csrf,changePassword,login}=vi.hoisted(()=>({me:vi.fn(),csrf:vi.fn(),changePassword:vi.fn(),login:vi.fn()}))
vi.mock('../api/auth',()=>({authApi:{me,csrf,changePassword,login}}))
function Location(){const location=useLocation();return <p>route:{location.pathname}{location.search}</p>}
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();csrf.mockResolvedValue({code:0});changePassword.mockResolvedValue({code:0})})
describe('mandatory password change for overlapping management identities',()=>{
  it.each(['STUDENT','TEACHER'] as const)('repairs a %s administrator then returns through the admin security-key entrance',async role=>{
    const user={id:'synthetic-management',username:'synthetic-management',role,platformRole:'SYSTEM_ADMIN' as const,entryGrants:[{entry:'SURVEY' as const,version:1}],mustChangePassword:true}
    me.mockResolvedValue({code:0,data:user});login.mockResolvedValue({code:0,data:{user:{...user,mustChangePassword:false}}})
    render(<MemoryRouter initialEntries={['/admin/permissions']}><AuthProvider><Routes>
      <Route path="/admin/permissions" element={<AdminAccess system><h1>Authorized governance</h1></AdminAccess>}/>
      <Route path="/admin/login" element={<><Location/><AdminLogin/></>}/>
    </Routes></AuthProvider></MemoryRouter>)
    await screen.findByRole('heading',{name:'首次登录需要修改密码'})
    expect(screen.queryByText('当前账号没有此入口的管理权限')).toBeNull()
    fireEvent.change(screen.getByLabelText('临时密码'),{target:{value:'SyntheticOld7'}})
    fireEvent.change(screen.getByLabelText('新密码'),{target:{value:'SyntheticNew7'}})
    fireEvent.change(screen.getByLabelText('确认新密码'),{target:{value:'SyntheticNew7'}})
    fireEvent.click(screen.getByRole('button',{name:'修改密码并重新登录'}))
    await screen.findByText('route:/admin/login?returnTo=%2Fadmin%2Fpermissions')
    fireEvent.change(screen.getByLabelText('管理员账号'),{target:{value:user.username}})
    fireEvent.change(screen.getByLabelText('密码'),{target:{value:'SyntheticNew7'}})
    fireEvent.change(screen.getByLabelText('Authenticator 六位动态码'),{target:{value:'123456'}})
    fireEvent.click(screen.getByRole('button',{name:'管理员登录'}))
    await screen.findByRole('heading',{name:'Authorized governance'})
    await waitFor(()=>expect(login).toHaveBeenCalledExactlyOnceWith({username:user.username,password:'SyntheticNew7'},'admin',{method:'TOTP',code:'123456'}))
  })
})
