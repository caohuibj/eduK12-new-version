import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import {MemoryRouter,Route,Routes} from 'react-router-dom'
import StudentProfile from './StudentProfile'
const state=vi.hoisted(()=>({user:{id:'admin-1',username:'training_manager',nickname:'测试管理员',role:'STUDENT',businessRole:'STUDENT',entryGrants:[{entry:'TRAINING',version:1}],isActive:true,isFrozen:false,createdAt:'2026-10-01T00:00:00Z'},setUser:vi.fn()}))
const api=vi.hoisted(()=>({get:vi.fn(),put:vi.fn(),post:vi.fn()}))
vi.mock('../../contexts/AuthContext',()=>({useAuth:()=>state}))
vi.mock('../../api/client',()=>({default:api}))
vi.mock('../../training/context',()=>({isTrainingHost:()=>false}))
function mount(admin=true){render(<MemoryRouter initialEntries={['/student/profile']}><Routes><Route path="/student/profile" element={<StudentProfile trainingAdmin={admin}/>}/><Route path="/admin/training/profile" element={<p>Training 管理员资料</p>}/></Routes></MemoryRouter>)}
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({code:0,data:state.user});api.put.mockResolvedValue({code:0,data:{...state.user,nickname:'新的姓名'}});api.post.mockResolvedValue({code:0})})
describe('Training administrator profile',()=>{
 it('keeps the legacy student profile URL as an alias and avoids loading the student form',async()=>{
  mount(false);expect(await screen.findByText('Training 管理员资料')).toBeVisible();expect(api.get).not.toHaveBeenCalled()
 })
 it('shows administrator identity, read-only username and safe account information',async()=>{
  mount();expect(await screen.findByRole('region',{name:'账号资料'})).toBeVisible();expect(screen.getByRole('heading',{name:'个人信息'})).toBeVisible();expect(screen.queryByRole('heading',{name:'账户信息'})).not.toBeInTheDocument()
  expect(screen.getByText('training_manager')).toBeVisible();expect(screen.queryByRole('textbox',{name:'登录账号'})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'保存姓名'})).toBeDisabled();expect(screen.getByText('密码 + Authenticator 动态验证码')).toBeVisible();expect(api.put).not.toHaveBeenCalled()
 })
 it('validates names and updates only the existing nickname field',async()=>{
  mount();const input=await screen.findByLabelText('显示姓名');fireEvent.change(input,{target:{value:'x'}});fireEvent.click(screen.getByRole('button',{name:'保存姓名'}));expect(await screen.findByRole('alert')).toHaveTextContent('中文2-10字');expect(api.put).not.toHaveBeenCalled()
  fireEvent.change(input,{target:{value:'新的姓名'}});fireEvent.click(screen.getByRole('button',{name:'保存姓名'}));expect(await screen.findByRole('status')).toHaveTextContent('姓名修改成功');expect(api.put).toHaveBeenCalledExactlyOnceWith('/users/admin-1',{nickname:'新的姓名'});expect(api.post).not.toHaveBeenCalled()
 })
 it('keeps the edited name after a server error',async()=>{
  api.put.mockRejectedValueOnce({message:'资料保存失败'});mount();fireEvent.change(await screen.findByLabelText('显示姓名'),{target:{value:'保留草稿'}});fireEvent.click(screen.getByRole('button',{name:'保存姓名'}));expect(await screen.findByRole('alert')).toHaveTextContent('资料保存失败');expect(screen.getByLabelText('显示姓名')).toHaveValue('保留草稿')
 })
 it('blocks account changes after an unsuccessful profile read and permits retry',async()=>{
  api.get.mockResolvedValueOnce({code:403,message:'当前登录已过期'});mount();expect(await screen.findByRole('alert')).toHaveTextContent('当前登录已过期');expect(screen.getByRole('button',{name:'修改密码'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'重新加载资料'}));await waitFor(()=>expect(screen.getByRole('button',{name:'修改密码'})).toBeEnabled());expect(api.post).not.toHaveBeenCalled()
 })
 it('validates passwords before submission, clears cancelled entries and preserves the existing change-password contract',async()=>{
  mount();fireEvent.click(await screen.findByRole('button',{name:'修改密码'}));fireEvent.click(screen.getByRole('button',{name:'确认修改密码'}));expect(api.post).not.toHaveBeenCalled();expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
  fireEvent.change(screen.getByLabelText('原密码',{exact:true}),{target:{value:'OldPass123!'}});fireEvent.change(screen.getByLabelText('新密码',{exact:true}),{target:{value:'NewPass456!'}});fireEvent.change(screen.getByLabelText('确认新密码'),{target:{value:'Different789!'}});fireEvent.click(screen.getByRole('button',{name:'确认修改密码'}));expect(screen.getByText('两次输入的密码不一致')).toBeVisible();expect(api.post).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'取消修改'}));fireEvent.click(screen.getByRole('button',{name:'修改密码'}));expect(screen.getByLabelText('原密码',{exact:true})).toHaveValue('')
  fireEvent.change(screen.getByLabelText('原密码',{exact:true}),{target:{value:'OldPass123!'}});fireEvent.change(screen.getByLabelText('新密码',{exact:true}),{target:{value:'NewPass456!'}});fireEvent.change(screen.getByLabelText('确认新密码'),{target:{value:'NewPass456!'}});fireEvent.click(screen.getByRole('button',{name:'确认修改密码'}));expect(await screen.findByRole('status')).toHaveTextContent('密码修改成功');expect(api.post).toHaveBeenCalledExactlyOnceWith('/auth/change-password',{oldPassword:'OldPass123!',newPassword:'NewPass456!'})
 })
})
