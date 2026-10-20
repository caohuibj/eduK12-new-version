import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'
import AdminLogin from './AdminLogin'
const { me, csrf, login }=vi.hoisted(()=>({me:vi.fn(),csrf:vi.fn(),login:vi.fn()}))
vi.mock('../api/auth',()=>({authApi:{me,csrf,login}}))
function Destination(){const location=useLocation();return <p>destination:{location.pathname}{location.search}</p>}
function mount(path='/admin/login'){
  render(<MemoryRouter initialEntries={[path]}><AuthProvider><Routes>
    <Route path="/admin/login" element={<AdminLogin/>}/><Route path="*" element={<Destination/>}/>
  </Routes></AuthProvider></MemoryRouter>)
}
function submit(){
  fireEvent.change(screen.getByLabelText('管理员账号'),{target:{value:'synthetic-admin'}})
  fireEvent.change(screen.getByLabelText('密码'),{target:{value:'synthetic-password'}})
  fireEvent.click(screen.getByRole('button',{name:'管理员登录'}))
}
beforeEach(()=>{
  vi.clearAllMocks();sessionStorage.clear()
  me.mockRejectedValue(new Error('anonymous'))
  csrf.mockResolvedValue({code:0,data:{csrfToken:'synthetic-csrf'}})
  login.mockResolvedValue({code:0,data:{user:{id:'admin',username:'synthetic-admin',role:'ADMIN',platformRole:'SYSTEM_ADMIN',entryGrants:[{entry:'SURVEY',version:1}]}}})
})
afterEach(()=>vi.unstubAllGlobals())
describe('administrator login flow',()=>{
  it.each(['/admin/login','/admin/login?returnTo=https%3A%2F%2Fevil.test','/admin/login?returnTo=%2Fadmin%2Flogin'])(
    'selects explicit generic auth and a reachable admin fallback for %s',async path=>{
      mount(path);submit()
      expect(await screen.findByText('destination:/admin/permissions')).toBeInTheDocument()
      expect(csrf).toHaveBeenCalledTimes(1)
      expect(login).toHaveBeenCalledExactlyOnceWith({username:'synthetic-admin',password:'synthetic-password'},'admin')
    })
  it('returns the committed administrator identity to Survey governance',async()=>{
    mount('/admin/login?returnTo=%2Fadmin%2Fsurvey-researchers');submit()
    expect(await screen.findByText('destination:/admin/survey-researchers')).toBeInTheDocument()
  })
  it.each([['TEACHER','/admin/entrances'],['STUDENT','/admin/entrances'],['PARENT','/admin/entrances']])(
    'does not promote an authenticated %s into governance',async(role,target)=>{
      login.mockResolvedValue({code:0,data:{user:{id:'ordinary',username:'ordinary',role,platformRole:'STANDARD'}}})
      mount('/admin/login?returnTo=%2Fadmin%2Fsurvey-researchers');submit()
      expect(await screen.findByText('destination:'+target)).toBeInTheDocument()
    })
  it('keeps failed credentials on the form and supports an intentional retry',async()=>{
    login.mockRejectedValueOnce(new Error('密码错误'))
    mount();submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('密码错误')
    await waitFor(()=>expect(screen.getByRole('button',{name:'管理员登录'})).toBeEnabled())
    fireEvent.click(screen.getByRole('button',{name:'管理员登录'}))
    expect(await screen.findByText('destination:/admin/permissions')).toBeInTheDocument()
    expect(login).toHaveBeenCalledTimes(2);expect(csrf).toHaveBeenCalledTimes(2)
  })
  it('does not render credential fields or issue login requests before alias canonicalization',()=>{
    const original=window,replace=vi.fn()
    vi.stubGlobal('window',new Proxy(original,{get(target,key){return key==='location'?{origin:'http://training.localhost:5173',search:'?returnTo=%2Fadmin%2Fsurvey-researchers',replace}:Reflect.get(target,key)}}))
    mount('/admin/login?returnTo=%2Fadmin%2Fsurvey-researchers')
    expect(screen.queryByLabelText('管理员账号')).not.toBeInTheDocument()
    expect(login).not.toHaveBeenCalled();expect(csrf).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledExactlyOnceWith('http://localhost:5173/admin/login?returnTo=%2Fadmin%2Fsurvey-researchers')
  })
})
