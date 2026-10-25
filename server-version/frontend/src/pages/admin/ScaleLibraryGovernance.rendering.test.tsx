import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import ScaleLibraryGovernance from './ScaleLibraryGovernance'
import {AuthProvider} from '../../contexts/AuthContext'
const session=vi.hoisted(()=>({me:vi.fn()}))
vi.mock('../../api/auth',()=>({authApi:{me:session.me}}))
const scoped=vi.hoisted(()=>({request:vi.fn()}))
vi.mock('../../api/surveyManagement',()=>({surveyManagementRequest:scoped.request}))
const api=vi.hoisted(()=>({catalog:vi.fn(),catalogDetail:vi.fn(),capabilities:vi.fn(),submissionDetail:vi.fn(),submissions:vi.fn(),grants:vi.fn(),review:vi.fn(),setStatus:vi.fn(),grant:vi.fn(),revoke:vi.fn()}))
vi.mock('../../api/scaleLibraryGovernance',()=>({governanceApi:()=>api,submissionStatusLabel:{SUBMITTED:'待审核'}}))
const metadata={title:'Synthetic scale',author:'Synthetic author',copyright:'Owned',applicability:'Research',scoringDescription:'Sum',reportDescription:'Descriptive'}
const submission={id:'submission',releaseId:'release',metadata,version:3,status:'SUBMITTED',product:'TRAINING',supportedEntrypoints:['TRAINING','SURVEY']}
const entry={...submission,id:'entry',status:'ACTIVE'}
const record={catalogId:'catalog',origin:'AUTHORED',title:metadata.title,exactVersion:{origin:'AUTHORED',releaseId:'release'},authored:entry}
let catalogSerialized:ReturnType<typeof vi.fn>,submissionSerialized:ReturnType<typeof vi.fn>
beforeEach(()=>{
  vi.resetAllMocks()
  session.me.mockResolvedValue({code:0,data:{id:'entry-manager',username:'entry-manager',role:'TEACHER',platformRole:'STANDARD',entryGrants:[{entry:'SURVEY',version:1}]}})
  catalogSerialized=vi.fn(()=>({proof:'catalog frozen content'}))
  submissionSerialized=vi.fn(()=>({proof:'submission frozen content'}))
  api.capabilities.mockResolvedValue({systemAdmin:false,canReview:true,reviewGrants:[{grantId:'review-release',releaseIds:['release']}],distributionGrants:[{grantId:'distribute-release',product:'TRAINING',releaseIds:['release']}]})
  api.submissions.mockResolvedValue({list:[submission]})
  api.catalog.mockResolvedValue({list:[record],hasMore:false})
  api.catalogDetail.mockResolvedValue({entry:{...record,toJSON:catalogSerialized}})
  api.submissionDetail.mockResolvedValue({...submission,toJSON:submissionSerialized,mediaManifest:{schemaVersion:1,manifestHash:'empty',items:[]}})
  api.grants.mockResolvedValue({list:[]})
})
afterEach(cleanup)
const open=(survey:boolean)=>render(<AuthProvider><MemoryRouter initialEntries={[survey?'/admin/scale-library-governance?workspace=survey':'/admin/scale-library-governance']}><ScaleLibraryGovernance/></MemoryRouter></AuthProvider>)
describe('governance visible workspace construction',()=>{
  it('serializes only requested current Survey details and preserves their exact identities and reason across views',async()=>{
    const policy={decision:'APPROVED',paused:false,version:1,reason:'Reviewed'}
    const policyIdentity={resourceKey:'release:release',fingerprint:'a'.repeat(64)}
    const row={...record,authored:{...entry,submissionId:'catalog-submission'},policy,policyIdentity,states:{content:{ready:true,reasons:[]},assignment:{ready:true,reasons:[]},deployment:{ready:false,reasons:['Final admission required']}}}
    scoped.request.mockImplementation(async(_scope,path)=>{
      if(path.startsWith('/catalog'))return {list:[row],hasMore:false}
      if(path.startsWith('/submissions?'))return {list:[{...submission,policy,policyIdentity}],hasMore:false}
      if(path==='/submissions/catalog-submission')return {toJSON:catalogSerialized}
      if(path==='/submissions/submission')return {toJSON:submissionSerialized}
      if(path==='/entries/entry/recipients'||path==='/entries/entry/grants')return {list:[]}
      throw Error('Unexpected Survey request '+path)
    })
    open(true)
    await screen.findByRole('heading',{name:'Synthetic scale'})
    expect(catalogSerialized).not.toHaveBeenCalled();expect(submissionSerialized).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('状态、详情与操作'))
    fireEvent.click(screen.getByRole('button',{name:'读取冻结内容、计分与报告'}))
    await screen.findByText(/catalog frozen content/)
    expect(catalogSerialized).toHaveBeenCalledTimes(1)
    catalogSerialized.mockClear()
    fireEvent.change(screen.getByLabelText('审批或暂停原因'),{target:{value:'Checked frozen version'}})
    expect(catalogSerialized).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button',{name:'分配 Survey 精确版本'}))
    await screen.findByRole('heading',{name:'Survey 精确版本授权'})
    fireEvent.click(screen.getByRole('tab',{name:'Survey 入库审批'}))
    await screen.findByText('申请详情与 Survey 审批')
    catalogSerialized.mockClear()
    fireEvent.click(screen.getByText('申请详情与 Survey 审批'))
    fireEvent.click(screen.getByRole('button',{name:'读取冻结审核内容'}))
    await screen.findByText(/submission frozen content/)
    expect(catalogSerialized).not.toHaveBeenCalled()
    expect(submissionSerialized).toHaveBeenCalledTimes(1)
    submissionSerialized.mockClear()
    fireEvent.click(screen.getByRole('tab',{name:'量表目录'}))
    await screen.findByText('状态、详情与操作')
    expect(submissionSerialized).not.toHaveBeenCalled()
    expect(screen.getByLabelText('审批或暂停原因')).toHaveValue('Checked frozen version')
    fireEvent.click(screen.getByText('状态、详情与操作'))
    await screen.findByText(/catalog frozen content/)
    for(const path of ['/submissions/catalog-submission','/submissions/submission','/entries/entry/recipients','/entries/entry/grants'])expect(scoped.request.mock.calls.filter(call=>call[1]===path)).toHaveLength(1)
    expect(scoped.request.mock.calls.every(([scope,,body])=>scope==='survey-library'&&body===undefined)).toBe(true)
    expect(api.review).not.toHaveBeenCalled()
  })
  it('retains both legacy panels and their required full frozen records',async()=>{
    open(false)
    fireEvent.click(await screen.findByRole('button',{name:'查看自编精确版本详情'}))
    await screen.findByRole('region',{name:'公共量表精确版本详情'})
    fireEvent.click(screen.getByRole('button',{name:'读取精确版本审核内容'}))
    await screen.findByRole('region',{name:'审核冻结内容：Synthetic scale · release'})
    catalogSerialized.mockClear();submissionSerialized.mockClear()
    fireEvent.change(screen.getByLabelText('审核、下架或撤权说明'),{target:{value:'Legacy reason'}})
    expect(catalogSerialized).toHaveBeenCalledTimes(1)
    expect(submissionSerialized).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('region',{name:'目录版本内容：Synthetic scale'})).toHaveTextContent('catalog frozen content')
    expect(screen.getByRole('region',{name:'审核冻结内容：Synthetic scale · release'})).toHaveTextContent('submission frozen content')
    expect(screen.getByRole('button',{name:'批准精确版本入库'})).toBeEnabled()
    expect(api.review).not.toHaveBeenCalled()
  })
  it('keeps review and distribution closed when the current session and capability read are rejected',async()=>{
    session.me.mockResolvedValue({code:401,message:'Session required'})
    api.capabilities.mockRejectedValue(Error('Current session required'))
    open(false)
    expect(await screen.findByRole('alert')).toHaveTextContent('Current session required')
    expect(screen.queryByRole('button',{name:'批准精确版本入库'})).not.toBeInTheDocument()
    expect(api.review).not.toHaveBeenCalled();expect(api.grant).not.toHaveBeenCalled()
  })

})
