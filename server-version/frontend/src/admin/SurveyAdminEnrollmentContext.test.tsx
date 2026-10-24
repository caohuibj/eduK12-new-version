import {fireEvent,render,screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {describe,expect,it,vi} from 'vitest'
import AdminKeyEnrollment from './AdminKeyEnrollment'
vi.mock('./securityKey',()=>({beginTotpEnrollment:vi.fn(),confirmTotpEnrollment:vi.fn(),enrollSecurityKey:vi.fn()}))
vi.mock('../api/client',()=>({default:{get:vi.fn()}}))
describe('Survey administrator enrollment return context',()=>{
  it('keeps the Survey brand and trusted return path through initial enrollment',()=>{
    render(<MemoryRouter initialEntries={['/admin/security/enroll?returnTo=%2Fadmin%2Fsurvey-researchers']}><AdminKeyEnrollment/></MemoryRouter>)
    expect(screen.getByRole('link',{name:'Research 首页'}).querySelector('img')).toHaveAttribute('src','/survey/huisurvey-w2-emblem.svg')
    expect(screen.getByRole('link',{name:'前往管理员登录'})).toHaveAttribute('href','/admin/login?returnTo=%2Fadmin%2Fsurvey-researchers&appearance=auto')
    expect(screen.getByLabelText('一次性绑定码')).toBeRequired()
  })
  it('keeps the Training return without applying Survey entry chrome',()=>{
    render(<MemoryRouter initialEntries={['/admin/security/enroll?returnTo=%2Fadmin%2Ftraining']}><AdminKeyEnrollment/></MemoryRouter>)
    expect(screen.getByRole('link',{name:'前往管理员登录'})).toHaveAttribute('href','/admin/login?returnTo=%2Fadmin%2Ftraining')
    expect(screen.queryByRole('link',{name:'Research 首页'})).not.toBeInTheDocument()
    expect(screen.getByRole('heading',{name:'Training 管理员首次绑定'})).toBeInTheDocument()
    expect(screen.getByRole('link',{name:'Training 首页'})).toHaveAttribute('href',expect.stringMatching(/^http:\/\/training\.localhost(?::\d+)?\/$/))
    expect(screen.getByRole('list',{name:'首次绑定步骤'})).toHaveTextContent('1填写凭据2绑定验证器3返回登录')
    expect(screen.getByText('请检查浏览器自动填充的账号，避免误用 Survey 管理员或培训师账号。')).toBeInTheDocument()
    expect(screen.getByText(/以后登录也需要手机动态码/)).toBeInTheDocument()
    expect(screen.getByRole('heading',{name:'Training 管理员首次绑定'}).closest('.training-admin-auth')).not.toBeNull()
  })
  it('explains the selected first-time method without changing account authority',()=>{
    render(<MemoryRouter initialEntries={['/admin/security/enroll?returnTo=%2Fadmin%2Ftraining']}><AdminKeyEnrollment/></MemoryRouter>)
    expect(screen.getByText('第一次使用？查看 Authenticator 操作说明')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('验证方式'),{target:{value:'SECURITY_KEY'}})
    expect(screen.getByText('第一次使用？查看硬件安全密钥操作说明')).toBeInTheDocument()
    expect(screen.getByText('准备支持 FIDO2 的实体安全密钥，并连接到当前电脑或手机。')).toBeInTheDocument()
    expect(screen.queryByText(/以后登录也需要手机动态码/)).not.toBeInTheDocument()
  })
  it('discards an arbitrary return destination and retains the generic enrollment route',()=>{
    render(<MemoryRouter initialEntries={['/admin/security/enroll?returnTo=https%3A%2F%2Fexample.com']}><AdminKeyEnrollment/></MemoryRouter>)
    expect(screen.getByRole('link',{name:'前往管理员登录'})).toHaveAttribute('href','/admin/login')
    expect(screen.queryByRole('link',{name:'Research 首页'})).not.toBeInTheDocument()
  })
})

describe('education administrator enrollment context',()=>{
 it.each([['School','/admin/huischool'],['Teacher','/admin/huiteacher']])('preserves %s branding and login target without changing enrollment requirements',(brand,path)=>{
  render(<MemoryRouter initialEntries={['/admin/security/enroll?returnTo='+encodeURIComponent(path)]}><AdminKeyEnrollment/></MemoryRouter>)
  expect(document.querySelector('.education-admin-entry')).toHaveAttribute('data-product',brand)
  expect(screen.getByRole('link',{name:'前往管理员登录'})).toHaveAttribute('href','/admin/login?returnTo='+encodeURIComponent(path))
  expect(screen.getByRole('link',{name:`返回 ${brand} 管理员登录`})).toHaveAttribute('href','/admin/login?returnTo='+encodeURIComponent(path))
  expect(screen.getByLabelText('一次性绑定码')).toBeRequired()
 })
})

it('preserves neutral system enrollment context without using Survey chrome',()=>{
 render(<MemoryRouter initialEntries={['/admin/security/enroll?returnTo=%2Fadmin%2Fsystem']}><AdminKeyEnrollment/></MemoryRouter>)
 expect(screen.getByRole('heading',{name:'系统管理员验证器绑定'})).toBeVisible()
 expect(document.querySelector('.system-admin-auth')).not.toBeNull()
 expect(screen.queryByRole('link',{name:'Research 首页'})).not.toBeInTheDocument()
 expect(screen.getByRole('link',{name:'前往管理员登录'})).toHaveAttribute('href','/admin/login?returnTo=%2Fadmin%2Fsystem')
 expect(screen.getByLabelText('一次性绑定码')).toBeRequired()
})
