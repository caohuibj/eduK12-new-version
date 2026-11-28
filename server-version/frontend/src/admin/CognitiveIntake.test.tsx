import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import CognitiveIntake from './CognitiveIntake'
import {isSystemLoginTarget,isSystemWorkspacePath} from './systemWorkspace'

const mock=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),user:{id:'system-a',platformRole:'SYSTEM_ADMIN'}}))
vi.mock('../api/client',()=>({default:{get:mock.get,post:mock.post}}))
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>({user:mock.user})}))
vi.mock('./AdminStepUp',()=>({default:({onVerified}:{onVerified?:(requestedAt:number)=>void})=>
  <button type="button" onClick={()=>onVerified?.(Date.now())}>模拟管理员双因素验证</button>}))
const root='/admin/permissions/cognitive-intake'
const choice={testType:'numberline',configVersion:'1.0.1',engineVersion:'1.0.1',scoringVersion:'1.0.0'}
const selection={schemaVersion:1,items:[choice]}
const plan={...choice,action:'CREATE_DRAFT',reasons:[],sourceHash:'same-source'}
const candidate={...choice,name:'数字线估计',reportVersion:'1.0.1',
  profiles:[{key:'experience',estimatedMinutes:[2,2]},{key:'research',estimatedMinutes:[6,9]}],reportMetrics:['paePercent','biasPercent'],plan}
const catalog={schemaVersion:1,registered:[candidate,{...candidate,testType:'symbolmatch',name:'符号数字配对',plan:{...plan,testType:'symbolmatch'}}],
  pending:[{testType:'wordproblem',sourcePR:441,reasons:['科研版所需题量超过现有独立材料，待审核。']}]}
const response=(data:unknown)=>({code:0,message:'ok',data})
const operation=(row:unknown,mode='PREVIEW')=>response({schemaVersion:1,mode,rows:[row],hasBlocked:false})
function deferred<T>(){
  let resolve!:(value:T)=>void,reject!:(reason:Error)=>void
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no})
  return {promise,resolve,reject}
}
function choose(name='数字线估计'){
  const details=screen.getByText(name,{selector:'strong'}).closest('details')!
  details.open=true;fireEvent(details,new Event('toggle'))
  fireEvent.click(screen.getByRole('button',{name:`选择 ${name}`}))
}
beforeEach(()=>{
  vi.clearAllMocks();mock.user={id:'system-a',platformRole:'SYSTEM_ADMIN'}
  mock.get.mockResolvedValue(response(catalog))
  mock.post.mockResolvedValue(operation(plan))
})
afterEach(cleanup)

it('keeps pending candidates separate and installs only the explicitly previewed exact selection as a draft',async()=>{
  const receipt=deferred<ReturnType<typeof response>>()
  mock.post.mockImplementation((path:string)=>path===root+'/preview'?Promise.resolve(operation(plan)):path===root+'/install'?receipt.promise:Promise.reject(new Error('Unexpected mutation')))
  render(<CognitiveIntake/>)
  await screen.findByText('数字线估计',{selector:'strong'})
  expect(screen.getByText('wordproblem',{selector:'strong'})).toBeTruthy()
  expect(screen.getByText('科研版所需题量超过现有独立材料，待审核。')).toBeInTheDocument()
  expect(screen.queryByRole('button',{name:/选择 wordproblem/})).toBeNull()
  choose()
  expect(screen.queryByRole('button',{name:'安装为草稿'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'预览所选配置'}))
  const install=await screen.findByRole('button',{name:'安装为草稿'})
  expect(mock.post).toHaveBeenCalledExactlyOnceWith(root+'/preview',selection)
  fireEvent.click(screen.getByText('安装操作验证',{selector:'summary'}))
  fireEvent.click(screen.getByRole('button',{name:'模拟管理员双因素验证'}))
  expect(mock.post).toHaveBeenCalledTimes(1) // Step-up never submits an installation.
  fireEvent.click(install);fireEvent.click(install)
  expect(mock.post).toHaveBeenCalledTimes(2)
  expect(mock.post).toHaveBeenLastCalledWith(root+'/install',selection)
  expect(screen.getByText('选择 符号数字配对',{selector:'button'})).toBeDisabled()
  await act(async()=>receipt.resolve(operation({...plan,action:'CREATED_DRAFT',configId:'draft-1',status:'DRAFT'},'APPLY')))
  await screen.findByText('已安装为草稿（DRAFT / GRANT）。尚未发布、公开或分配使用权。')
  expect(screen.queryByRole('button',{name:'安装为草稿'})).toBeNull()
  expect(mock.post.mock.calls.map(call=>call[0])).toEqual([root+'/preview',root+'/install'])
  expect(isSystemLoginTarget('/admin/cognitive-intake?tab=reviewed')).toBe(true)
  expect(isSystemWorkspacePath('/admin/cognitive-intake')).toBe(true)
})

it('requires a fresh read after an unknown installation and distinguishes an existing draft from publication',async()=>{
  mock.post.mockImplementation((path:string)=>path.endsWith('/preview')?Promise.resolve(operation(plan)):Promise.reject(new Error('连接中断')))
  render(<CognitiveIntake/>);await screen.findByText('数字线估计',{selector:'strong'});choose()
  fireEvent.click(screen.getByRole('button',{name:'预览所选配置'}))
  fireEvent.click(await screen.findByRole('button',{name:'安装为草稿'}))
  await screen.findByRole('alert')
  expect(screen.getByRole('alert')).toHaveTextContent('安装结果尚未确认')
  expect(screen.queryByRole('button',{name:'安装为草稿'})).toBeNull()
  expect(screen.getByRole('button',{name:'预览所选配置'})).toBeDisabled()
  expect(mock.post).toHaveBeenCalledTimes(2)
  const existing={...plan,action:'ALREADY_PRESENT',configId:'draft-1',status:'DRAFT'}
  mock.get.mockResolvedValueOnce(response({...catalog,registered:[{...candidate,plan:existing}]}))
  fireEvent.click(screen.getByRole('button',{name:'刷新回读'}))
  await screen.findByText('已存在 · 草稿')
  expect(screen.queryByRole('button',{name:'预览所选配置'})).toBeNull()
  expect(mock.post).toHaveBeenCalledTimes(2) // Reading back does not replay a write.
  choose();mock.post.mockResolvedValueOnce(operation(existing))
  fireEvent.click(screen.getByRole('button',{name:'预览所选配置'}))
  await screen.findByText('预览结果：已存在 · 草稿')
  expect(screen.queryByRole('button',{name:'安装为草稿'})).toBeNull()
})

it('does not offer installation for an already published configuration or a mismatched preview receipt',async()=>{
  const published={...plan,action:'ALREADY_PRESENT',configId:'published-1',status:'PUBLISHED'}
  mock.post.mockResolvedValueOnce(operation(published))
  render(<CognitiveIntake/>);await screen.findByText('数字线估计',{selector:'strong'});choose()
  fireEvent.click(screen.getByRole('button',{name:'预览所选配置'}))
  await screen.findByText('预览结果：已存在 · 已发布')
  expect(screen.queryByRole('button',{name:'安装为草稿'})).toBeNull()
  choose('符号数字配对')
  mock.post.mockResolvedValueOnce(operation(plan)) // Returned numberline identity is not this selection.
  fireEvent.click(screen.getByRole('button',{name:'预览所选配置'}))
  await screen.findByRole('alert')
  expect(screen.getByRole('alert')).toHaveTextContent('精确选择的完整回执')
  expect(screen.queryByRole('button',{name:'安装为草稿'})).toBeNull()
  expect(mock.post.mock.calls.every(call=>call[0]===root+'/preview')).toBe(true)
})

it('isolates state by the current system administrator and ignores a late response from the previous account',async()=>{
  const oldRead=deferred<ReturnType<typeof response>>(),newRead=deferred<ReturnType<typeof response>>()
  mock.get.mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(newRead.promise)
  const view=render(<CognitiveIntake/>)
  mock.user={id:'system-b',platformRole:'SYSTEM_ADMIN'};view.rerender(<CognitiveIntake/>)
  await act(async()=>newRead.resolve(response({...catalog,registered:[{...candidate,name:'当前账号候选'}]})))
  await screen.findByText('当前账号候选',{selector:'strong'})
  await act(async()=>oldRead.resolve(response({...catalog,registered:[{...candidate,name:'旧账号迟到候选'}]})))
  expect(screen.queryByText('旧账号迟到候选')).toBeNull()
  expect(mock.post).not.toHaveBeenCalled()
  view.unmount()
  mock.user={id:'standard',platformRole:'STANDARD'};render(<CognitiveIntake/>)
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('仅系统管理员'))
  expect(mock.get).toHaveBeenCalledTimes(2)
})

it('filters registered candidates and focuses the selected operation panel',async()=>{
 render(<CognitiveIntake/>);await screen.findByText('数字线估计',{selector:'strong'})
 fireEvent.change(screen.getByRole('searchbox',{name:'检索认知候选'}),{target:{value:'symbolmatch'}})
 expect(screen.queryByText('数字线估计',{selector:'strong'})).toBeNull()
 expect(screen.getByText('符号数字配对',{selector:'strong'})).toBeVisible()
 choose('符号数字配对')
 expect(screen.getByRole('region',{name:'本次认知配置选择'})).toHaveFocus()
 expect(screen.getByRole('button',{name:'预览所选配置'})).toBeVisible()
 expect(mock.post).not.toHaveBeenCalled()
})

it('publishes an installed DRAFT config and approves a profile in one admin flow',async()=>{
 const draftPlan={...plan,action:'ALREADY_PRESENT',configId:'cfg-1',status:'DRAFT'}
 mock.get.mockImplementation(async(path:string)=>path.startsWith(root)
  ?response({...catalog,registered:[{...candidate,plan:draftPlan}]})
  :response({configId:'cfg-1',profile:'experience',title:'数字线估计',artifactHash:'a'.repeat(64),report:{title:'数字线估计报告'}}))
 mock.post.mockImplementation(async(path:string)=>{
  if(path==='/cognitive/configs/cfg-1/publish')return response({id:'cfg-1',status:'PUBLISHED'})
  if(path==='/cognitive/profile-configurations/system/cfg-1/experience/approve')return response({artifactHash:'a'.repeat(64),allowedProducts:['SURVEY','TRAINING']})
  if(path==='/cognitive/configs/cfg-1/retire')return response({id:'cfg-1',status:'RETIRED'})
  throw new Error('Unexpected path: '+path)
 })
 render(<CognitiveIntake/>);await screen.findByText('数字线估计',{selector:'strong'});choose()
 fireEvent.click(await screen.findByRole('button',{name:'发布此配置'}))
 await screen.findByText(/配置已发布（PUBLISHED）/)
 fireEvent.click(await screen.findByRole('button',{name:'预览 Profile 摘要'}))
 await screen.findByText(/数字线估计报告/)
 fireEvent.click(await screen.findByRole('button',{name:'批准并启用此 Profile'}))
 await screen.findByText(/已批准 .*：准入产品 SURVEY、TRAINING/)
 const approveCall=mock.post.mock.calls.find(call=>call[0]==='/cognitive/profile-configurations/system/cfg-1/experience/approve')!
 expect(approveCall[1]).toMatchObject({expectedArtifactHash:'a'.repeat(64),allowedProducts:['SURVEY','TRAINING']})
})

it('preserves existing approvedProducts when adding another entry',async()=>{
 const publishedPlan={...plan,action:'ALREADY_PRESENT',configId:'cfg-1',status:'PUBLISHED'}
 mock.get.mockImplementation(async(path:string)=>path.startsWith(root)
  ?response({...catalog,registered:[{...candidate,plan:publishedPlan}]})
  :response({configId:'cfg-1',profile:'experience',title:'数字线估计',artifactHash:'a'.repeat(64),approvedProducts:['SCHOOL','TEACHER'],report:{title:'数字线估计报告'}}))
 mock.post.mockImplementation(async(path:string)=>{
  if(path==='/cognitive/profile-configurations/system/cfg-1/experience/approve')return response({artifactHash:'a'.repeat(64),allowedProducts:['SCHOOL','TEACHER','TRAINING']})
  throw new Error('Unexpected path: '+path)
 })
 render(<CognitiveIntake/>);await screen.findByText('数字线估计',{selector:'strong'});choose()
 fireEvent.click(await screen.findByRole('button',{name:'预览 Profile 摘要'}))
 await screen.findByText(/当前已启用入口：SCHOOL、TEACHER/)
 fireEvent.click(screen.getByRole('checkbox',{name:'TRAINING'}))
 await screen.findByText(/将新增：TRAINING/)
 fireEvent.click(await screen.findByRole('button',{name:'批准并启用此 Profile'}))
 const approveCall=mock.post.mock.calls.find(call=>call[0]==='/cognitive/profile-configurations/system/cfg-1/experience/approve')!
 expect(approveCall[1]).toMatchObject({expectedArtifactHash:'a'.repeat(64),allowedProducts:['SCHOOL','TEACHER','TRAINING']})
})

it('does not silently re-enable entries when a previously approved profile has no active entry',async()=>{
 const publishedPlan={...plan,action:'ALREADY_PRESENT',configId:'cfg-1',status:'PUBLISHED'}
 mock.get.mockImplementation(async(path:string)=>path.startsWith(root)
  ?response({...catalog,registered:[{...candidate,plan:publishedPlan}]})
  :response({configId:'cfg-1',profile:'experience',title:'数字线估计',artifactHash:'a'.repeat(64),approvedProducts:[],hasPriorPolicy:true}))
 render(<CognitiveIntake/>);await screen.findByText('数字线估计',{selector:'strong'});choose()
 fireEvent.click(await screen.findByRole('button',{name:'预览 Profile 摘要'}))
 await screen.findByText(/已有入口策略目前均未启用/)
 for(const entry of ['SURVEY','TRAINING','SCHOOL','TEACHER'])expect(screen.getByRole('checkbox',{name:entry})).not.toBeChecked()
 expect(screen.getByRole('button',{name:'批准并启用此 Profile'})).toBeDisabled()
 expect(mock.post).not.toHaveBeenCalled()
})

it('pages a long candidate directory and resets paging after search',async()=>{
 mock.get.mockResolvedValue(response({...catalog,registered:Array.from({length:13},(_,index)=>({...candidate,testType:`candidate-${index}`,name:`分页候选 ${index}`,plan:{...plan,testType:`candidate-${index}`}}))}))
 render(<CognitiveIntake/>);await screen.findByText('分页候选 0',{selector:'strong'})
 expect(screen.queryByText('分页候选 12',{selector:'strong'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'下一页'}))
 expect(screen.getByText('分页候选 12',{selector:'strong'})).toBeVisible()
 expect(screen.queryByText('分页候选 0',{selector:'strong'})).toBeNull()
 fireEvent.change(screen.getByRole('searchbox',{name:'检索认知候选'}),{target:{value:'candidate-0'}})
 await screen.findByText('分页候选 0',{selector:'strong'})
 expect(screen.queryByRole('navigation',{name:'认知候选分页'})).toBeNull()
 expect(mock.post).not.toHaveBeenCalled()
})

it('saves a report pending independent approval and opens the exact profile without enabling entries',async()=>{
 const source={...choice,id:'report-source',name:'原认知报告',profiles:[{key:'experience',estimatedMinutes:[2,2]}]}
 const display={id:source.id,title:source.name,introduction:'示例说明',instruction:'',disclaimer:'示例免责声明',practicalTips:[],reportVisibility:{}}
 const hash='a'.repeat(64)
 const profilePath='/cognitive/profile-configurations/system/saved-report/experience'
 mock.get.mockImplementation(async(path:string)=>{
  if(path===root)return response(catalog)
  if(path===root+'/reports?page=1')return response({rows:[source],hasMore:false})
  if(path===root+'/reports/'+source.id)return response(display)
  if(path===profilePath)return response({configId:'saved-report',profile:'experience',title:'新版报告',artifactHash:hash,approvedProducts:[]})
  throw new Error('Unexpected read: '+path)
 })
 mock.post.mockImplementation(async(path:string)=>{
  if(path===root+'/reports/'+source.id+'/preview')return response({previewHash:hash,source:{id:source.id,name:source.name,
    version:source.configVersion,measurementReleaseId:'same-C'},effectiveDisclosure:{audiences:{}}})
  if(path===root+'/reports/'+source.id+'/publish')return response({id:'saved-report',name:'新版报告',version:'r2',measurementReleaseId:'same-C',
    entryApproval:{status:'PENDING',configId:'saved-report',profileKeys:['experience']}})
  if(path===profilePath+'/approve')return response({artifactHash:hash,allowedProducts:['SCHOOL']})
  throw new Error('Unexpected write: '+path)
 })
 render(<CognitiveIntake/>)
 await screen.findByText('数字线估计',{selector:'strong'})
 fireEvent.click(screen.getByRole('button',{name:'读取已发布配置'}))
 const original=await screen.findByRole('combobox',{name:'原始认知配置'})
 fireEvent.change(original,{target:{value:source.id}})
 fireEvent.change(await screen.findByRole('textbox',{name:'新报告版本'}),{target:{value:'r2'}})
 fireEvent.click(screen.getByRole('button',{name:'预览报告修订'}))
 fireEvent.click(await screen.findByRole('button',{name:'保存报告新版本'}))
 await screen.findByText(/报告 r2 已保存。等待独立入口审批/)
 expect(screen.getByText(/配置标识 saved-report/)).toBeVisible()
 expect(mock.post.mock.calls.map(call=>call[0])).toEqual([root+'/reports/'+source.id+'/preview',root+'/reports/'+source.id+'/publish'])
 fireEvent.click(screen.getByRole('button',{name:'前往 Profile 准入审批'}))
 expect(screen.getByRole('region',{name:'本次认知配置选择'})).toHaveFocus()
 expect(screen.queryByRole('button',{name:'预览所选配置'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'预览 Profile 摘要'}))
 await screen.findByText(/当前已启用入口：暂无/)
 expect(mock.get).toHaveBeenLastCalledWith(profilePath)
 for(const entry of ['SURVEY','TRAINING','SCHOOL','TEACHER'])expect(screen.getByRole('checkbox',{name:entry})).not.toBeChecked()
 const approve=screen.getByRole('button',{name:'批准并启用此 Profile'})
 expect(approve).toBeDisabled()
 fireEvent.click(screen.getByRole('checkbox',{name:'SCHOOL'}))
 expect(approve).toBeDisabled()
 fireEvent.change(screen.getByRole('textbox',{name:'批准说明'}),{target:{value:'审核通过'}})
 fireEvent.click(approve)
 await screen.findByText(/已批准 .*：准入产品 SCHOOL/)
 expect(mock.post).toHaveBeenLastCalledWith(profilePath+'/approve',{
  requestId:expect.any(String),expectedArtifactHash:hash,allowedProducts:['SCHOOL'],reason:'审核通过',
 })
})
