import {StrictMode} from 'react'
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import SurveyPublicApp from './SurveyPublicApp'
vi.mock('qrcode.react',async()=>{
  const {forwardRef}=await import('react')
  return {QRCodeCanvas:forwardRef<HTMLCanvasElement,{value:string}>(({value,...props},ref)=><canvas {...props} ref={ref} data-qr-value={value}/>)}
})
const pid='11111111-1111-4111-8111-111111111111'
const token='a'.repeat(43)
const response=(data:unknown,status=200)=>Promise.resolve({ok:status<400,status,json:async()=>({code:status<400?0:status,message:'邀请已失效',data})} as Response)
const group={id:'group-wave',title:'本次集体问卷',ordinal:2,status:'OPEN',consentText:'本次研究的知情同意说明',consentVersion:1,
  opensAt:'2026-10-17T04:00:00Z',closesAt:'2026-10-19T04:00:00Z',allowNewParticipants:true,
  groupIpPolicy:{schemaVersion:1,timeZone:'Asia/Shanghai',activationDate:'2026-10-17'},groupIpActivatedAt:'2026-10-17T04:00:00Z'}
const ordinary={...group,id:'ordinary-wave',title:'普通问卷',consentText:'普通问卷的参与说明',ordinal:1,groupIpPolicy:null,groupIpActivatedAt:null}
function fixture({linked=false,ordinaryToken=false,failInfo=false,singleGroup=false}:{linked?:boolean;ordinaryToken?:boolean;failInfo?:boolean;singleGroup?:boolean}={}){
  const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input)
    if(url.endsWith('/info')){
      if(failInfo&&init?.method==='POST')return response(null,403)
      return response({project:{name:'研究项目',description:'说明',collectionMode:linked?'LINKED_WAVES':'SINGLE_UNLINKED',status:'ACTIVE'},
        scopeWaveId:init?.method==='POST'&&!ordinaryToken?group.id:null,
        waves:(init?.method==='POST'&&!ordinaryToken)||singleGroup?[group]:[ordinary,{...ordinary,id:'second-wave',title:'另一轮普通问卷',ordinal:3}]})
    }
    if(url.endsWith('/enter')){
      const body=JSON.parse(String(init?.body)) as Record<string,unknown>
      return response({waves:[{...group,attempt:{id:'attempt',status:'COMPLETED'}},
        ...(singleGroup&&!body.waveId?[{...ordinary,id:'history-wave',title:'本人历史波次',ordinal:1,status:'CLOSED',attempt:{id:'history-attempt',status:'COMPLETED'}}]:[])]})
    }
    if(url.endsWith('/start'))return response({attemptId:'attempt'})
    if(url.endsWith('/join'))return response({researchCode:'R-EXAMPLE1',accessCredential:'s'.repeat(43)})
    if(url.endsWith('/task'))return response({attemptId:'attempt',waveId:group.id,status:'COMPLETED',definitionDigest:'d'.repeat(64),reportMode:'GENERAL_ONLY',units:[]})
    if(url.endsWith('/general'))return response({kind:'GENERAL_ONLY',text:'谢谢参与',disclaimer:'说明',completedAt:'2026-10-17T12:00:00Z'})
    throw new Error('Unexpected test request '+url)
  })
  vi.stubGlobal('fetch',fetcher)
  return {fetcher,infoCalls:()=>fetcher.mock.calls.filter(([url])=>String(url).endsWith('/info')),
    enterBodies:()=>fetcher.mock.calls.filter(([url])=>String(url).endsWith('/enter')).map(([,init])=>JSON.parse(String(init?.body)) as Record<string,unknown>)}
}
async function recover(){
  const summary=screen.getByText('使用旧编号和恢复凭证');if(!summary.parentElement?.hasAttribute('open'))fireEvent.click(summary)
  fireEvent.change(screen.getByLabelText('研究编号'),{target:{value:' r-example '}})
  fireEvent.change(screen.getByLabelText('私密恢复凭证'),{target:{value:'secret'}})
  fireEvent.click(screen.getByRole('button',{name:'读取我的波次任务'}))
  await screen.findByRole('button',{name:'停止后续研究参与并撤销未来访问权限（已收集数据不自动删除）'})
}
beforeEach(()=>{sessionStorage.clear();window.history.replaceState(null,'',`/r/${pid}`)})
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks()})
describe('scoped same-IP participant discovery',()=>{
  it('requires a new consent choice when invitation discovery changes the consent version',async()=>{
    const api=fixture({ordinaryToken:true,singleGroup:true});render(<SurveyPublicApp/>)
    const agreement=await screen.findByRole('checkbox',{name:'我已阅读以上说明，自愿参加本次问卷。'})
    fireEvent.click(agreement);expect(agreement).toBeChecked()
    api.fetcher.mockImplementation(async()=>response({
      project:{name:'研究项目',description:'说明',collectionMode:'SINGLE_UNLINKED',status:'ACTIVE'},
      scopeWaveId:'new-wave',waves:[{...group,id:'new-wave',consentVersion:2,consentText:'这是新邀请对应的完整参与说明'}],
    }))
    fireEvent.change(screen.getByLabelText('重新输入研究邀请凭证'),{target:{value:token}})
    await screen.findByText('这是新邀请对应的完整参与说明')
    expect(screen.getByRole('checkbox',{name:'我已阅读以上说明，自愿参加本次问卷。'})).not.toBeChecked()
    expect(screen.getByRole('button',{name:'开始填写问卷'})).toBeDisabled()
  })
  it('opens a single anonymous invitation on the full consent page without accepting or starting',async()=>{
    window.history.replaceState(null,'',`/r/${pid}#entry=${token}`)
    const api=fixture({ordinaryToken:true,singleGroup:true});render(<SurveyPublicApp/>)
    expect(await screen.findByRole('heading',{name:'知情同意书'})).toBeInTheDocument()
    expect(screen.getByLabelText('匿名参与方式')).toHaveTextContent('完全匿名：无需登录，不记录个人信息，放心作答')
    expect(screen.queryByText('本次回答独立记录，不与其他轮次关联。')).toBeNull()
    expect(screen.queryByText('第 2 轮 · 本次集体问卷')).toBeNull()
    expect(screen.getByText(group.consentText)).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'查看参与说明'})).toBeNull()
    expect(screen.getByRole('checkbox',{name:'我已阅读以上说明，自愿参加本次问卷。'})).not.toBeChecked()
    expect(screen.getByRole('button',{name:'开始填写问卷'})).toBeDisabled()
    expect(api.fetcher.mock.calls.every(([url])=>String(url).endsWith('/info'))).toBe(true)
  })
  it('guides a first-time participant to consent without starting or accepting on their behalf',async()=>{
    window.history.replaceState(null,'',`/r/${pid}#entry=${token}`)
    const api=fixture({ordinaryToken:true});render(<SurveyPublicApp/>)
    fireEvent.click((await screen.findAllByRole('button',{name:'查看参与说明'}))[0])
    const consent=screen.getByRole('region',{name:'参与说明'})
    await waitFor(()=>expect(consent).toHaveFocus())
    expect(screen.getByRole('checkbox',{name:'我已阅读以上说明，自愿参加本次问卷。'})).not.toBeChecked()
    expect(screen.getByRole('button',{name:'开始填写问卷'})).toBeDisabled()
    expect(api.fetcher.mock.calls.every(([url])=>String(url).endsWith('/info'))).toBe(true)
  })

  it('retains unscoped GET without a valid token, including StrictMode effect replay',async()=>{
    const api=fixture();render(<StrictMode><SurveyPublicApp/></StrictMode>)
    await screen.findByText('第 1 轮 · 普通问卷')
    expect(screen.getByText('第 3 轮 · 另一轮普通问卷')).toBeInTheDocument()
    expect(api.infoCalls().every(([,init])=>init?.method==='GET')).toBe(true)
    expect(api.infoCalls().every(([,init])=>init?.body===undefined)).toBe(true)
  })
  it('posts the valid fragment token without putting it in the URL and shows target deadline with timezone',async()=>{
    window.history.replaceState(null,'',`/r/${pid}#entry=${token}`)
    const api=fixture();render(<SurveyPublicApp/>)
    await screen.findByText(group.consentText)
    expect(api.infoCalls()).toHaveLength(1)
    expect(api.infoCalls()[0][1]).toMatchObject({method:'POST',body:JSON.stringify({entryToken:token})})
    expect(String(api.infoCalls()[0][0])).toBe(`/api/public/survey/r/${pid}/info`)
    expect(window.location.hash).toBe('')
    expect(screen.queryByText('第 1 轮 · 普通问卷')).toBeNull()
    expect(screen.getByText(/同 IP 集体作答截止：2026\/10\/19 12:00:00（Asia\/Shanghai）/)).toBeInTheDocument()
  })
  it('also scopes discovery for a valid same-tab recruitment token',async()=>{
    sessionStorage.setItem(`huisurvey:recruitment:v1:${pid}`,JSON.stringify({token,createdAt:Date.now()}))
    const api=fixture();render(<SurveyPublicApp/>)
    await screen.findByText(group.consentText)
    expect(api.infoCalls()[0][1]?.method).toBe('POST')
    expect(JSON.parse(String(api.infoCalls()[0][1]?.body))).toEqual({entryToken:token})
  })
  it('re-reads scoped info on a complete pasted token but not partial input',async()=>{
    const api=fixture();render(<SurveyPublicApp/>)
    await screen.findByText('第 1 轮 · 普通问卷')
    fireEvent.change(screen.getByLabelText('重新输入研究邀请凭证'),{target:{value:'short'}})
    expect(api.infoCalls()).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('重新输入研究邀请凭证'),{target:{value:token}})
    await screen.findByText(group.consentText)
    expect(api.infoCalls()).toHaveLength(2)
    expect(api.infoCalls()[1][1]?.method).toBe('POST')
    expect(screen.queryByText('第 1 轮 · 普通问卷')).toBeNull()
  })
  it('scopes linked recovery and returning from a receipt to the sole group wave without a client bypass flag',async()=>{
    window.history.replaceState(null,'',`/r/${pid}#entry=${token}`)
    const api=fixture({linked:true});render(<SurveyPublicApp/>)
    await screen.findByText('第 2 轮 · 本次集体问卷');await recover()
    expect(api.enterBodies()).toEqual([{researchCode:'R-EXAMPLE',accessCredential:'secret',waveId:'group-wave'}])
    expect(screen.queryByRole('button',{name:'查看回执'})).toBeNull()
    fireEvent.click(screen.getByText('已完成问卷'))
    fireEvent.click(await screen.findByRole('button',{name:'查看回执'}))
    fireEvent.click(screen.getByLabelText('我已阅读并同意本轮研究说明及相应的数据关联范围。'))
    fireEvent.click(screen.getByRole('button',{name:'查看完成情况'}))
    await screen.findByText('谢谢参与')
    fireEvent.click(screen.getByRole('button',{name:'返回我的研究波次'}))
    await waitFor(()=>expect(api.enterBodies()).toHaveLength(2))
    expect(api.enterBodies()[1]).toEqual(api.enterBodies()[0])
    expect((await screen.findByText('已完成问卷')).closest('details')).not.toHaveAttribute('open')
    expect(api.fetcher.mock.calls.find(([url])=>String(url).endsWith('/task'))?.[1]?.body)
      .toBe(JSON.stringify({researchCode:'R-EXAMPLE',accessCredential:'secret'}))
  })
  it('preserves the ordinary token multi-wave view and recovery payload',async()=>{
    window.history.replaceState(null,'',`/r/${pid}#entry=${token}`)
    const api=fixture({linked:true,ordinaryToken:true});render(<SurveyPublicApp/>)
    await screen.findByText('第 1 轮 · 普通问卷')
    expect(screen.getByText('第 3 轮 · 另一轮普通问卷')).toBeInTheDocument()
    await recover()
    expect(api.enterBodies()).toEqual([{researchCode:'R-EXAMPLE',accessCredential:'secret'}])
  })
  it.each(['GET','ordinary token'])('does not infer recovery scope from a sole current group wave in %s',async(mode)=>{
    if(mode==='ordinary token')window.history.replaceState(null,'',`/r/${pid}#entry=${token}`)
    const api=fixture({linked:true,ordinaryToken:true,singleGroup:true});render(<SurveyPublicApp/>)
    await screen.findByText('第 2 轮 · 本次集体问卷')
    await recover()
    expect(api.enterBodies()).toEqual([{researchCode:'R-EXAMPLE',accessCredential:'secret'}])
    expect(screen.queryByText('第 1 轮 · 本人历史波次')).toBeNull()
    fireEvent.click(await screen.findByText('已完成问卷'))
    expect(await screen.findByText('第 1 轮 · 本人历史波次')).toBeVisible()
    expect(api.infoCalls()[0][1]?.method).toBe(mode==='GET'?'GET':'POST')
  })
  it('keeps scoped info after consuming an invitation rather than falling back to GET',async()=>{
    window.history.replaceState(null,'',`/r/${pid}#entry=${token}`)
    const api=fixture({linked:true});render(<SurveyPublicApp/>)
    fireEvent.click(await screen.findByRole('button',{name:'查看参与说明'}))
    fireEvent.click(screen.getByLabelText('我已阅读并同意本轮研究说明及相应的数据关联范围。'))
    fireEvent.click(screen.getByRole('button',{name:'首次参加 · 获取专属链接'}))
    await screen.findByRole('heading',{name:'保存专属链接或二维码'})
    expect(screen.queryByLabelText('重新输入研究邀请凭证')).toBeNull()
    expect(api.infoCalls()).toHaveLength(1)
    expect(api.infoCalls()[0][1]?.method).toBe('POST')
    expect(screen.queryByText('第 1 轮 · 普通问卷')).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'我已保存，进入答题'}))
    await waitFor(()=>expect(api.fetcher.mock.calls.some(([url])=>String(url).endsWith('/task'))).toBe(true))
    expect(api.fetcher.mock.calls.find(([url])=>String(url).endsWith('/start'))?.[0]).toBe('/api/public/survey/r/'+pid+'/waves/'+group.id+'/start')
    expect(api.infoCalls()).toHaveLength(1)
    expect(api.infoCalls()[0][1]?.method).toBe('POST')
  })
  it('allows replacing a rejected scoped invitation without an automatic GET fallback',async()=>{
    window.history.replaceState(null,'',`/r/${pid}#entry=${token}`)
    const api=fixture({failInfo:true});render(<SurveyPublicApp/>)
    await screen.findByRole('alert')
    fireEvent.change(screen.getByLabelText('重新输入研究邀请凭证'),{target:{value:'b'.repeat(43)}})
    await waitFor(()=>expect(api.infoCalls()).toHaveLength(2))
    expect(api.infoCalls().every(([,init])=>init?.method==='POST')).toBe(true)
    expect(screen.queryByText('第 1 轮 · 普通问卷')).toBeNull()
  })
  it('does not let an older fallback overwrite a newly pasted scoped invitation',async()=>{
    window.history.replaceState(null,'',`/r/${pid}#entry=${token}`)
    const api=fixture({failInfo:true});render(<SurveyPublicApp/>)
    await screen.findByRole('alert')
    let resolve!:(value:Response)=>void
    const pending=new Promise<Response>(done=>{resolve=done})
    api.fetcher.mockImplementation(async(_input,init)=>init?.method==='GET'?pending:response({
      project:{name:'研究项目',description:'说明',collectionMode:'SINGLE_UNLINKED',status:'ACTIVE'},waves:[group],scopeWaveId:group.id,
    }))
    fireEvent.click(screen.getByRole('button',{name:'已有私密凭据 · 恢复作答或撤回数据'}))
    fireEvent.change(screen.getByLabelText('重新输入研究邀请凭证'),{target:{value:'b'.repeat(43)}})
    await screen.findByText(group.consentText)
    await act(async()=>resolve(await response({project:{name:'旧响应',description:'说明',collectionMode:'SINGLE_UNLINKED',status:'ACTIVE'},waves:[ordinary]})))
    expect(screen.getByText(group.consentText)).toBeInTheDocument()
    expect(screen.queryByText('第 1 轮 · 普通问卷')).toBeNull()
    expect(screen.queryByText('旧响应')).toBeNull()
  })
  it('provides an explicit ordinary fallback for existing recovery and withdrawal after expired invitation',async()=>{
    window.history.replaceState(null,'',`/r/${pid}#entry=${token}`)
    const api=fixture({linked:true,failInfo:true});render(<SurveyPublicApp/>)
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button',{name:'已有私密凭据 · 恢复作答或撤回数据'}))
    fireEvent.click(await screen.findByText('使用旧编号和恢复凭证'))
    await screen.findByLabelText('研究编号')
    expect(api.infoCalls()).toHaveLength(2)
    expect(api.infoCalls()[1][1]?.method).toBe('GET')
    expect(api.infoCalls()[1][1]?.body).toBeUndefined()
    fireEvent.change(screen.getByLabelText('研究编号'),{target:{value:'R-EXAMPLE'}})
    fireEvent.change(screen.getByLabelText('私密恢复凭证'),{target:{value:'secret'}})
    expect(screen.getByRole('button',{name:'持原有研究凭证申请数据撤回（包括已撤销访问者）'})).toBeEnabled()
    await recover()
    expect(api.enterBodies()).toEqual([{researchCode:'R-EXAMPLE',accessCredential:'secret'}])
  })
})
