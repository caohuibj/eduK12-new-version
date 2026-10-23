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
  fireEvent.change(screen.getByLabelText('Authenticator 六位动态码'),{target:{value:'123456'}})
  fireEvent.click(screen.getByRole('button',{name:'管理员登录'}))
}
beforeEach(()=>{
  vi.clearAllMocks();sessionStorage.clear();localStorage.clear();window.history.replaceState(null,'','/')
  me.mockRejectedValue(new Error('anonymous'))
  csrf.mockResolvedValue({code:0,data:{csrfToken:'synthetic-csrf'}})
  login.mockResolvedValue({code:0,data:{user:{id:'admin',username:'synthetic-admin',role:'ADMIN',platformRole:'SYSTEM_ADMIN',entryGrants:[{entry:'SURVEY',version:1}]}}})
})
afterEach(()=>vi.unstubAllGlobals())
describe('administrator login flow',()=>{
  it('keeps Survey appearance through login and enrollment without theming the generic entry',async()=>{
    window.history.replaceState(null,'','/admin/login?returnTo=%2Fadmin%2Fsurvey-researchers&appearance=dark')
    mount('/admin/login?returnTo=%2Fadmin%2Fsurvey-researchers&appearance=dark')
    expect(document.querySelector('.survey-appearance-root')).toHaveAttribute('data-survey-theme','dark')
    expect(screen.getByRole('link',{name:'首次绑定 Authenticator'})).toHaveAttribute('href','/admin/security/enroll?returnTo=%2Fadmin%2Fsurvey-researchers&appearance=dark')
    fireEvent.click(screen.getByRole('button',{name:'外观：深色，点击切换为自动'}))
    expect(screen.getByRole('link',{name:'首次绑定 Authenticator'})).toHaveAttribute('href','/admin/security/enroll?returnTo=%2Fadmin%2Fsurvey-researchers&appearance=auto')
    submit()
    expect(await screen.findByText('destination:/admin/survey-researchers')).toBeInTheDocument()
  })
  it.each(['/admin/login','/admin/login?returnTo=https%3A%2F%2Fevil.test','/admin/login?returnTo=%2Fadmin%2Flogin'])(
    'selects explicit generic auth and a reachable admin fallback for %s',async path=>{
      mount(path);submit()
      expect(screen.queryByRole('button',{name:/^外观：/})).not.toBeInTheDocument()
      expect(await screen.findByText('destination:/admin/permissions')).toBeInTheDocument()
      expect(csrf).toHaveBeenCalledTimes(1)
      expect(login).toHaveBeenCalledExactlyOnceWith({username:'synthetic-admin',password:'synthetic-password'},'admin',{method:'TOTP',code:'123456'})
    })
  it('returns the committed administrator identity to Survey governance',async()=>{
    mount('/admin/login?returnTo=%2Fadmin%2Fsurvey-researchers')
    expect(screen.getByRole('link',{name:'Research 首页'}).querySelector('img')).toHaveAttribute('src','/survey/huisurvey-w2-emblem.svg')
    expect(document.querySelector('.survey-admin-entry .survey-entry-panel')).toBeVisible()
    expect(screen.getByRole('navigation',{name:'研究平台导航'})).toBeVisible()
    expect(screen.getByRole('link',{name:'首页'})).toHaveAttribute('href',`http://survey.localhost:${window.location.port}/?appearance=auto`)
    expect(screen.getByRole('button',{name:'如何使用验证器'})).toBeVisible()
    submit()
    expect(await screen.findByText('destination:/admin/survey-researchers')).toBeInTheDocument()
  })
  it('presents Training management and returns a Training-only administrator to its workspace',async()=>{
    login.mockResolvedValue({code:0,data:{user:{id:'training-admin',username:'synthetic-training-admin',role:'ADMIN',businessRole:'STUDENT',platformRole:'STANDARD',entryGrants:[{entry:'TRAINING',version:1}]}}})
    mount('/admin/login?returnTo=%2Fadmin%2Ftraining')
    expect(screen.getByRole('heading',{name:'培训管理员登录'})).toBeVisible()
    expect(screen.getByRole('link',{name:'Training 首页'}).querySelector('img')).toHaveAttribute('alt','Training @EduK12.top')
    expect(screen.getByRole('link',{name:'首次绑定 Authenticator'})).toHaveAttribute('href','/admin/security/enroll?returnTo=%2Fadmin%2Ftraining')
    submit()
    expect(await screen.findByText('destination:/admin/training')).toBeInTheDocument()
    expect(login).toHaveBeenCalledExactlyOnceWith({username:'synthetic-admin',password:'synthetic-password'},'admin',{method:'TOTP',code:'123456'})
  })
  it('preserves the Training return target while moving to the canonical administrator origin',()=>{
    const original=window,replace=vi.fn()
    vi.stubGlobal('window',new Proxy(original,{get(target,key){return key==='location'?{origin:'http://training.localhost:5201',search:'?returnTo=%2Fadmin%2Ftraining',replace}:Reflect.get(target,key)}}))
    mount('/admin/login?returnTo=%2Fadmin%2Ftraining')
    expect(screen.queryByLabelText('管理员账号')).not.toBeInTheDocument()
    expect(replace).toHaveBeenCalledExactlyOnceWith('http://localhost:5201/admin/login?returnTo=%2Fadmin%2Ftraining')
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
    fireEvent.change(screen.getByLabelText('Authenticator 六位动态码'),{target:{value:'123456'}})
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
