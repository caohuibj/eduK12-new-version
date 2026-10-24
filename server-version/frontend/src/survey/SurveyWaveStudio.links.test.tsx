import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SurveyWaveStudio } from './SurveyWaveStudio'
vi.mock('./SurveyFlowStudio',()=>({SurveyFlowStudio:()=>null}))
vi.mock('./SurveyStudyPreview',()=>({SurveyStudyPreview:()=>null}))
vi.mock('qrcode.react',()=>({QRCodeSVG:({value,title}:{value:string;title:string})=><svg role="img" aria-label={title} data-value={value}/>}))
const wave={id:'w1',projectId:'p1',title:'链接测试',ordinal:1,status:'DRAFT',revision:1,
  instrumentIds:[],publicationId:'pub1',consentText:'本次研究的参与说明与知情同意材料，至少二十字。',generalText:'谢谢',consentVersion:1,
  linkageNoticeConfirmed:false,opensAt:null,closesAt:'2027-01-01T00:00:00Z',finishUntil:null,quotaStarts:null,startsCount:0,
  allowNewParticipants:false,hardStopAt:null,groupIpPolicy:null,groupIpActivatedAt:null}
const response=(data:unknown)=>({ok:true,json:async()=>({code:0,data})})
type WaveOverride=Partial<Omit<typeof wave,'hardStopAt'>>&{hardStopAt?:string|null}
function fixture(origin:string,bad=false,overrides:WaveOverride={}){
  const original=window
  vi.stubGlobal('window',new Proxy(original,{get(target,key){return key==='location'?{origin}:Reflect.get(target,key)}}))
  const writeText=vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator,'clipboard',{value:{writeText},configurable:true})
  let current={...wave,...overrides},issued=0
  const fetcher=vi.fn(async(input:RequestInfo|URL,_init?:RequestInit)=>{
    const url=String(input)
    if(url.endsWith('/auth/csrf'))return response({csrfToken:'synthetic-csrf'})
    if(url.includes('/waves?page='))return response({list:[current]})
    if(url.includes('/instruments?page='))return response({list:[]})
    if(url.endsWith('/waves/w1'))return response(current)
    if(url.endsWith('/open')||url.endsWith('/entry-token/rotate')){
      current={...current,status:'OPEN',revision:current.revision+1};issued++
      return response({researchUrl:`https://${bad?'evil.test':'survey.eduk12.top'}/r/public-id#entry=synthetic-token-${issued}`})
    }
    if(url.endsWith('/projects/p1'))return response({id:'p1',collectionMode:'SINGLE_UNLINKED',status:'ACTIVE',revision:1})
    throw new Error('Unexpected fixture route')
  })
  vi.stubGlobal('fetch',fetcher)
  return {fetcher,writeText}
}
async function mount(){
  render(<SurveyWaveStudio projectId="p1"/> )
  fireEvent.click(await screen.findByRole('button',{name:/T1 · 链接测试/}))
  await screen.findByRole('heading',{name:'T1 · 链接测试'})
}
afterEach(()=>vi.unstubAllGlobals())
describe('recruitment capability display, clipboard and QR share one trusted URL',()=>{
  it('opens an existing study on its wave overview without an empty creation form or issuing capabilities',async()=>{
    const api=fixture('http://survey.localhost:5174');render(<SurveyWaveStudio projectId="p1"/> )
    await screen.findByRole('region',{name:'研究采集概览'})
    expect(screen.queryByLabelText('波次标题')).toBeNull()
    expect(screen.queryByText('当前阶段：尚未保存草稿')).toBeNull()
    expect(api.fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button',{name:'查看第 1 次问卷'}))
    await screen.findByRole('heading',{name:'T1 · 链接测试'})
    expect(screen.getByRole('button',{name:'正式开放本轮'})).toBeEnabled()
    expect(screen.queryByRole('region',{name:'研究采集概览'})).toBeNull()
    expect(api.fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0)
  })
  it('enters a new draft only after explicit New wave selection, preserving existing frozen waves',async()=>{
    const api=fixture('http://survey.localhost:5174');render(<SurveyWaveStudio projectId="p1"/> )
    await screen.findByRole('region',{name:'研究采集概览'})
    fireEvent.click(screen.getByRole('button',{name:'新建波次'}))
    expect(screen.getByLabelText('波次标题')).toHaveValue('')
    expect(screen.getByRole('button',{name:'创建波次'})).toBeDisabled()
    expect(screen.getByRole('button',{name:/T1 · 链接测试/})).toBeInTheDocument()
    expect(api.fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0)
  })
  it('keeps the issued link and supports manual copying after clipboard refusal without reissuing it',async()=>{
    const api=fixture('http://survey.localhost:5173');api.writeText.mockRejectedValueOnce(new Error('clipboard denied'))
    await mount();fireEvent.click(screen.getByRole('button',{name:'正式开放本轮'}))
    const expected='http://survey.localhost:5173/r/public-id#entry=synthetic-token-1'
    await screen.findByText(expected)
    fireEvent.click(screen.getByRole('button',{name:'复制研究链接'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('请手动选择并复制下方研究链接')
    expect(screen.getByText(expected)).toBeVisible()
    fireEvent.click(screen.getByRole('button',{name:'复制研究链接'}))
    await screen.findByText('研究链接已复制，请通过受控渠道分享。')
    expect(api.writeText).toHaveBeenLastCalledWith(expected)
    expect(api.fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
  })
  it.each([
    [{status:'DRAFT',publicationId:'pub1'},'已冻结，尚未开放'],
    [{status:'OPEN'},'波次已开放'],
    [{status:'PAUSED'},'已暂停新参与'],
    [{status:'CLOSED'},'已结束招募'],
    [{status:'CLOSED',hardStopAt:'2026-01-01T00:00:00Z'},'已紧急终止'],
  ])('describes persisted wave state without issuing actions: %s',async(overrides,label)=>{
    const api=fixture('http://survey.localhost:5173',false,overrides as WaveOverride);await mount()
    expect(screen.getByText('当前阶段：'+label).closest('summary')).toBeInTheDocument()
    expect(screen.getByText('当前阶段：'+label).closest('details')).not.toHaveAttribute('open')
    expect(api.fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0)
  })

  it.each(['http://survey.localhost:5173','https://survey.eduk12.top'])(
    'uses the environment at %s for both open and rotate',async origin=>{
      const api=fixture(origin);await mount()
      fireEvent.click(screen.getByRole('button',{name:'正式开放本轮'}))
      for(const issued of [1,2]){
        const expected=`${origin}/r/public-id#entry=synthetic-token-${issued}`
        expect(await screen.findByText(expected)).toBeInTheDocument()
        expect(screen.getByRole('img',{name:'研究参与招募二维码'})).toHaveAttribute('data-value',expected)
        fireEvent.click(screen.getByRole('button',{name:'复制研究链接'}))
        expect(api.writeText).toHaveBeenLastCalledWith(expected)
        await waitFor(()=>expect(screen.getByRole('button',{name:'轮换招募链接'})).toBeEnabled())
        if(issued===1)fireEvent.click(screen.getByRole('button',{name:'轮换招募链接'}))
      }
      expect(api.fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(2)
      expect(api.fetcher.mock.calls.every(([url])=>String(url).startsWith('/api/'))).toBe(true)
    })
  it('rejects an untrusted response without display, clipboard or QR',async()=>{
    fixture('http://survey.localhost:5173',true);await mount()
    fireEvent.click(screen.getByRole('button',{name:'正式开放本轮'}))
    expect(await screen.findByText('招募链接地址不受支持，请联系管理员')).toBeInTheDocument()
    expect(screen.queryByRole('img',{name:'研究参与招募二维码'})).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'复制研究链接'})).not.toBeInTheDocument()
  })
  it('fails before token issuance on an unknown origin',async()=>{
    const api=fixture('http://unknown.localhost:5173');await mount()
    fireEvent.click(screen.getByRole('button',{name:'正式开放本轮'}))
    expect(await screen.findByText('当前地址不支持生成招募链接')).toBeInTheDocument()
    expect(api.fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0)
  })
})
