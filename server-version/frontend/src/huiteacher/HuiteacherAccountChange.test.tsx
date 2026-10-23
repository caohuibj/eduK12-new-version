import {afterEach,describe,expect,it,vi} from 'vitest'
import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import HuiteacherApp from './HuiteacherApp'

const reply=(data:unknown)=>({ok:true,json:async()=>({code:0,message:'操作成功',data})})
afterEach(()=>vi.unstubAllGlobals())
describe('Teacher shared education account recovery',()=>{
  it('shows forced password change without loading school management data',async()=>{
    const calls:Array<{url:string;body?:unknown}>=[]
    vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>{
      calls.push({url,body:options?.body?JSON.parse(String(options.body)):undefined})
      if(url.endsWith('/auth/me'))return reply({
        id:'shared-user',username:'teacher.member',role:'TEACHER',
        product:'HUITEACHER',mustChangePassword:true,organizations:[],
      })
      if(url.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic-teacher-csrf'})
      if(url.endsWith('/auth/change-password'))return reply(null)
      return reply(null)
    }))
    render(<HuiteacherApp/>)
    await screen.findByRole('heading',{name:'首次登录 · 修改教育账号密码'})
    expect(calls.filter(c=>c.url.includes('/organizations/'))).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('当前密码'),{target:{value:'CurrentPass123'}})
    fireEvent.change(screen.getByLabelText('新密码'),{target:{value:'NewPass456'}})
    fireEvent.click(screen.getByRole('button',{name:'确认修改密码'}))
    await waitFor(()=>expect(calls.find(c=>c.url.endsWith('/auth/change-password'))?.body)
      .toEqual({oldPassword:'CurrentPass123',newPassword:'NewPass456'}))
    expect(await screen.findByRole('heading',{name:'登录 Teacher'})).toBeInTheDocument()
  })
})
