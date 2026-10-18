import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SurveyApp from './SurveyApp'
vi.mock('./SurveyBuilder',()=>({SurveyBuilder:()=>null}))
vi.mock('./SurveyWaveStudio',()=>({SurveyWaveStudio:()=>null}))
vi.mock('./SurveyAnalyticsWorkspace',()=>({SurveyAnalyticsWorkspace:()=>null}))
afterEach(()=>vi.unstubAllGlobals())
describe('Survey administrator entry link',()=>{
  it.each([
    ['http://survey.localhost:5173','http://localhost:5173'],
    ['https://survey.eduk12.top','https://training.eduk12.top'],
    ['http://unknown.localhost:5173',null],
  ])('renders the trusted target for %s',async(origin,admin)=>{
    window.history.replaceState(null,'','/login')
    const original=window,location=window.location
    vi.stubGlobal('window',new Proxy(original,{get(target,key){return key==='location'?new Proxy(location,{get(loc,prop){return prop==='origin'?origin:Reflect.get(loc,prop)}}):Reflect.get(target,key)}}))
    const fetcher=vi.fn(async()=>({ok:false,json:async()=>({code:401,message:'anonymous'})}))
    vi.stubGlobal('fetch',fetcher)
    render(<SurveyApp/> )
    await screen.findByRole('heading',{name:'Researcher 登录'})
    if(admin)expect(screen.getByRole('link',{name:'系统管理员入口：研究者与工具授权'})).toHaveAttribute('href',admin+'/admin/login?returnTo=%2Fadmin%2Fsurvey-researchers')
    else{
      expect(screen.queryByRole('link',{name:'系统管理员入口：研究者与工具授权'})).not.toBeInTheDocument()
      expect(screen.getByText('当前地址未配置管理员入口。')).toBeInTheDocument()
    }
    expect(fetcher).toHaveBeenCalledTimes(2) // Existing me + capabilities; link resolution adds no requests.
  })
})
