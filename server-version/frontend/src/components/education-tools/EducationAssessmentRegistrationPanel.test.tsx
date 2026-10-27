import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,describe,it,expect,vi} from 'vitest'
import {EducationAssessmentRegistrationPanel} from './EducationAssessmentRegistrationPanel'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const base=`/organizations/${id(1)}/assessment-resource-registrations`
const pinnedLicenses=[{resourceId:id(2),grantId:id(3)},{resourceId:id(5),grantId:id(15)},{resourceId:id(10),grantId:id(20)}]
const source={sourceCompositeId:id(2),title:'获授权来源',canPrepare:true,unavailableReason:null,licenses:pinnedLicenses,canPublish:false}
const prep={resourceId:id(8),product:'TEACHER',organizationId:id(1),family:'BUNDLE',sourceCompositeId:id(2),runtimeCompositeId:id(9),preparationHash:'p'.repeat(64),title:'新登记',canPublish:false,licenses:pinnedLicenses,units:[{itemId:id(4),family:'COGNITIVE',measurement:{releaseId:id(5),contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64)}}]}
const options={emptySelectionAllowed:true,units:[{...prep.units[0],references:[{releaseId:id(6),contentHash:'c'.repeat(64),selectable:true,unavailableReason:null,licenses:[{resourceId:id(6),grantId:id(16)},{resourceId:id(10),grantId:id(20)},{resourceId:id(11),grantId:id(21)}],choices:[{entryKey:'approved-reference',metricKey:'accuracy',referenceKind:'PERCENTILE'}]}],reports:[{releaseId:id(7),contentHash:'d'.repeat(64),selectable:true,unavailableReason:null,licenses:[{resourceId:id(7),grantId:id(17)},{resourceId:id(10),grantId:id(20)},{resourceId:id(11),grantId:id(21)},{resourceId:id(12),grantId:id(22)}],audience:'teacher',title:'批准报告',metricKeys:['accuracy']}]}]}
afterEach(cleanup)
function setup(custom?:(path:string,method:string,data:any)=>unknown){
 let preparedId=id(8)
 const api=vi.fn(async(path:string,method='GET',data?:any)=>{
  const result=custom?.(path,method,data);if(result!==undefined)return result
  if(path===base)return {list:[],nextCursor:null}
  if(path===base+'/source-candidates')return {list:[source]}
  if(path===base+'/preparations'&&method==='POST'){preparedId=data.resourceId;return {...prep,resourceId:preparedId}}
  if(path.endsWith('/content-choices'))return options
  if(path===base+'/preparations/'+preparedId)return {...prep,resourceId:preparedId}
  if(path.endsWith('/register'))return {resourceId:preparedId,status:'DRAFT',entryHash:'frozen'}
  if(path===base+'/'+preparedId)return {resourceId:preparedId,status:'DRAFT',entryHash:'frozen',createdBy:'author',entry:{educationOrigin:{feedbackPolicy:{schemaVersion:1,mode:'IMMEDIATE'}}}}
  throw Error('Unexpected '+path)
 })
 const props={api:api as never,organizationId:id(1),actorId:'author',product:'TEACHER' as const}
 return {...render(<EducationAssessmentRegistrationPanel {...props}/>),api,props}
}
async function prepare(){
 fireEvent.click(screen.getByRole('button',{name:'读取登记权限与资源'}))
 fireEvent.click(await screen.findByRole('button',{name:'读取获授权来源'}))
 await screen.findByRole('option',{name:/获授权来源/})
 fireEvent.change(screen.getByLabelText('获授权来源'),{target:{value:id(2)}})
 fireEvent.change(screen.getByLabelText('登记标题'),{target:{value:'新登记'}})
 fireEvent.click(screen.getByRole('button',{name:'准备独立教育版本'}))
 await screen.findByLabelText('披露政策编号（系统标识）')
}
describe('shared education registration management real client contracts',()=>{
 it('presents readable frozen metadata and preserves historical missing feedback policy without inventing defaults',async()=>{
  const {api}=setup((path,method)=>{
   if(path===base)return {list:[{resourceId:id(8),title:'已冻结版本',status:'PUBLISHED',entryHash:'frozen'}],nextCursor:null}
   if(path===base+'/'+id(8)&&method==='GET')return {resourceId:id(8),status:'PUBLISHED',entryHash:'frozen',createdBy:'creator-account',reviewedBy:'independent-reviewer',entry:{title:'已冻结版本',applicability:{resourceKind:'BUNDLE',resourceVersion:'1.0.0'},educationOrigin:{family:'BUNDLE',units:[{...prep.units[0],references:[{releaseId:id(6),contentHash:'c'.repeat(64)}],report:{releaseId:id(7),contentHash:'d'.repeat(64)}}]},resultDisclosure:{audiences:{RESPONDENT:{mode:'NONE'}}}}}
  })
  fireEvent.click(screen.getByRole('button',{name:'读取登记权限与资源'}));fireEvent.click(await screen.findByRole('button',{name:/已冻结版本/}))
  const summary=within(await screen.findByLabelText('冻结版本摘要'))
  expect(summary.getByText('组合测评')).toBeInTheDocument();expect(summary.getByText('1.0.0')).toBeInTheDocument()
  expect(summary.getByText('creator-account')).toBeInTheDocument();expect(summary.getByText('independent-reviewer')).toBeInTheDocument()
  expect(summary.getByText('不展示反馈')).toBeInTheDocument();expect(summary.getByText('未配置（保留原历史政策）')).toBeInTheDocument()
  expect(summary.getByText(new RegExp(id(6)))).toBeInTheDocument();expect(summary.getByText(new RegExp(id(7)))).toBeInTheDocument()
  const details=screen.getByText('查看冻结技术详情').closest('details')!;expect(details).not.toHaveAttribute('open')
  expect(api.mock.calls.some(([,method])=>method==='POST')).toBe(false)
 })
 it('does not expose operations before actual issuer read succeeds and keeps denial closed',async()=>{
  setup(path=>{if(path===base)throw Object.assign(Error('无组织登记权限'),{status:403})})
  expect(screen.queryByRole('button',{name:'准备独立教育版本'})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'读取登记权限与资源'}))
  await screen.findByRole('alert');expect(screen.queryByRole('button',{name:'读取获授权来源'})).not.toBeInTheDocument()
 })
 it('freezes exact P/R, real grant ids, explicit scheduled UTC and respondent-only disclosure without publication flags',async()=>{
  const {api}=setup();await prepare()
  expect(api).toHaveBeenCalledWith(base+'/preparations','POST',expect.objectContaining({licenses:pinnedLicenses}))
  fireEvent.click(screen.getByRole('checkbox',{name:/approved-reference/}))
  fireEvent.change(screen.getByLabelText('精确报告 R'),{target:{value:id(7)}})
  fireEvent.change(screen.getByLabelText('本人披露'),{target:{value:'INDIVIDUAL_SUMMARY'}})
  fireEvent.change(screen.getByLabelText('反馈开放方式'),{target:{value:'SCHEDULED'}})
  fireEvent.change(screen.getByLabelText('开放时间（本地时区）'),{target:{value:'2099-01-02T03:04'}})
  const button=screen.getByRole('button',{name:'冻结登记为草稿'});fireEvent.click(button);fireEvent.click(button)
  await screen.findByLabelText('冻结登记详情')
  const calls=api.mock.calls.filter(([path])=>path.endsWith('/register'));expect(calls).toHaveLength(1)
  const payload=calls[0][2]
  expect(payload.feedbackPolicy).toEqual({schemaVersion:1,mode:'SCHEDULED',releaseAt:new Date('2099-01-02T03:04').toISOString()})
  expect(payload.references.units[0].choices).toEqual([{releaseId:id(6),entryKey:'approved-reference',priority:0}])
  expect(payload.reports).toEqual([{itemId:id(4),releaseId:id(7)}])
  expect(payload.licenses).toEqual([...pinnedLicenses,...options.units[0].references[0].licenses,...options.units[0].reports[0].licenses].filter((row,index,all)=>all.findIndex(other=>other.resourceId===row.resourceId)===index).sort((a,b)=>a.resourceId.localeCompare(b.resourceId)))
  expect(payload.disclosure.policyKey).toBe(`education-assessment:${(screen.getByLabelText('登记编号') as HTMLInputElement).value}:disclosure:v1`)
  expect(payload.disclosure.audiences.ORGANIZATION.mode).toBe('NONE')
  expect(payload.disclosure.audiences.RESPONDENT.metricKeys).toEqual(['accuracy'])
  expect(payload).not.toHaveProperty('approved');expect(screen.queryByLabelText('反馈开放方式')).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'独立审核'})).not.toBeInTheDocument()
 })
 it('requires an explicit immediate choice and supports pure Form with explicit empty P/R and completion only',async()=>{
  const {api}=setup(path=>path.endsWith('/content-choices')?{emptySelectionAllowed:true,units:[]}:undefined);await prepare()
  expect(screen.getByRole('button',{name:'冻结登记为草稿'})).toBeDisabled()
  expect(screen.queryByRole('option',{name:'已批准报告的本人摘要'})).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('反馈开放方式'),{target:{value:'IMMEDIATE'}})
  fireEvent.click(screen.getByRole('button',{name:'冻结登记为草稿'}))
  await waitFor(()=>expect(api.mock.calls.some(([path])=>path.endsWith('/register'))).toBe(true))
  const input=api.mock.calls.find(([path])=>path.endsWith('/register'))![2]
  expect(input).toMatchObject({feedbackPolicy:{schemaVersion:1,mode:'IMMEDIATE'},references:{schemaVersion:1,units:[]},reports:[]})
  expect(input.disclosure.audiences.RESPONDENT.mode).toBe('COMPLETION_ONLY')
 })
 it('recovers a lost registration response by original id without repeating the mutation',async()=>{
  const {api}=setup((path,method)=>{if(method==='POST'&&path.endsWith('/register'))throw Error('响应中断')});await prepare()
  fireEvent.change(screen.getByLabelText('反馈开放方式'),{target:{value:'IMMEDIATE'}})
  fireEvent.click(screen.getByRole('button',{name:'冻结登记为草稿'}));await screen.findByRole('alert')
  expect(screen.getByRole('button',{name:'冻结登记为草稿'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'回读准备或冻结登记'}))
  await screen.findByLabelText('冻结登记详情')
  expect(api.mock.calls.filter(([path])=>path.endsWith('/register'))).toHaveLength(1)
 })
 it('discards a pending read after organization switches',async()=>{
  let resolve!:(value:unknown)=>void
  const late=new Promise(yes=>{resolve=yes})
  const {props,rerender}=setup(path=>path===base?late:undefined)
  fireEvent.click(screen.getByRole('button',{name:'读取登记权限与资源'}))
  rerender(<EducationAssessmentRegistrationPanel {...props} organizationId={id(20)}/>)
  await act(async()=>resolve({list:[{resourceId:id(8),title:'旧学校记录',status:'DRAFT'}],nextCursor:null}))
  expect(screen.queryByText(/旧学校记录/)).not.toBeInTheDocument();expect(screen.queryByLabelText('登记编号')).not.toBeInTheDocument()
 })
 it('recovers an existing preparation by id and reloads actual source and grant choices without creating another preparation',async()=>{
  let reads=0
  const {api}=setup((path,method)=>{if(path===base+'/'+id(8)&&method==='GET'&&++reads===1)throw Object.assign(Error('not registered'),{status:404});if(path===base+'/source-candidates')throw Error('不得重新发现 grant')})
  fireEvent.click(screen.getByRole('button',{name:'读取登记权限与资源'}))
  fireEvent.change(await screen.findByLabelText('登记编号'),{target:{value:id(8)}})
  fireEvent.click(screen.getByRole('button',{name:'回读准备或冻结登记'}))
  await screen.findByLabelText('披露政策编号（系统标识）')
  expect(screen.getByLabelText('登记标题')).toHaveValue(prep.title)
  expect(api.mock.calls.some(([path])=>path===base+'/source-candidates')).toBe(false)
  fireEvent.change(screen.getByLabelText('反馈开放方式'),{target:{value:'IMMEDIATE'}})
  fireEvent.click(screen.getByRole('button',{name:'冻结登记为草稿'}))
  await screen.findByLabelText('冻结登记详情')
  expect(api.mock.calls.find(([path])=>path.endsWith('/register'))![2].licenses).toEqual(pinnedLicenses)
 })
 it('refuses multiple grant conflicts before POST rather than replacing a pinned source asset',async()=>{
  const conflicting={...options,units:[{...options.units[0],references:[{...options.units[0].references[0],licenses:[{resourceId:id(10),grantId:id(99)}]}]}]}
  const {api}=setup(path=>path.endsWith('/content-choices')?conflicting:undefined);await prepare()
  fireEvent.click(screen.getByRole('checkbox',{name:/approved-reference/}))
  fireEvent.change(screen.getByLabelText('反馈开放方式'),{target:{value:'IMMEDIATE'}})
  fireEvent.click(screen.getByRole('button',{name:'冻结登记为草稿'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('同一资源出现不同授权证明')
  expect(api.mock.calls.some(([path])=>path.endsWith('/register'))).toBe(false)
  expect(screen.getByRole('button',{name:'冻结登记为草稿'})).toBeEnabled()
 })
 it('disables unavailable sources and P/R without guessing missing authority',async()=>{
  const unavailable={...source,sourceCompositeId:id(90),title:'缺许可来源',canPrepare:false,unavailableReason:'MISSING_DISTRIBUTION_AUTHORITY',licenses:[]}
  setup(path=>path===base+'/source-candidates'?{list:[source,unavailable]}:path.endsWith('/content-choices')?{...options,units:[{...options.units[0],references:[{...options.units[0].references[0],selectable:false,unavailableReason:'MISSING_DISTRIBUTION_AUTHORITY',licenses:[],choices:[]}],reports:[{...options.units[0].reports[0],selectable:false,unavailableReason:'CONTENT_NOT_AVAILABLE',licenses:[],metricKeys:[]}]}]}:undefined)
  await prepare()
  expect(screen.getByRole('option',{name:/缺许可来源/})).toBeDisabled()
  expect(screen.queryByRole('checkbox',{name:/approved-reference/})).not.toBeInTheDocument()
  expect(screen.getByText(/参考 .*缺少必要分发许可/)).toBeInTheDocument()
  expect(within(screen.getByLabelText('精确报告 R')).getByRole('option',{name:/批准报告/})).toBeDisabled()
 })
 it('submits NONE disclosure with stable readonly policy id and only original licenses when P/R are not selected',async()=>{
  const {api}=setup();await prepare()
  expect(screen.getByLabelText('披露政策编号（系统标识）')).toHaveAttribute('readonly')
  fireEvent.change(screen.getByLabelText('本人披露'),{target:{value:'NONE'}})
  fireEvent.change(screen.getByLabelText('反馈开放方式'),{target:{value:'IMMEDIATE'}})
  fireEvent.click(screen.getByRole('button',{name:'冻结登记为草稿'}))
  await screen.findByLabelText('冻结登记详情')
  const payload=api.mock.calls.find(([path])=>path.endsWith('/register'))![2]
  expect(payload.licenses).toEqual(pinnedLicenses)
  expect(payload.reports).toEqual([])
  expect(payload.references.units[0].choices).toEqual([])
  expect(payload.disclosure.audiences.RESPONDENT).toMatchObject({mode:'NONE',metricKeys:[]})
 })
 it('clears an old source selection when the current source list refreshes',async()=>{
  const {api}=setup();fireEvent.click(screen.getByRole('button',{name:'读取登记权限与资源'}))
  const load=await screen.findByRole('button',{name:'读取获授权来源'});fireEvent.click(load)
  await screen.findByRole('option',{name:/获授权来源/})
  fireEvent.change(screen.getByLabelText('获授权来源'),{target:{value:id(2)}})
  fireEvent.change(screen.getByLabelText('登记标题'),{target:{value:'新登记'}})
  fireEvent.click(load)
  await waitFor(()=>expect(screen.getByLabelText('获授权来源')).toHaveValue(''))
  expect(screen.getByRole('button',{name:'准备独立教育版本'})).toBeDisabled()
  expect(api.mock.calls.some(([,method])=>method==='POST')).toBe(false)
 })
 it('cancels a pending permission read without late resurrection',async()=>{
  let resolve!:(value:unknown)=>void;const pending=new Promise(yes=>{resolve=yes})
  setup(path=>path===base?pending:undefined)
  fireEvent.click(screen.getByRole('button',{name:'读取登记权限与资源'}))
  fireEvent.click(screen.getByRole('button',{name:'取消读取登记'}))
  await act(async()=>resolve({list:[],nextCursor:null}))
  expect(screen.queryByLabelText('登记编号')).not.toBeInTheDocument()
 })
 it('reviews an independent frozen registration with its hash and reads the result back',async()=>{
  let status='DRAFT'
  const {api}=setup((path,method)=>{
   if(path===base)return {list:[{resourceId:id(8),title:'待独立审核',status,entryHash:'h1'}],nextCursor:null}
   if(path===base+'/'+id(8)+'/review'){status='REVIEWED';return {resourceId:id(8),status,entryHash:'h2'}}
   if(path===base+'/'+id(8)&&method==='GET')return {resourceId:id(8),status,entryHash:status==='DRAFT'?'h1':'h2',createdBy:'other-author',entry:{frozen:true}}
  })
  fireEvent.click(screen.getByRole('button',{name:'读取登记权限与资源'}));fireEvent.click(await screen.findByRole('button',{name:/待独立审核/}))
  fireEvent.change(await screen.findByLabelText('审核或状态变更理由'),{target:{value:'已独立核对'}})
  fireEvent.click(screen.getByRole('button',{name:'独立审核'}))
  expect(await screen.findByRole('button',{name:'发布已审核版本'})).toBeInTheDocument()
  expect(api).toHaveBeenCalledWith(base+'/'+id(8)+'/review','POST',{expectedEntryHash:'h1',reason:'已独立核对'})
 })
})

describe('bounded resource pagination',()=>{
 it('continues an empty eligible source page and preserves the selected source grant',async()=>{
  const {api}=setup(path=>path===base+'/source-candidates'?{list:[],nextCursor:id(50)}:path===base+'/source-candidates?cursor='+id(50)?{list:[source],nextCursor:null}:undefined)
  fireEvent.click(screen.getByRole('button',{name:'读取登记权限与资源'}));fireEvent.click(await screen.findByRole('button',{name:'读取获授权来源'}))
  fireEvent.click(await screen.findByRole('button',{name:'继续加载获授权来源'}));await screen.findByRole('option',{name:/获授权来源/})
  fireEvent.change(screen.getByLabelText('获授权来源'),{target:{value:id(2)}});fireEvent.change(screen.getByLabelText('登记标题'),{target:{value:'分页来源'}})
  fireEvent.click(screen.getByRole('button',{name:'准备独立教育版本'}));await screen.findByLabelText('反馈开放方式')
  expect(api.mock.calls.find(([path,method])=>path===base+'/preparations'&&method==='POST')?.[2].licenses).toEqual(pinnedLicenses)
  expect(screen.queryByRole('button',{name:'继续加载获授权来源'})).toBeNull()
 })
 it('appends P/R choices without clearing selections or replacing the original grant',async()=>{
  const second={...options,nextCursor:null,units:[{...options.units[0],references:[],reports:[{...options.units[0].reports[0],releaseId:id(30),licenses:[{resourceId:id(30),grantId:id(31)}],title:'第二页报告'}]}]}
  const {api}=setup(path=>path.endsWith('/content-choices')?{...options,nextCursor:id(50)}:path.endsWith('/content-choices?cursor='+id(50))?second:undefined);await prepare()
  fireEvent.click(screen.getByRole('checkbox',{name:/approved-reference/}));fireEvent.change(screen.getByLabelText('精确报告 R'),{target:{value:id(7)}})
  fireEvent.click(screen.getByRole('button',{name:'继续加载参考与报告版本'}));await screen.findByRole('option',{name:/第二页报告/})
  expect(screen.getByRole('checkbox',{name:/approved-reference/})).toBeChecked();expect(screen.getByLabelText('精确报告 R')).toHaveValue(id(7))
  fireEvent.change(screen.getByLabelText('反馈开放方式'),{target:{value:'IMMEDIATE'}});fireEvent.click(screen.getByRole('button',{name:'冻结登记为草稿'}));await screen.findByLabelText('冻结登记详情')
  const payload=api.mock.calls.find(([path])=>path.endsWith('/register'))![2];expect(payload.reports).toEqual([{itemId:id(4),releaseId:id(7)}]);expect(payload.licenses).toContainEqual({resourceId:id(7),grantId:id(17)})
 })
 it('refuses a changed measurement on later pages and preserves the prior selection',async()=>{
  setup(path=>path.endsWith('/content-choices')?{...options,nextCursor:id(50)}:path.endsWith('/content-choices?cursor='+id(50))?{...options,nextCursor:null,units:[{...options.units[0],measurement:{...options.units[0].measurement,contentHash:'changed'}}]}:undefined);await prepare()
  fireEvent.change(screen.getByLabelText('精确报告 R'),{target:{value:id(7)}});fireEvent.click(screen.getByRole('button',{name:'继续加载参考与报告版本'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('固定内容版本发生变化');expect(screen.getByLabelText('精确报告 R')).toHaveValue(id(7))
 })
})
