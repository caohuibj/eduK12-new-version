import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {SurveyResearchersWorkspace as SurveyResearchersAdmin} from './SurveyResearchersAdmin'
vi.mock('./SurveyCatalogGrants',()=>({SurveyCatalogGrants:()=>null}))
const response=(data:unknown)=>({ok:true,json:async()=>({code:0,data})})
afterEach(()=>vi.unstubAllGlobals())
describe('administrator one-time capability links',()=>{
  it.each([['生成研究者邀请','claim','INVITE'],['密码重置邀请','reset-password','PASSWORD_RESET']])(
    'displays and copies the matching local %s URL',async(label,path,kind)=>{
      const original=window
      vi.stubGlobal('window',new Proxy(original,{get(target,key){return key==='location'?{origin:'http://localhost:5173'}:Reflect.get(target,key)}}))
      const writeText=vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator,'clipboard',{value:{writeText},configurable:true})
      const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
        const url=String(input)
        if(url==='/api/auth/csrf')return response({csrfToken:'synthetic-csrf'})
        if(init?.method==='POST')return response({token:'synthetic-token',kind})
        return response({list:url.includes('/researchers?')?[{id:'r1',username:'synthetic-researcher',status:'ACTIVE'}]:[]})
      })
      vi.stubGlobal('fetch',fetcher)
      render(<SurveyResearchersAdmin/>)
      await screen.findByText('synthetic-researcher')
      fireEvent.change(screen.getByLabelText('当前管理员密码（敏感操作再次验证）'),{target:{value:'synthetic-password'}})
      if(kind==='INVITE')fireEvent.click(screen.getByRole('tab',{name:/邀请 签发/}))
      fireEvent.click(screen.getByRole('button',{name:label==='密码重置邀请'?label+'：synthetic-researcher':label}))
      const link=`http://survey.localhost:5173/${path}#token=synthetic-token`
      expect(await screen.findByText(link)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button',{name:'复制链接'}))
      expect(writeText).toHaveBeenCalledExactlyOnceWith(link)
      await waitFor(()=>expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1))
      for(const [input,init] of fetcher.mock.calls){
        expect(String(input)).toMatch(/^\/api\//)
        expect(init?.credentials).toBe('same-origin')
        expect(String(input)).not.toContain('synthetic-token')
      }
    })
})
