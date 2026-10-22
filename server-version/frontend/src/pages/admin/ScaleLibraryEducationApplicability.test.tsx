import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import ScaleLibraryGovernance from './ScaleLibraryGovernance'
const api=vi.hoisted(()=>({capabilities:vi.fn(),submissions:vi.fn(),catalog:vi.fn(),submissionDetail:vi.fn()}))
vi.mock('../../api/scaleLibraryGovernance',()=>({governanceApi:()=>api,submissionStatusLabel:{SUBMITTED:'待审核'}}))
const metadata={title:'待审量表',author:'作者',copyright:'自有',applicability:'描述性用途',scoringDescription:'求和',reportDescription:'报告'}
const declared={schemaVersion:1,administrations:[{population:'TEACHER',responseMode:'STUDENT_REPORT'}]}
const row={id:'application',releaseId:'r1',version:2,metadata,status:'SUBMITTED',product:'TRAINING',educationApplicability:{schemaVersion:1,administrations:[{population:'STUDENT',responseMode:'SELF'}]}}
const detail=(overrides:Record<string,unknown>={})=>({...row,educationApplicability:declared,educationApplicabilityHash:'snapshot-hash',snapshot:{definition:{}},mediaManifest:{schemaVersion:1,manifestHash:'empty',releaseIds:['r1'],items:[]},release:{releaseId:'r1',version:'1'},dependencies:[],...overrides})
beforeEach(()=>{vi.resetAllMocks();api.capabilities.mockResolvedValue({systemAdmin:true,reviewGrants:[],distributionGrants:[]});api.submissions.mockResolvedValue({list:[row]});api.catalog.mockResolvedValue({list:[],page:1,pageSize:25,hasMore:false})})
afterEach(()=>{cleanup();vi.restoreAllMocks()})
async function inspect(){render(<MemoryRouter><ScaleLibraryGovernance/></MemoryRouter>);fireEvent.click(await screen.findByRole('button',{name:'读取精确版本审核内容'}));await waitFor(()=>expect(api.submissionDetail).toHaveBeenCalled())}
describe('administrator exact-version applicability snapshot',()=>{
 it('shows the verified detail declaration and hash read-only rather than using list metadata',async()=>{
  api.submissionDetail.mockResolvedValue(detail())
  render(<MemoryRouter><ScaleLibraryGovernance/></MemoryRouter>)
  const button=await screen.findByRole('button',{name:'读取精确版本审核内容'})
  expect(screen.queryByRole('region',{name:'本次版本适用方式'})).not.toBeInTheDocument()
  fireEvent.click(button)
  const summary=await screen.findByRole('region',{name:'本次版本适用方式'})
  expect(within(summary).getByText('教师 · 学生评教师')).toBeInTheDocument()
  expect(within(summary).getByText('适用方式快照摘要：snapshot-hash')).toBeInTheDocument()
  expect(within(summary).queryByText('学生 · 学生自评')).not.toBeInTheDocument()
  expect(within(summary).queryByRole('combobox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'增加适用方式'})).not.toBeInTheDocument()
 })
 it.each([{version:1},{releaseId:'other-release'}])('does not present mismatched detail as the reviewed snapshot (%j)',async mismatch=>{
  api.submissionDetail.mockResolvedValue(detail(mismatch))
  await inspect()
  await screen.findByRole('region',{name:'审核冻结内容：待审量表 · r1'})
  expect(screen.queryByRole('region',{name:'本次版本适用方式'})).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:'批准精确版本入库'})).toBeDisabled()
 })
 it.each([undefined,null])('treats an old absent detail declaration as undeclared without edit controls (%s)',async value=>{
  api.submissionDetail.mockResolvedValue(detail({educationApplicability:value,educationApplicabilityHash:null}))
  await inspect()
  const summary=await screen.findByRole('region',{name:'本次版本适用方式'})
  expect(summary).toHaveTextContent('未声明学校/教师适用方式')
  expect(within(summary).queryByRole('list')).not.toBeInTheDocument()
  expect(within(summary).queryByRole('combobox')).not.toBeInTheDocument()
 })
})
