import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({query:vi.fn(),transaction:vi.fn(),issue:vi.fn(),issueExact:vi.fn(),revoke:vi.fn(),actor:vi.fn(),recheck:vi.fn(),entry:vi.fn(),source:vi.fn(),policy:vi.fn(),stop:vi.fn(),held:false,replay:false}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:mocks.query,$transaction:mocks.transaction}}))
vi.mock('../../modules/measurement-content/admin-authority.service',()=>({issueAdminContentRoot:mocks.issue,issueAdminStandardCombinationRoot:mocks.issueExact,revokeAdminContentGrant:mocks.revoke,
 lockCurrentContentSystemActor:mocks.actor,recheckContentSystemActorAfterWait:mocks.recheck}))
vi.mock('../../modules/admin-permissions/service',async original=>({...await original<typeof import('../../modules/admin-permissions/service')>(),assertEntryAdmin:mocks.entry}))
vi.mock('../../modules/measurement-content/standard-combination-source',()=>({readCurrentStandardCombination:mocks.source}))
vi.mock('../../modules/assessment-governance/tool-entry-policy',()=>({assertToolEntryPolicy:mocks.policy}))
vi.mock('../../modules/assessment-governance/operational-hold',()=>({get ASSESSMENT_OPERATIONAL_HOLDS(){return new Map(mocks.held?[['synthetic',{family:'SCALE',key:'synthetic',version:'1'}]]:[])}}))
vi.mock('../../modules/scale-library-governance/collection-guard',()=>({assertScaleLibraryCollectionAllowed:mocks.stop}))
import {AdminPermissionError} from '../../modules/admin-permissions/service'
import {readStandardDelegations,issueStandardDelegation,revokeStandardDelegation} from '../../modules/measurement-content/standard-delegations.service'
const actor='10000000-0000-4000-8000-000000000001',release='10000000-0000-4000-8000-000000000002',measurement='10000000-0000-4000-8000-000000000003',
 school='10000000-0000-4000-8000-000000000004',admin='10000000-0000-4000-8000-000000000005',request='10000000-0000-4000-8000-000000000006'
const proof=()=>({tokenVersion:1,adminSessionId:'verified-session',adminVerifiedAt:Date.now()/1000})
const tx={$queryRaw:mocks.query}
let rows:Array<Record<string,unknown>>,grant:Record<string,unknown>
const body=(coverageDigest:string)=>({product:'SCHOOL',schoolId:school,adminId:admin,startsAt:'2026-11-27T00:00:00Z',expiresAt:'2027-11-27T00:00:00Z',
 reason:'合成单量表委托',requestId:request,coverageDigest})
const preview=()=>readStandardDelegations(actor,proof(),release,{product:'SCHOOL'})
beforeEach(()=>{
 vi.clearAllMocks();mocks.held=false;mocks.replay=false
 rows=[{id:release,title:'合成标准量表',toolKey:'synthetic',instrumentVersion:'1',contentVersion:'C1',parametersVersion:'P1',reportVersion:'R1',combinationHash:'a'.repeat(64),nativeId:'native-id'}]
 grant={id:request,product:'SCHOOL',scope_kind:'ORGANIZATION',scope_id:school,resource_kind:'material',resource_keys:[measurement],capabilities:['material.distribute'],
  parent_grant_id:null,delegable_capabilities:[],remaining_delegation_depth:0}
 mocks.actor.mockResolvedValue({users:[{id:actor}]});mocks.recheck.mockResolvedValue(undefined);mocks.entry.mockResolvedValue({grantId:'entry',grantVersion:1})
 mocks.source.mockResolvedValue({measurement:{releaseId:measurement}});mocks.policy.mockResolvedValue({});mocks.stop.mockResolvedValue(undefined)
 mocks.transaction.mockImplementation(work=>work(tx))
 mocks.query.mockImplementation(query=>{
  if(query.text.includes('SELECT id,measurement_release'))return [{id:release,measurementReleaseId:measurement,combinationHash:'a'.repeat(64)}]
  if(query.text.includes('SELECT s.id,COALESCE')){
   if(query.text.includes('held.key=s.tool_key')){
    const [keys,versions]=query.values.filter(Array.isArray)
    return rows.filter(row=>!keys.some((key:string,i:number)=>row.toolKey===key&&row.instrumentVersion===versions[i]))
   }
   return rows
  }
  if(query.text.includes('FROM organizations o'))return [{id:school,label:'合成学校',detail:'School 已开通'}]
  if(query.text.includes('FROM users u JOIN admin_entry_grants'))return [{id:admin,label:'synthetic_admin',detail:'合成管理员'}]
  if(query.text.includes('FROM content_capability_grants g'))return [{id:request,version:1,product:'SCHOOL',schoolName:'合成学校',adminName:'synthetic_admin',status:'ACTIVE',reason:'原原因'}]
  throw Error('unexpected SQL')
 })
 mocks.issue.mockImplementation(async(_actor,_proof,input,confirm)=>{
  if(!mocks.replay)await confirm(tx)
  return {grantId:input.requestId,version:1,changed:!mocks.replay}
 })
 mocks.issueExact.mockImplementation(async(_actor,_proof,input,confirm)=>{
  if(!mocks.replay)await confirm(tx)
  return {grantId:input.requestId,version:1,changed:!mocks.replay}
 })
 mocks.revoke.mockImplementation(async(_actor,_proof,grantId,_input,confirm)=>{await confirm(tx,grant);return {grantId,version:2,changed:true}})
})

describe('standard scale detail delegation management',()=>{
 it('returns complete same-C coverage and only safe named metadata',async()=>{
  rows.push({...rows[0],id:'10000000-0000-4000-8000-000000000007',reportVersion:'R2',combinationHash:'b'.repeat(64)})
  const result=await preview()
  expect(result.cover.assignable).toBe(true);expect(result.cover.combinations.map(row=>row.reportVersion)).toEqual(['R1','R2'])
  expect(result.cover).not.toHaveProperty('identities');expect(result.cover.combinations[0]).not.toHaveProperty('combinationHash')
  expect(result.schools[0].label).toBe('合成学校');expect(result.administrators[0].label).toBe('synthetic_admin')
  expect(result.records[0]).toMatchObject({schoolName:'合成学校',adminName:'synthetic_admin'})
  const query=mocks.query.mock.calls.find(([q])=>q.text.includes('SELECT s.id,COALESCE'))![0]
  expect(query.text).toContain("p.decision='APPROVED' AND NOT p.paused")
  expect(query.text).toContain("native.status='PUBLISHED'");expect(query.text).toContain('scale_library_emergency_stops')
 })
 it('paginates school/admin/records independently without filtering historical records by current choices',async()=>{
  await readStandardDelegations(actor,proof(),release,{product:'TEACHER',schoolQuery:'school needle',adminQuery:'admin needle',schoolPage:2,adminPage:3,page:4})
  const queries=mocks.query.mock.calls.map(([q])=>q)
  const schools=queries.find(q=>q.text.includes('FROM organizations o'))!,admins=queries.find(q=>q.text.includes('FROM users u JOIN admin_entry_grants'))!,history=queries.find(q=>q.text.includes('FROM content_capability_grants g'))!
  expect(schools.values).toContain('HUITEACHER');expect(schools.values.slice(-2)).toEqual([26,25]);expect(admins.values.slice(-2)).toEqual([26,50])
  expect(admins.text).toContain("u.platform_role='STANDARD'");expect(admins.values).toContain('HUITEACHER')
  expect(history.values.slice(-2)).toEqual([26,75]);expect(history.values).not.toContain('school needle');expect(history.values).not.toContain('admin needle')
  expect(history.text).toContain('g.resource_keys=ARRAY[');expect(history.text).not.toContain('o.status=');expect(history.text).not.toContain('u.is_active')
 })
 it('signs through the existing root transaction with a server-fixed nondelegable single-C scope',async()=>{
  const {cover}=await preview()
  expect(await issueStandardDelegation(actor,proof(),release,body(cover.coverageDigest))).toEqual({grantId:request,version:1,changed:true})
  expect(mocks.issue.mock.calls[0][2]).toMatchObject({requestId:request,expectedVersion:0,grant:{subjectId:admin,scope:{product:'SCHOOL',scopeKind:'ORGANIZATION',scopeId:school,resourceKeys:[measurement]},capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0}})
  expect(mocks.entry).toHaveBeenCalledExactlyOnceWith(tx,admin,'HUISCHOOL')
  expect(mocks.source).toHaveBeenCalledWith(tx,{releaseId:release,combinationHash:'a'.repeat(64)})
  expect(mocks.policy).toHaveBeenCalledWith(tx,{resourceKey:'standard-release:'+release,fingerprint:'a'.repeat(64)},'SCHOOL')
  expect(mocks.stop).toHaveBeenCalledWith(tx,[measurement],['native-id'])
 })
 it('dedicates a distinct digest and only one immutable key to a selected combination',async()=>{
  const {cover}=await preview()
  expect(cover.combinationCoverageDigest).not.toBe(cover.coverageDigest)
  const input={...body(cover.combinationCoverageDigest!),scope:'COMBINATION'}
  await expect(issueStandardDelegation(actor,proof(),release,input)).resolves.toMatchObject({changed:true})
  expect(mocks.issue).not.toHaveBeenCalled()
  expect(mocks.issueExact.mock.calls[0][2].grant.scope.resourceKeys).toEqual([`education-source:STANDARD_SCALE:${release}:${'a'.repeat(64)}`])
  await expect(issueStandardDelegation(actor,proof(),release,{...input,scope:'MEASUREMENT'})).rejects.toMatchObject({statusCode:409})
 })
 it('never enters exact issuance without a transaction validation callback',async()=>{
  const authority=await vi.importActual<typeof import('../../modules/measurement-content/admin-authority.service')>('../../modules/measurement-content/admin-authority.service')
  await expect(Reflect.apply(authority.issueAdminStandardCombinationRoot,null,[actor,proof(),{}])).rejects.toMatchObject({statusCode:403})
  expect(mocks.transaction).not.toHaveBeenCalled()
 })
 it('allows removing the exact historical root from its anchor without confusing a sibling digest',async()=>{
  grant.resource_keys=[`education-source:STANDARD_SCALE:${release}:${'a'.repeat(64)}`]
  rows=[]
  await expect(revokeStandardDelegation(actor,proof(),release,request,{expectedVersion:1,reason:'合成撤销'})).resolves.toMatchObject({changed:true})
  grant.resource_keys=[`education-source:STANDARD_SCALE:${release}:${'b'.repeat(64)}`]
  await expect(revokeStandardDelegation(actor,proof(),release,request,{expectedVersion:1,reason:'合成撤销'})).rejects.toMatchObject({statusCode:403})
 })
 it.each(['SCHOOL business user','SYSTEM_ADMIN','wrong product entry'])('does not inherit legacy root recipient allowances: %s',async()=>{
  const {cover}=await preview();mocks.entry.mockRejectedValue(new AdminPermissionError(403,'not a formal entry manager'))
  await expect(issueStandardDelegation(actor,proof(),release,body(cover.coverageDigest))).rejects.toMatchObject({statusCode:403})
  expect(mocks.source).not.toHaveBeenCalled()
 })
 it('requires refresh if another P/R combination joined the same measurement before signing',async()=>{
  const {cover}=await preview();rows.push({...rows[0],id:'10000000-0000-4000-8000-000000000007',reportVersion:'R2',combinationHash:'b'.repeat(64)})
  await expect(issueStandardDelegation(actor,proof(),release,body(cover.coverageDigest))).rejects.toMatchObject({statusCode:409})
  expect(mocks.source).not.toHaveBeenCalled()
 })
 it('does not let a sibling combination authorize a paused/withdrawn anchor',async()=>{
  const {cover}=await preview();rows=[{...rows[0],id:'10000000-0000-4000-8000-000000000007'}]
  await expect(issueStandardDelegation(actor,proof(),release,body(cover.coverageDigest))).rejects.toMatchObject({statusCode:409})
 })
 it('uses a different coverage confirmation for the other product',async()=>{
  const schoolCover=(await preview()).cover
  const teacherCover=(await readStandardDelegations(actor,proof(),release,{product:'TEACHER'})).cover
  expect(teacherCover.coverageDigest).not.toBe(schoolCover.coverageDigest)
 })
 it('keeps the old receipt path when a successful request is retried after coverage changed',async()=>{
  const {cover}=await preview();rows=[];mocks.replay=true
  expect(await issueStandardDelegation(actor,proof(),release,body(cover.coverageDigest))).toMatchObject({grantId:request,changed:false})
  expect(mocks.entry).not.toHaveBeenCalled();expect(mocks.source).not.toHaveBeenCalled()
 })
 it('withdraws historical roots through the existing transaction without requiring current cover or target qualification',async()=>{
  rows=[]
  expect(await revokeStandardDelegation(actor,proof(),release,request,{expectedVersion:1,reason:'合成撤销'})).toEqual({grantId:request,version:2,changed:true})
  expect(mocks.revoke.mock.calls[0][3]).toEqual({expectedVersion:1,reason:'合成撤销'})
  expect(mocks.entry).not.toHaveBeenCalled();expect(mocks.source).not.toHaveBeenCalled()
 })
 it.each(['different C','multiple resources','delegable','non-education product'])('does not withdraw a hidden broader or different scope: %s',async kind=>{
  if(kind==='different C')grant.resource_keys=['different-measurement']
  if(kind==='multiple resources')grant.resource_keys=[measurement,'another-measurement']
  if(kind==='delegable')grant.delegable_capabilities=['material.distribute']
  if(kind==='non-education product')grant.product='TRAINING'
  await expect(revokeStandardDelegation(actor,proof(),release,request,{expectedVersion:1,reason:'合成撤销'})).rejects.toMatchObject({statusCode:403})
 })
 it('honors operational holds and never silently truncates the cover',async()=>{
  mocks.held=true;expect((await preview()).cover.assignable).toBe(false)
  mocks.held=false;rows=Array.from({length:129},()=>rows[0])
  await expect(preview()).rejects.toMatchObject({statusCode:409})
 })
 it('rejects stale MFA and malformed caller selectors before database access',async()=>{
  await expect(readStandardDelegations(actor,{tokenVersion:1},release,{product:'SCHOOL'})).rejects.toMatchObject({statusCode:403})
  await expect(issueStandardDelegation(actor,proof(),release,{...body('a'.repeat(64)),scope:{product:'TRAINING'}})).rejects.toBeTruthy()
  expect(mocks.query).not.toHaveBeenCalled();expect(mocks.issue).not.toHaveBeenCalled()
 })
})
