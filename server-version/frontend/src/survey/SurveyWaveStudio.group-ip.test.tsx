import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SurveyWaveStudio} from './SurveyWaveStudio'
vi.mock('./SurveyFlowStudio',()=>({SurveyFlowStudio:()=>null}))
vi.mock('./SurveyStudyPreview',()=>({SurveyStudyPreview:()=>null}))
const label='允许本轮同一 IP 集体作答，不设 IP 人数上限'
const zoneLabel='集体作答时区（IANA，冻结后不可修改）'
const policy={schemaVersion:1,timeZone:'Asia/Shanghai',activationDate:'2026-10-17'}
const wave={id:'w1',projectId:'p1',title:'集体问卷',ordinal:1,status:'DRAFT',revision:1,
  instrumentIds:[],publicationId:null,consentText:'本次研究的参与说明与知情同意材料，至少二十字。',generalText:'谢谢',consentVersion:1,
  linkageNoticeConfirmed:false,opensAt:null,closesAt:null,finishUntil:null,quotaStarts:null,startsCount:0,
  allowNewParticipants:false,hardStopAt:null,groupIpPolicy:null,groupIpActivatedAt:null}
function fixture(overrides:Record<string,unknown>={}){
  let current:Record<string,unknown>={...wave,...overrides}
  const bodies:Record<string,unknown>[]=[]
  const response=(data:unknown)=>({ok:true,json:async()=>({code:0,data})})
  const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    if(String(input).includes('/package-memberships?'))return {ok:true,status:200,json:async()=>({code:0,data:{list:[]}})} as Response
  const url=String(input)
    if(url.endsWith('/auth/csrf'))return response({csrfToken:'csrf'})
    if(url.includes('/waves?page='))return response({list:[current]})
    if(url.includes('/instruments?page='))return response({list:[]})
    if(url.endsWith('/waves/w1')){
      if(init?.method==='PATCH'){
        const body=JSON.parse(String(init.body)) as Record<string,unknown>
        bodies.push(body);current={...current,...body}
      }
      return response(current)
    }
    if(url.endsWith('/waves/w1/open')){
      bodies.push(JSON.parse(String(init?.body)) as Record<string,unknown>)
      current={...current,status:'OPEN',groupIpActivatedAt:'2026-10-17T04:00:00Z',closesAt:'2026-10-19T04:00:00Z'}
      return response({researchUrl:'https://survey.eduk12.top/r/research#entry=token'})
    }
    if(url.endsWith('/projects/p1'))return response({id:'p1',collectionMode:'SINGLE_UNLINKED',status:'ACTIVE',revision:1})
    throw new Error('Unexpected test request '+url)
  })
  vi.stubGlobal('fetch',fetcher)
  return {bodies,fetcher}
}
async function select(){
  render(<SurveyWaveStudio projectId="p1"/>)
  fireEvent.click(await screen.findByRole('button',{name:/T1 · 集体问卷/}))
  await waitFor(()=>expect(screen.getByRole('heading',{name:'T1 · 集体问卷'})).toBeInTheDocument())
}
async function save(){
  fireEvent.click(screen.getByRole('button',{name:'保存波次草稿'}))
  await screen.findByText('波次草稿已保存；冻结定义和正式开放需要分别确认')
}
afterEach(()=>vi.unstubAllGlobals())
describe('wave collective same-IP controls',()=>{
  it('defaults disabled and preserves ordinary scheduled opening in the payload',async()=>{
    const api=fixture({opensAt:'2026-10-18T02:00:00Z'});await select()
    expect(screen.getByLabelText(label)).not.toBeChecked()
    expect(screen.queryByLabelText(zoneLabel)).toBeNull()
    expect(screen.getByLabelText('计划开放时间')).toBeEnabled()
    await save()
    expect(api.bodies[0]).toMatchObject({groupIpPolicy:null,opensAt:'2026-10-18T02:00:00.000Z'})
  })
  it('enables with browser IANA timezone, sends immediate opening and preserves an earlier selected end',async()=>{
    const api=fixture({opensAt:'2026-10-18T02:00:00Z',closesAt:'2026-10-18T03:00:00Z'});await select()
    fireEvent.click(screen.getByLabelText(label))
    expect(screen.getByLabelText(zoneLabel)).toHaveValue(Intl.DateTimeFormat().resolvedOptions().timeZone)
    expect(screen.getByLabelText('计划开放时间')).toBeDisabled()
    expect(screen.getByLabelText('计划开放时间')).toHaveValue('')
    fireEvent.change(screen.getByLabelText(zoneLabel),{target:{value:'Asia/Shanghai'}})
    await save()
    expect(api.bodies[0]).toMatchObject({groupIpPolicy:{schemaVersion:1,timeZone:'Asia/Shanghai'},opensAt:null,closesAt:'2026-10-18T03:00:00.000Z'})
    expect(screen.getByText(/到期无宽限，暂停或恢复不延长窗口/)).toBeInTheDocument()
    expect(screen.getByText(/邀请凭证、知情同意、身份验证、总名额和实验组配额仍有效/)).toBeInTheDocument()
  })
  it('can opt out again before freezing and restore scheduled opening',async()=>{
    const api=fixture({opensAt:'2026-10-18T02:00:00Z'});await select()
    fireEvent.click(screen.getByLabelText(label));fireEvent.click(screen.getByLabelText(label))
    expect(screen.getByLabelText('计划开放时间')).toBeEnabled()
    await save()
    expect(api.bodies[0]).toMatchObject({groupIpPolicy:null,opensAt:'2026-10-18T02:00:00.000Z'})
  })
  it('sends only editable policy fields, leaving activation date server authoritative',async()=>{
    const api=fixture({groupIpPolicy:policy});await select();await save()
    expect(api.bodies[0].groupIpPolicy).toEqual({schemaVersion:1,timeZone:'Asia/Shanghai'})
  })
  it('freezes policy and timezone and shows the server calendar day before opening',async()=>{
    fixture({publicationId:'pub',groupIpPolicy:policy});await select()
    expect(screen.getByLabelText(label)).toBeChecked();expect(screen.getByLabelText(label)).toBeDisabled()
    expect(screen.getByLabelText(zoneLabel)).toHaveValue('Asia/Shanghai');expect(screen.getByLabelText(zoneLabel)).toBeDisabled()
    expect(screen.queryByRole('button',{name:'保存波次草稿'})).toBeNull()
    expect(screen.getByText(/须在 2026-10-17（Asia\/Shanghai）正式开放/)).toBeInTheDocument()
  })
  it('shows the exact server activation and deadline after immediate opening',async()=>{
    const api=fixture({publicationId:'pub',groupIpPolicy:policy});await select()
    fireEvent.click(screen.getByRole('button',{name:'正式开放本轮'}))
    await screen.findByText(/集体作答截止：2026\/10\/19 12:00:00（Asia\/Shanghai）/)
    expect(screen.getByText(/已于 2026\/10\/17 12:00:00（Asia\/Shanghai）开放/)).toBeInTheDocument()
    expect(screen.getByRole('img',{name:'研究参与招募二维码'})).toBeInTheDocument()
    expect(api.bodies[0]).toEqual({revision:1})
  })
  it('keeps the same deadline visible while paused without editable policy controls',async()=>{
    fixture({status:'PAUSED',publicationId:'pub',groupIpPolicy:policy,groupIpActivatedAt:'2026-10-17T04:00:00Z',closesAt:'2026-10-18T02:00:00Z'});await select()
    expect(screen.getByText(/集体作答截止：2026\/10\/18 10:00:00（Asia\/Shanghai）/)).toBeInTheDocument()
    expect(screen.getByLabelText(label)).toBeDisabled()
    expect(screen.getByRole('button',{name:'恢复开放'})).toBeEnabled()
    expect(screen.getByText(/暂停或恢复不会续期/)).toBeInTheDocument()
  })
})
