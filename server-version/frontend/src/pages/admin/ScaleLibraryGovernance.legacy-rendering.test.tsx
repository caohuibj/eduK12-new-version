import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {LegacyScaleLibraryGovernance} from './ScaleLibraryGovernance'
import {AuthProvider,useAuth} from '../../contexts/AuthContext'
const session=vi.hoisted(()=>({me:vi.fn()}))
vi.mock('../../api/auth',()=>({authApi:{me:session.me}}))
const api=vi.hoisted(()=>({catalog:vi.fn(),catalogDetail:vi.fn(),capabilities:vi.fn(),submissionDetail:vi.fn(),submissions:vi.fn(),grants:vi.fn(),review:vi.fn(),setStatus:vi.fn(),grant:vi.fn(),revoke:vi.fn()}))
vi.mock('../../api/scaleLibraryGovernance',()=>({governanceApi:()=>api,submissionStatusLabel:{SUBMITTED:'待审核'}}))
const metadata={title:'Synthetic scale',author:'Synthetic author',copyright:'Owned',applicability:'Research',scoringDescription:'Sum',reportDescription:'Descriptive'}
const submission={id:'submission',releaseId:'release',metadata,version:3,status:'SUBMITTED',product:'TRAINING',supportedEntrypoints:['TRAINING','SURVEY'],admittedEntrypoints:['TRAINING','SURVEY']}
const entry={...submission,id:'entry',status:'ACTIVE'}
const record={catalogId:'catalog',origin:'AUTHORED',title:metadata.title,exactVersion:{origin:'AUTHORED',releaseId:'release'},authored:entry}
let catalogSerialized:ReturnType<typeof vi.fn>,submissionSerialized:ReturnType<typeof vi.fn>
beforeEach(()=>{
  vi.resetAllMocks()
  sessionStorage.clear()
  session.me.mockResolvedValue({code:0,message:'Synthetic session',data:{id:'scoped-reviewer',username:'scoped-reviewer',role:'ADMIN',platformRole:'STANDARD',entryGrants:[{entry:'TRAINING',version:1},{entry:'SURVEY',version:1}]}})
  catalogSerialized=vi.fn(()=>({proof:'catalog frozen content'}))
  submissionSerialized=vi.fn(()=>({proof:'submission frozen content'}))
  api.capabilities.mockResolvedValue({systemAdmin:false,reviewGrants:[{grantId:'review-release',releaseIds:['release']}],distributionGrants:[{grantId:'distribute-survey-release',product:'SURVEY',releaseIds:['release']},{grantId:'distribute-training-release',product:'TRAINING',releaseIds:['release']}]})
  api.submissions.mockResolvedValue({list:[submission]})
  api.catalog.mockResolvedValue({list:[record],hasMore:false})
  api.catalogDetail.mockResolvedValue({entry:{...record,toJSON:catalogSerialized}})
  api.submissionDetail.mockResolvedValue({...submission,toJSON:submissionSerialized,mediaManifest:{schemaVersion:1,manifestHash:'empty',items:[]}})
  api.grants.mockResolvedValue({list:[]})
})
afterEach(cleanup)
function SessionReady(){const {isLoading,isAuthenticated}=useAuth();return isLoading?<p>正在读取测试会话</p>:isAuthenticated?<LegacyScaleLibraryGovernance/>:<p>需要有效测试会话</p>}
// These assertions concern the retained shared view, not the outer product
// router, whose Survey branch now intentionally renders SurveyLibraryAdmin.
const open=(survey:boolean)=>render(<MemoryRouter initialEntries={[survey?'/admin/scale-library-governance?workspace=survey':'/admin/scale-library-governance']}><AuthProvider><SessionReady/></AuthProvider></MemoryRouter>)
describe('governance visible workspace construction',()=>{
  it('serializes only the visible Survey detail and preserves inspected data, reason and grants across views',async()=>{
    // The Survey workspace branch of this shared component: the modern tabbed
    // view with the sidebar reason field, where only the visible detail region
    // serializes and the grant panel follows the catalog view.
    open(true)
    fireEvent.click(await screen.findByRole('button',{name:'查看自编精确版本详情'}))
    await screen.findByRole('region',{name:'公共量表精确版本详情'})
    expect(catalogSerialized).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button',{name:'查看 / 分配只读使用权限'}))
    await waitFor(()=>expect(screen.getByRole('button',{name:'读取可见授权对象'})).toBeEnabled())
    catalogSerialized.mockClear()
    fireEvent.change(screen.getByLabelText('审核、下架或撤权说明'),{target:{value:'Checked frozen version'}})
    expect(catalogSerialized).toHaveBeenCalledTimes(1)
    catalogSerialized.mockClear()
    fireEvent.click(screen.getByRole('button',{name:/入库审批/}))
    expect(catalogSerialized).not.toHaveBeenCalled()
    expect(screen.queryByRole('region',{name:'精确版本使用授权'})).not.toBeInTheDocument()
    expect(screen.getByRole('button',{name:'批准精确版本入库'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'读取精确版本审核内容'}))
    await screen.findByRole('region',{name:'审核冻结内容：Synthetic scale · release'})
    expect(submissionSerialized).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button',{name:'批准精确版本入库'})).toBeEnabled()
    submissionSerialized.mockClear()
    fireEvent.click(screen.getByRole('button',{name:/量表目录/}))
    expect(submissionSerialized).not.toHaveBeenCalled()
    expect(catalogSerialized).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('region',{name:'精确版本使用授权'})).toBeInTheDocument()
    expect(screen.getByLabelText('审核、下架或撤权说明')).toHaveValue('Checked frozen version')
    expect(screen.getByText('完整版本记录').closest('details')).not.toHaveAttribute('open')
    fireEvent.click(screen.getByRole('button',{name:/入库审批/}))
    expect(screen.getByRole('region',{name:'审核冻结内容：Synthetic scale · release'})).toHaveTextContent('submission frozen content')
    expect(screen.getByRole('button',{name:'批准精确版本入库'})).toBeEnabled()
    expect(api.catalogDetail).toHaveBeenCalledTimes(1)
    expect(api.submissionDetail).toHaveBeenCalledTimes(1)
    expect(api.grants).toHaveBeenCalledTimes(1)
    expect(api.review).not.toHaveBeenCalled()
    expect(session.me).toHaveBeenCalledTimes(1)
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
    expect(session.me).toHaveBeenCalledTimes(1)
  })
  it('does not load protected workspace data when the real provider has no valid session',async()=>{
    session.me.mockResolvedValue({code:0,message:'No synthetic session',data:null})
    open(false)
    await screen.findByText('需要有效测试会话')
    expect(api.capabilities).not.toHaveBeenCalled()
    expect(api.catalog).not.toHaveBeenCalled()
    expect(api.review).not.toHaveBeenCalled()
  })
})
