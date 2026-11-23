import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {beforeEach,expect,it,vi} from 'vitest'
import {MemoryRouter} from 'react-router-dom'
import TeacherProfile from './TeacherProfile'
const state=vi.hoisted(()=>({user:{id:'trainer',username:'training_trainer',nickname:'测试培训师',role:'TEACHER'},setUser:vi.fn()}))
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}))
vi.mock('../../contexts/AuthContext',()=>({useAuth:()=>state}))
vi.mock('../../api/client',()=>({default:api}))
vi.mock('../../training/context',()=>({isTrainingHost:()=>true}))
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({code:0,data:state.user});api.post.mockResolvedValue({code:0})})
it('clears passwords, validation errors and visibility after cancelling or completing a change',async()=>{
 render(<MemoryRouter><TeacherProfile/></MemoryRouter>)
 await waitFor(()=>expect(screen.getByRole('button',{name:'修改密码'})).toBeVisible())
 fireEvent.click(screen.getByRole('button',{name:'修改密码'}))
 const fill=(confirm='Different789!')=>{fireEvent.change(screen.getByLabelText('原密码',{exact:true}),{target:{value:'OldPass123!'}});fireEvent.change(screen.getByLabelText(/^新密码/),{target:{value:'NewPass456!'}});fireEvent.change(screen.getByLabelText('确认新密码'),{target:{value:confirm}})}
 fill();fireEvent.click(screen.getByRole('button',{name:'显示原密码'}));fireEvent.click(screen.getByRole('button',{name:'显示新密码'}));fireEvent.click(screen.getByRole('button',{name:'确认修改密码'}))
 expect(screen.getByText('两次输入的密码不一致')).toBeVisible();expect(api.post).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'取消'}));fireEvent.click(screen.getByRole('button',{name:'修改密码'}))
 const assertCleared=()=>{for(const placeholder of ['请输入原密码','请输入新密码','请再次输入新密码']){expect(screen.getByPlaceholderText(placeholder)).toHaveValue('');expect(screen.getByPlaceholderText(placeholder)).toHaveAttribute('type','password')}expect(screen.queryByText('两次输入的密码不一致')).not.toBeInTheDocument()}
 assertCleared();fill('NewPass456!');fireEvent.click(screen.getByRole('button',{name:'显示新密码'}));fireEvent.click(screen.getByRole('button',{name:'确认修改密码'}))
 await screen.findByText('密码修改成功');expect(api.post).toHaveBeenCalledExactlyOnceWith('/auth/change-password',{oldPassword:'OldPass123!',newPassword:'NewPass456!'})
 fireEvent.click(screen.getByRole('button',{name:'修改密码'}));assertCleared()
})
