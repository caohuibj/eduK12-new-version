import {render,screen} from '@testing-library/react'
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
  it('discards an arbitrary return destination and retains the generic enrollment route',()=>{
    render(<MemoryRouter initialEntries={['/admin/security/enroll?returnTo=https%3A%2F%2Fexample.com']}><AdminKeyEnrollment/></MemoryRouter>)
    expect(screen.getByRole('link',{name:'前往管理员登录'})).toHaveAttribute('href','/admin/login')
    expect(screen.queryByRole('link',{name:'Research 首页'})).not.toBeInTheDocument()
  })
})
