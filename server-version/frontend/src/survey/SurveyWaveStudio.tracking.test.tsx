import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,it,expect,vi} from 'vitest'
import {SurveyWaveStudio} from './SurveyWaveStudio'
vi.mock('./SurveyFlowStudio',()=>({SurveyFlowStudio:()=>null}))
const id='00000000-0000-4000-8000-000000000001'
const wave={id:'w1',projectId:'p',title:'T1',ordinal:1,status:'DRAFT',revision:0,instrumentIds:[id],publicationId:null,
  consentText:'本合成研究使用编号关联各轮回答，自愿参加，并单独控制本人指标披露。',generalText:'谢谢',consentVersion:1,linkageNoticeConfirmed:true,
  opensAt:null,closesAt:null,finishUntil:null,quotaStarts:null,startsCount:0,allowNewParticipants:false,hardStopAt:null}
afterEach(()=>vi.unstubAllGlobals())
describe('Survey tracking publisher selection',()=>{
  it('requires a selected leaf metric and sends tracking independently of ordinary numeric disclosure',async()=>{
    const requests:Array<{url:string;body:any}>=[]
    const response=(data:unknown)=>({ok:true,status:200,json:async()=>({code:0,data})})
    vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      const url=String(input),body=init?.body?JSON.parse(String(init.body)):undefined;requests.push({url,body})
      if(url.endsWith('/auth/csrf'))return response({csrfToken:'csrf'})
      if(url.includes('/package-memberships?'))return response({list:[]})
      if(url.includes('/waves?page='))return response({list:[wave]})
      const tool={id,kind:'SCALE',title:'量表甲',status:'PUBLISHED',instrumentKey:'a',revision:1,definition:{dimensions:[{dimensionKey:'total',label:'总分'}]}}
      if(url.includes('/instruments?page='))return response({list:[tool]})
      if(url.includes('/instruments/'))return response(tool)
      if(url.endsWith('/preflight'))return response({ok:true,checks:[],trackingOptions:[{instrumentId:id,instrumentKey:'a',scoreKey:'total',label:'量表甲 · 总分',unit:'points'}]})
      if(url.endsWith('/prepare'))return response({publicationId:'pub'})
      if(url.endsWith('/waves/w1'))return response(wave)
      if(url.endsWith('/projects/p'))return response({id:'p',collectionMode:'LINKED_WAVES',status:'DRAFT',revision:0,firstPublishedAt:null})
      throw new Error('Unexpected '+url)
    }))
    render(<SurveyWaveStudio projectId="p"/>)
    fireEvent.click(await screen.findByRole('button',{name:/T1 · T1/}))
    fireEvent.click(await screen.findByLabelText('Longitudinal · 我的变化'))
    fireEvent.click(screen.getByRole('button',{name:'检查知情同意与所有工具'}))
    expect(await screen.findByLabelText('量表甲 · 总分（points）')).not.toBeChecked()
    expect(screen.getByRole('button',{name:'冻结研究定义'})).toBeDisabled()
    fireEvent.click(screen.getByLabelText('量表甲 · 总分（points）'))
    await waitFor(()=>expect(screen.getByRole('button',{name:'冻结研究定义'})).toBeEnabled())
    fireEvent.click(screen.getByRole('button',{name:'冻结研究定义'}))
    await waitFor(()=>expect(requests.find(r=>r.url.endsWith('/prepare'))).toBeTruthy())
    const body=requests.find(r=>r.url.endsWith('/prepare'))!.body
    expect(body).toEqual({revision:0,tracking:{mode:'LONGITUDINAL',metrics:[{instrumentId:id,scoreKey:'total'}]}})
    expect(body.participantFeedback).toBeUndefined()
  })
})
