import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {SjtEntryAuthorityError} from '../../modules/situational/entry-authority'
import {issueAdminContentRoot,revokeAdminContentGrant,readAdminContentGrant,adminContentRootRequestSchema} from '../../modules/measurement-content/admin-authority.service'
const mocks=vi.hoisted(()=>({transaction:vi.fn(),query:vi.fn(),execute:vi.fn(),audit:vi.fn(),auditRead:vi.fn(),registry:vi.fn(),sjtSource:vi.fn()}))
vi.mock('../../modules/situational/static-measurement-release',()=>({validateStaticSjtRegistryMappings:mocks.registry}))
vi.mock('../../modules/situational/entry-authority',()=>({readSjtEntryDistributionSource:mocks.sjtSource,SjtEntryAuthorityError:class extends Error{}}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const actor=id(1),target=id(2),project=id(3),resource=id(4),grantId=id(5)
const now=new Date('2026-10-20T05:00:00Z')
const proof=()=>({tokenVersion:3,adminSessionId:'existing-session',adminVerifiedAt:Math.floor(Date.now()/1000)})
const input=()=>({requestId:grantId,expectedVersion:0,reason:'Approved project work',grant:{subjectId:target,
 scope:{product:'SURVEY',scopeKind:'PROJECT',scopeId:project,resourceKind:'reference',resourceKeys:[resource]},
 capabilities:['reference.analyze','reference.review','reference.publish'],delegableCapabilities:['reference.analyze'],remainingDelegationDepth:1,
 validFrom:'2026-10-20T04:00:00Z',expiresAt:'2026-10-21T05:00:00Z'}})
const user=(id:string)=>({id,token_version:3,platform_role:id===actor?'SYSTEM_ADMIN':'STANDARD',account_domain:id===actor?'TRAINING':'SURVEY',role:'TEACHER',teacher_approved:true,is_active:true,is_frozen:false,must_change_password:false,expires_at:null as Date|null})
const row=()=>({id:grantId,subject_id:target,issuer_id:actor,parent_grant_id:null as string|null,product:'SURVEY',scope_kind:'PROJECT',scope_id:project,resource_kind:'reference',resource_keys:[resource],capabilities:input().grant.capabilities,delegable_capabilities:['reference.analyze'],remaining_delegation_depth:1,valid_from:new Date(input().grant.validFrom),expires_at:new Date(input().grant.expiresAt),ancestry:[grantId],version:1,revoked_at:null as Date|null,revoked_by:null as string|null,revoke_reason:null as string|null})
let users:ReturnType<typeof user>[],existing:ReturnType<typeof row>,inserted:boolean,qualified:boolean,resources:string[],owned:boolean
const sql=(query:any)=>query.strings.join(' ')
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(now);vi.clearAllMocks();users=[user(actor),user(target)];existing=row();inserted=true;qualified=true;resources=[resource];owned=true
 mocks.transaction.mockImplementation(async(fn:any)=>fn({$queryRaw:mocks.query,$executeRaw:mocks.execute,adminAuthorizationAudit:{create:mocks.audit,findUnique:mocks.auditRead}}))
 mocks.registry.mockResolvedValue([{id:resource,instrument_key:'sjt-installed',instrument_version:'1.0.0',content_digest:'a'.repeat(64)}])
 mocks.sjtSource.mockImplementation(async(_tx,measurementReleaseId)=>({measurementReleaseId}))
 mocks.auditRead.mockResolvedValue({actorUserId:actor,reason:input().reason,action:'CONTENT_ROOT_GRANTED'});mocks.execute.mockResolvedValue(1)
 mocks.query.mockImplementation(async query=>{
  const text=sql(query)
  if(text.includes('clock_timestamp() AS now'))return [{now:new Date()}]
  if(text.includes('FROM courses'))return owned?[{id:project}]:[]
  if(text.includes('FROM composite_assessments'))return resources.map(id=>({id,course_id:project,product_kind:'LEGACY_COMPOSITE',questionnaire_type:null}))
  if(text.includes('FROM questionnaire_course_deliveries'))return []
  if(text.includes('FROM survey_projects'))return owned?[{id:project}]:[]
  if(text.includes('FROM users'))return users
  if(text.includes('FROM admin_entry_grants'))return qualified?[{id:target}]:[]
  if(text.includes('FROM survey_researcher_grants'))return qualified?[{id:target}]:[]
  if(text.includes('FROM measurement_content_releases')||text.includes('FROM survey_wave_finals'))return resources.map(id=>({id}))
  if(text.includes('INSERT INTO content_capability_grants'))return inserted?[existing]:[]
  if(text.includes('FROM content_capability_grants'))return [existing]
  throw new Error('Unexpected SQL '+text)
 })
})
afterEach(()=>vi.useRealTimers())
describe('real system session bounded Survey content root issuance',()=>{
 it('creates exact reference root and audit using only shared User locks',async()=>{
  expect(await issueAdminContentRoot(actor,proof(),input())).toEqual({grantId,version:1,changed:true})
  const queries=mocks.query.mock.calls.map(([q])=>sql(q))
  expect(queries[0]).toContain('FROM survey_projects')
  expect(queries.find(q=>q.includes('FROM users'))).toContain('ORDER BY id FOR SHARE')
  expect(queries.filter(q=>q.includes('FROM measurement_content_releases'))).toHaveLength(1)
  expect(mocks.audit).toHaveBeenCalledWith({data:expect.objectContaining({id:grantId,actorUserId:actor,targetUserId:target,entry:'SURVEY',action:'CONTENT_ROOT_GRANTED',version:1})})
  expect(mocks.execute).not.toHaveBeenCalled()
 })
 it('accepts separate exact FINAL reinterpretation and does not grant report publishing',async()=>{
  const body=input();body.grant.scope.resourceKind='data';body.grant.capabilities=['data.reinterpret'];body.grant.delegableCapabilities=[];body.grant.remainingDelegationDepth=0
  await issueAdminContentRoot(actor,proof(),body)
  expect(mocks.query.mock.calls.some(([q])=>sql(q).includes('FROM survey_wave_finals'))).toBe(true)
  expect(()=>adminContentRootRequestSchema.parse({...body,grant:{...body.grant,capabilities:['report.publish']}})).toThrow()
 })
 it('rejects unsupported scopes, caller actor, grants or selector DSL at contract boundary',()=>{
  for(const grant of [{...input().grant,scope:{...input().grant.scope,product:'TRAINING'}},{...input().grant,scope:{...input().grant.scope,scopeKind:'PLATFORM'}},
   {...input().grant,scope:{...input().grant.scope,resourceKeys:['*']}},{...input().grant,capabilities:['measurement.publish']}])
   expect(()=>adminContentRootRequestSchema.parse({...input(),grant})).toThrow()
  expect(()=>adminContentRootRequestSchema.parse({...input(),actorId:actor})).toThrow()
  expect(()=>adminContentRootRequestSchema.parse({...input(),expectedVersion:1})).toThrow()
 })
 it('rejects missing/stale proof before DB and changed actual actor after locking',async()=>{
  await expect(issueAdminContentRoot(actor,{tokenVersion:3},input())).rejects.toMatchObject({statusCode:403});expect(mocks.transaction).not.toHaveBeenCalled()
  for(const patch of [{platform_role:'STANDARD'},{token_version:4},{is_active:false},{is_frozen:true},{must_change_password:true},{account_domain:'SURVEY'},{expires_at:now}]){
   users=[{...user(actor),...patch},user(target)];await expect(issueAdminContentRoot(actor,proof(),input())).rejects.toMatchObject({statusCode:403})
  }
  expect(mocks.audit).not.toHaveBeenCalled()
 })
 it('requires current target owner, Survey identity, researcher/MFA qualification and exact resources',async()=>{
  owned=false;await expect(issueAdminContentRoot(actor,proof(),input())).rejects.toMatchObject({statusCode:403});owned=true
  for(const patch of [{account_domain:'TRAINING'},{is_active:false},{is_frozen:true},{expires_at:now}]){
   users=[user(actor),{...user(target),...patch}];await expect(issueAdminContentRoot(actor,proof(),input())).rejects.toMatchObject({statusCode:403})
  }
  users=[user(actor),user(target)];qualified=false;await expect(issueAdminContentRoot(actor,proof(),input())).rejects.toMatchObject({statusCode:403});qualified=true
  resources=[];await expect(issueAdminContentRoot(actor,proof(),input())).rejects.toMatchObject({statusCode:403})
  expect(mocks.audit).not.toHaveBeenCalled()
 })
 it('rechecks proof and account expiry after an insertion wait',async()=>{
  const run=mocks.query.getMockImplementation()!
  const session=proof();users[0].expires_at=new Date(now.getTime()+1000)
  mocks.query.mockImplementation(async query=>{const result=await run(query);if(sql(query).includes('INSERT INTO'))vi.setSystemTime(new Date(now.getTime()+2000));return result})
  await expect(issueAdminContentRoot(actor,session,input())).rejects.toMatchObject({statusCode:403});expect(mocks.audit).not.toHaveBeenCalled()
 })
 it('retries the same root request without duplicate audit; changed bodies or revoked ids conflict',async()=>{
  inserted=false
  expect(await issueAdminContentRoot(actor,proof(),input())).toMatchObject({changed:false});expect(mocks.audit).not.toHaveBeenCalled()
  const changed=input();changed.grant.delegableCapabilities=[]
  await expect(issueAdminContentRoot(actor,proof(),changed)).rejects.toMatchObject({statusCode:409})
  existing.revoked_at=now;await expect(issueAdminContentRoot(actor,proof(),input())).rejects.toMatchObject({statusCode:409})
 })
 it('rejects a proof that expires while waiting for the revoke row lock',async()=>{
  const run=mocks.query.getMockImplementation()!,session=proof()
  mocks.query.mockImplementation(async query=>{const result=await run(query);if(sql(query).includes('FOR UPDATE'))vi.setSystemTime(new Date(now.getTime()+301000));return result})
  await expect(revokeAdminContentGrant(actor,session,grantId,{expectedVersion:1,reason:'Emergency stop'})).rejects.toMatchObject({statusCode:403})
  expect(mocks.execute).not.toHaveBeenCalled();expect(mocks.audit).not.toHaveBeenCalled()
 })
 it('system revoke uses current session, exact row CAS and one audit without rewriting descendants',async()=>{
  existing.parent_grant_id=id(6);existing.ancestry=[id(6),grantId]
  expect(await revokeAdminContentGrant(actor,proof(),grantId,{expectedVersion:1,reason:'Emergency stop'})).toMatchObject({version:2,changed:true})
  expect(mocks.execute).toHaveBeenCalledTimes(1);expect(sql(mocks.execute.mock.calls[0][0])).toContain('version=version+1')
  expect(mocks.audit).toHaveBeenCalledWith({data:expect.objectContaining({action:'CONTENT_GRANT_REVOKED',targetUserId:target})})
  await expect(revokeAdminContentGrant(actor,proof(),grantId,{expectedVersion:9,reason:'Stale'})).rejects.toMatchObject({statusCode:409})
  existing={...existing,version:2,revoked_at:now,revoked_by:actor,revoke_reason:'Emergency stop'}
  expect(await revokeAdminContentGrant(actor,proof(),grantId,{expectedVersion:1,reason:'Emergency stop'})).toMatchObject({changed:false})
 })
})

describe('bounded content governance metadata',()=>{
 it('returns only exact supported grant metadata without content reads',async()=>{
  const result=await readAdminContentGrant(actor,proof(),grantId)
  expect(result).toEqual({grantId,version:1,parentGrantId:null,issuerId:actor,...input().grant,validFrom:new Date(input().grant.validFrom).toISOString(),expiresAt:new Date(input().grant.expiresAt).toISOString(),revokedAt:null})
  expect(mocks.query.mock.calls.some(([q])=>/FROM (survey_wave_finals|measurement_content_releases)/.test(sql(q)))).toBe(false)
  expect(mocks.execute).not.toHaveBeenCalled();expect(mocks.audit).not.toHaveBeenCalled()
 })
 it('rejects stale system identity, unsupported scope and expiry after the grant wait',async()=>{
  users[0].platform_role='STANDARD';await expect(readAdminContentGrant(actor,proof(),grantId)).rejects.toMatchObject({statusCode:403})
  users[0]=user(actor);existing.product='TRAINING';await expect(readAdminContentGrant(actor,proof(),grantId)).rejects.toMatchObject({statusCode:403})
  existing=row();const session=proof(),run=mocks.query.getMockImplementation()!
  mocks.query.mockImplementation(async query=>{const result=await run(query);if(sql(query).includes('FROM content_capability_grants'))vi.setSystemTime(new Date(now.getTime()+301000));return result})
  await expect(readAdminContentGrant(actor,session,grantId)).rejects.toMatchObject({statusCode:403})
 })
})

const trainingInput=()=>{const body=input();body.grant.scope={...body.grant.scope,product:'TRAINING',scopeKind:'COURSE',resourceKind:'report'};body.grant.capabilities=['report.edit','report.publish'];body.grant.delegableCapabilities=['report.edit'];return body}
describe('exact Training course report root grants',()=>{
 it('accepts a current approved course-owner teacher and audits Training',async()=>{
  users[1].account_domain='TRAINING'
  await expect(issueAdminContentRoot(actor,proof(),trainingInput())).resolves.toMatchObject({changed:true})
  const queries=mocks.query.mock.calls.map(([q])=>sql(q))
  expect(queries[0]).toContain("course_type='TRAINING_COURSE' AND NOT is_library")
  expect(queries.some(q=>q.includes('survey_researcher_grants'))).toBe(false)
  expect(queries.find(q=>q.includes('FROM composite_assessments'))).toContain('created_by=')
  expect(mocks.audit).toHaveBeenCalledWith({data:expect.objectContaining({entry:'TRAINING',targetUserId:target})})
 })
 it('accepts exact questionnaire delivery membership, not unrelated composites',async()=>{
  users[1].account_domain='LEGACY';const run=mocks.query.getMockImplementation()!
  mocks.query.mockImplementation(async query=>sql(query).includes('FROM composite_assessments')?[{id:resource,course_id:null,product_kind:'QUESTIONNAIRE',questionnaire_type:'COURSE'}]:sql(query).includes('FROM questionnaire_course_deliveries')?[{composite_id:resource}]:run(query))
  await expect(issueAdminContentRoot(actor,proof(),trainingInput())).resolves.toMatchObject({changed:true})
  mocks.query.mockImplementation(async query=>sql(query).includes('FROM composite_assessments')?[{id:resource,course_id:id(90)}]:run(query))
  await expect(issueAdminContentRoot(actor,proof(),trainingInput())).rejects.toMatchObject({statusCode:403})
 })
 it('does not infer scientific rights from admin identity, unapproved teacher or wrong domain',async()=>{
  for(const patch of [{role:'ADMIN'},{teacher_approved:false},{account_domain:'SCHOOL'},{account_domain:'SURVEY'},{is_active:false},{is_frozen:true},{expires_at:now}]){
   users[1]={...user(target),account_domain:'TRAINING',...patch}
   await expect(issueAdminContentRoot(actor,proof(),trainingInput())).rejects.toMatchObject({statusCode:403})
  }
  users[1]={...user(target),account_domain:'TRAINING'};owned=false
  await expect(issueAdminContentRoot(actor,proof(),trainingInput())).rejects.toMatchObject({statusCode:403})
  expect(mocks.audit).not.toHaveBeenCalled()
 })
 it('rejects unrelated Training capability or non-course scopes',()=>{
  for(const scope of [{...trainingInput().grant.scope,scopeKind:'PLATFORM'},{...trainingInput().grant.scope,resourceKind:'reference'}])
   expect(()=>adminContentRootRequestSchema.parse({...trainingInput(),grant:{...trainingInput().grant,scope}})).toThrow()
  expect(()=>adminContentRootRequestSchema.parse({...trainingInput(),grant:{...trainingInput().grant,capabilities:['data.reinterpret']}})).toThrow()
 })
 it('reads/revokes Training grants with current system proof and Training audit',async()=>{
  existing={...row(),product:'TRAINING',scope_kind:'COURSE',resource_kind:'report',capabilities:['report.edit'],delegable_capabilities:[]}
  expect(await readAdminContentGrant(actor,proof(),grantId)).toMatchObject({scope:{product:'TRAINING',scopeKind:'COURSE'}})
  await revokeAdminContentGrant(actor,proof(),grantId,{expectedVersion:1,reason:'Withdraw report rights'})
  expect(mocks.audit).toHaveBeenCalledWith({data:expect.objectContaining({entry:'TRAINING',action:'CONTENT_GRANT_REVOKED'})})
 })
})

const platformInput=()=>{const body=input();body.grant.scope={product:'TRAINING',scopeKind:'PLATFORM',scopeId:'situational-registry',resourceKind:'measurement',resourceKeys:[resource]};body.grant.capabilities=['measurement.publish'];body.grant.delegableCapabilities=[];body.grant.remainingDelegationDepth=0;return body}
function platformTarget(){users[1]={...user(target),platform_role:'SYSTEM_ADMIN',account_domain:'TRAINING',role:'ADMIN',teacher_approved:false}}
function platformRow(){existing={...existing,product:'TRAINING',scope_kind:'PLATFORM',scope_id:'situational-registry',resource_kind:'measurement',capabilities:['measurement.publish'],delegable_capabilities:[],remaining_delegation_depth:0}}
describe('exact installed SJT platform measurement root grants',()=>{
 it('locks verified installed sources before Users and writes only the explicit publication capability',async()=>{
  platformTarget();await expect(issueAdminContentRoot(actor,proof(),platformInput())).resolves.toMatchObject({changed:true})
  expect(mocks.registry).toHaveBeenCalledExactlyOnceWith(expect.anything(),[resource])
  expect(mocks.registry.mock.invocationCallOrder[0]).toBeLessThan(mocks.query.mock.invocationCallOrder[0])
  const queries=mocks.query.mock.calls.map(([q])=>sql(q));expect(queries[0]).toContain('FROM users')
  expect(queries.some(q=>/FROM (courses|survey_projects|composite_assessments)/.test(q))).toBe(false)
  expect(mocks.audit).toHaveBeenCalledWith({data:expect.objectContaining({entry:'TRAINING',action:'CONTENT_ROOT_GRANTED',targetUserId:target})})
 })
 it('rejects wildcard/other platform scopes, other capabilities and non-UUID resource selectors',()=>{
  const body=platformInput()
  for(const grant of [{...body.grant,scope:{...body.grant.scope,scopeId:'other-registry'}},{...body.grant,scope:{...body.grant.scope,resourceKind:'report'}},
   {...body.grant,capabilities:['measurement.publish','report.publish']},{...body.grant,scope:{...body.grant.scope,resourceKeys:['sjt-installed@1.0.0']}},
   {...body.grant,scope:{...body.grant.scope,product:'SURVEY'}}])expect(()=>adminContentRootRequestSchema.parse({...body,grant})).toThrow()
 })
 it.each([{platform_role:'STANDARD'},{account_domain:'SURVEY'},{is_active:false},{is_frozen:true},{must_change_password:true},{expires_at:now}])('requires current target SYSTEM_ADMIN independent of business role %j',async patch=>{
  platformTarget();Object.assign(users[1],patch)
  await expect(issueAdminContentRoot(actor,proof(),platformInput())).rejects.toMatchObject({statusCode:403})
  expect(mocks.audit).not.toHaveBeenCalled()
 })
 it('requires exact installed source validation, not UUID existence alone',async()=>{
  platformTarget();mocks.registry.mockRejectedValueOnce(new Error('CONTENT_STATIC_SJT_SOURCE_MISMATCH'))
  await expect(issueAdminContentRoot(actor,proof(),platformInput())).rejects.toThrow('SOURCE_MISMATCH')
  expect(mocks.query).not.toHaveBeenCalled();expect(mocks.audit).not.toHaveBeenCalled()
  mocks.registry.mockResolvedValueOnce([])
  await expect(issueAdminContentRoot(actor,proof(),platformInput())).rejects.toMatchObject({statusCode:403})
 })
 it('retains root request idempotency, immutable body matching, metadata read and CAS revoke',async()=>{
  platformTarget();platformRow();inserted=false
  await expect(issueAdminContentRoot(actor,proof(),platformInput())).resolves.toMatchObject({changed:false})
  const changed=platformInput();changed.reason='different reason'
  await expect(issueAdminContentRoot(actor,proof(),changed)).rejects.toMatchObject({statusCode:409})
  expect(await readAdminContentGrant(actor,proof(),grantId)).toMatchObject({scope:platformInput().grant.scope,capabilities:['measurement.publish']})
  await expect(revokeAdminContentGrant(actor,proof(),grantId,{expectedVersion:1,reason:'Stop static publishing'})).resolves.toMatchObject({version:2,changed:true})
 })
 it('rechecks target expiration after mapping waits before grant insertion',async()=>{
  platformTarget();users[1].expires_at=new Date(now.getTime()+1000)
  mocks.registry.mockImplementationOnce(async()=>{vi.setSystemTime(new Date(now.getTime()+2000));return [{id:resource}]})
  await expect(issueAdminContentRoot(actor,proof(),platformInput())).rejects.toMatchObject({statusCode:403})
  expect(mocks.query.mock.calls.some(([q])=>sql(q).includes('INSERT INTO'))).toBe(false)
 })
})

describe('exact Training scientific roots and formal governance',()=>{
 const training=(kind='reference')=>{const value=input();value.grant.scope={product:'TRAINING',scopeKind:'COURSE',scopeId:project,resourceKind:kind,resourceKeys:[resource]}
  if(kind==='data'){value.grant.capabilities=['data.reinterpret'];value.grant.delegableCapabilities=[];value.grant.remainingDelegationDepth=0}return value}
 const formal=()=>{const value=training();value.grant.scope.scopeKind='PLATFORM';value.grant.scope.scopeId='reference-governance';
  value.grant.capabilities=['reference.review','reference.publish'];value.grant.delegableCapabilities=[];value.grant.remainingDelegationDepth=0;return value}
 it('issues COURSE reference over real owned composite only; no implicit cross-entry science',async()=>{
  users[1].account_domain='TRAINING';await issueAdminContentRoot(actor,proof(),training())
  const queries=mocks.query.mock.calls.map(([q])=>sql(q))
  expect(queries[0]).toContain('FROM courses');expect(queries.some(q=>q.includes('FROM composite_assessments'))).toBe(true)
  expect(queries.some(q=>q.includes('FROM measurement_content_releases'))).toBe(false)
  owned=false;await expect(issueAdminContentRoot(actor,proof(),training())).rejects.toMatchObject({statusCode:403})
 })
 it('issues formal aggregate review/publish only through exact explicit scope and current qualified business teacher',async()=>{
  users[1].account_domain='TRAINING';owned=false;await issueAdminContentRoot(actor,proof(),formal())
  const queries=mocks.query.mock.calls.map(([q])=>sql(q))
  expect(queries.some(q=>q.includes('FROM courses')||q.includes('FROM composite_assessments'))).toBe(false)
  expect(queries.find(q=>q.includes('FROM measurement_content_releases'))).toContain("status<>'REVOKED'")
  const body=formal();body.grant.capabilities=['reference.analyze'];expect(()=>adminContentRootRequestSchema.parse(body)).toThrow()
  users[1].role='ADMIN';users[1].platform_role='SYSTEM_ADMIN'
  await expect(issueAdminContentRoot(actor,proof(),formal())).rejects.toMatchObject({statusCode:403})
 })
 it('requires exact completed Training FINAL under course and parent author for data.reinterpret',async()=>{
  users[1].account_domain='TRAINING';const base=mocks.query.getMockImplementation()!
  mocks.query.mockImplementation(async q=>sql(q).includes('FROM composite_assessment_attempts')?[{id:resource,composite_assessment_id:resource}]:base(q))
  await issueAdminContentRoot(actor,proof(),training('data'))
  const queries=mocks.query.mock.calls.map(([q])=>sql(q)),locked=queries.find(q=>q.includes('FROM composite_assessment_attempts')&&q.includes('FOR SHARE'))!
  for(const required of ["status='COMPLETED'","delivery_mode='FINAL_ONLY'","runtime_generation='UNIFIED_V1'",'delivery_course_id=',
   'training_content_binding IS NOT NULL','training_content_interpretation_encrypted IS NOT NULL','aggregate_input_hash IS NOT NULL'])expect(locked).toContain(required)
  expect(queries.findIndex(q=>q.includes('FROM composite_assessments'))).toBeLessThan(queries.findIndex(q=>q===locked))
 })
 it('refuses data attempts moved after pre-read, missing approved parents or ineligible principals',async()=>{
  users[1].account_domain='TRAINING';const base=mocks.query.getMockImplementation()!
  mocks.query.mockImplementation(async q=>sql(q).includes('FROM composite_assessment_attempts')?[{id:resource,composite_assessment_id:sql(q).includes('FOR SHARE')?id(90):resource}]:base(q))
  await expect(issueAdminContentRoot(actor,proof(),training('data'))).rejects.toMatchObject({statusCode:403})
  expect(mocks.audit).not.toHaveBeenCalled()
 })
 it('rejects broad or mismatched capabilities, resource IDs, and cross-product data scope at parse time',()=>{
  for(const grant of [{...formal().grant,scope:{...formal().grant.scope,scopeId:'*'}},
   {...formal().grant,scope:{...formal().grant.scope,resourceKeys:['*']}},
   {...training('data').grant,capabilities:['data.reinterpret','reference.review']},
   {...training('data').grant,scope:{...training('data').grant.scope,product:'SURVEY'}}])
   expect(()=>adminContentRootRequestSchema.parse({...input(),grant})).toThrow()
 })
})

it('rejects unknown grant keys before date conversion and authority validation',()=>{
 const body=input();expect(adminContentRootRequestSchema.safeParse(body).success).toBe(true)
 expect(adminContentRootRequestSchema.safeParse({...body,grant:{...body.grant,unexpectedPrivilege:true}}).success).toBe(false)
})


const sjtDistributionInput=()=>{const body=input();body.grant.scope={product:'SURVEY',scopeKind:'PLATFORM',scopeId:'situational-library-governance',resourceKind:'material',resourceKeys:[resource]};body.grant.capabilities=['material.distribute'];body.grant.delegableCapabilities=[];body.grant.remainingDelegationDepth=0;return body}
function sjtDistributionTarget(){users[1]={...user(target),account_domain:'TRAINING',role:'ADMIN',teacher_approved:false}}
function sjtDistributionRow(){existing={...row(),product:'SURVEY',scope_kind:'PLATFORM',scope_id:'situational-library-governance',resource_kind:'material',capabilities:['material.distribute'],delegable_capabilities:[],remaining_delegation_depth:0}}
describe('exact nondelegable Survey SJT entry distribution roots',()=>{
 it('uses exact published measurement sources and the current Survey entry administrator, never course authority',async()=>{
  sjtDistributionTarget();owned=false;const body=sjtDistributionInput();body.grant.scope.resourceKeys=[id(7),resource]
  await expect(issueAdminContentRoot(actor,proof(),body)).resolves.toEqual({grantId,version:1,changed:true})
  expect(mocks.sjtSource.mock.calls.map(([,releaseId])=>releaseId)).toEqual([resource,id(7)])
  const queries=mocks.query.mock.calls.map(([q])=>sql(q)),entryQuery=mocks.query.mock.calls.find(([q])=>sql(q).includes('FROM admin_entry_grants'))![0]
  expect(sql(entryQuery)).toContain('revoked_at IS NULL FOR SHARE');expect(entryQuery.values).toEqual([target,'SURVEY'])
  expect(queries.some(q=>/FROM (courses|survey_projects|composite_assessments|situational_grants|survey_researcher_grants)/.test(q))).toBe(false)
  expect(mocks.registry).not.toHaveBeenCalled()
  const entryIndex=mocks.query.mock.calls.findIndex(([q])=>sql(q).includes('FROM admin_entry_grants'))
  expect(mocks.query.mock.invocationCallOrder[entryIndex]).toBeLessThan(mocks.sjtSource.mock.invocationCallOrder[0])
  const insert=mocks.query.mock.calls.find(([q])=>sql(q).includes('INSERT INTO content_capability_grants'))![0]
  expect(insert.values).toEqual([grantId,target,actor,'SURVEY','PLATFORM','situational-library-governance','material',[id(7),resource],['material.distribute'],[],0,new Date(body.grant.validFrom),new Date(body.grant.expiresAt),[grantId]])
  expect(mocks.audit).toHaveBeenCalledWith({data:expect.objectContaining({entry:'SURVEY',action:'CONTENT_ROOT_GRANTED',targetUserId:target})})
 })
 it('rejects mismatched product/scope/resources, broader capabilities and all delegation at parse time',()=>{
  const body=sjtDistributionInput()
  for(const grant of [
   {...body.grant,scope:{...body.grant.scope,product:'TRAINING'}},
   {...body.grant,scope:{...body.grant.scope,scopeKind:'COURSE',scopeId:project}},
   {...body.grant,scope:{...body.grant.scope,scopeKind:'PROJECT',scopeId:project}},
   {...body.grant,scope:{...body.grant.scope,scopeId:'situational-registry'}},
   {...body.grant,scope:{...body.grant.scope,resourceKind:'measurement'}},
   {...body.grant,scope:{...body.grant.scope,resourceKeys:['*']}},
   {...body.grant,scope:{...body.grant.scope,resourceKeys:[resource,resource]}},
   {...body.grant,capabilities:['material.distribute','material.adapt']},
   {...body.grant,capabilities:['material.use']},
   {...body.grant,remainingDelegationDepth:1},
   {...body.grant,remainingDelegationDepth:1,delegableCapabilities:['material.distribute']},
  ])expect(adminContentRootRequestSchema.safeParse({...body,grant}).success).toBe(false)
 })
 it('does not infer a current Survey entry grant from system, teacher or researcher identity',async()=>{
  sjtDistributionTarget();users[1].platform_role='SYSTEM_ADMIN';qualified=false
  await expect(issueAdminContentRoot(actor,proof(),sjtDistributionInput())).rejects.toMatchObject({statusCode:403})
  expect(mocks.sjtSource).not.toHaveBeenCalled();expect(mocks.audit).not.toHaveBeenCalled()
 })
 it.each([{account_domain:'SURVEY'},{account_domain:'SCHOOL'},{is_active:false},{is_frozen:true},{must_change_password:true},{expires_at:now}])('requires current eligible target %j',async patch=>{
  sjtDistributionTarget();Object.assign(users[1],patch)
  await expect(issueAdminContentRoot(actor,proof(),sjtDistributionInput())).rejects.toMatchObject({statusCode:403})
  expect(mocks.query.mock.calls.some(([q])=>sql(q).includes('INSERT INTO'))).toBe(false);expect(mocks.audit).not.toHaveBeenCalled()
 })
 it('requires a strong current system issuer rather than the target entry authority',async()=>{
  sjtDistributionTarget()
  await expect(issueAdminContentRoot(actor,{tokenVersion:3},sjtDistributionInput())).rejects.toMatchObject({statusCode:403})
  expect(mocks.transaction).not.toHaveBeenCalled()
  users[0].platform_role='STANDARD'
  await expect(issueAdminContentRoot(actor,proof(),sjtDistributionInput())).rejects.toMatchObject({statusCode:403})
  expect(mocks.sjtSource).not.toHaveBeenCalled();expect(mocks.audit).not.toHaveBeenCalled()
 })
 it('maps only known source denials to 403 and never inserts mismatched source IDs',async()=>{
  sjtDistributionTarget();mocks.sjtSource.mockRejectedValueOnce(new SjtEntryAuthorityError('SJT_ENTRY_SOURCE_DENIED'))
  await expect(issueAdminContentRoot(actor,proof(),sjtDistributionInput())).rejects.toMatchObject({statusCode:403})
  const unexpected=new Error('storage unavailable');mocks.sjtSource.mockRejectedValueOnce(unexpected)
  await expect(issueAdminContentRoot(actor,proof(),sjtDistributionInput())).rejects.toBe(unexpected)
  mocks.sjtSource.mockResolvedValueOnce({measurementReleaseId:id(90)})
  await expect(issueAdminContentRoot(actor,proof(),sjtDistributionInput())).rejects.toMatchObject({statusCode:403})
  expect(mocks.query.mock.calls.some(([q])=>sql(q).includes('INSERT INTO'))).toBe(false);expect(mocks.audit).not.toHaveBeenCalled()
 })
 it.each(['proof','target','grant'])('rechecks %s expiration after source waits and before insertion',async expiration=>{
  sjtDistributionTarget();const session=proof(),body=sjtDistributionInput()
  if(expiration==='target')users[1].expires_at=new Date(now.getTime()+1000)
  if(expiration==='grant')body.grant.expiresAt=new Date(now.getTime()+1000).toISOString()
  mocks.sjtSource.mockImplementationOnce(async(_tx,measurementReleaseId)=>{vi.setSystemTime(new Date(now.getTime()+(expiration==='proof'?301000:2000)));return {measurementReleaseId}})
  await expect(issueAdminContentRoot(actor,session,body)).rejects.toMatchObject({statusCode:403})
  expect(mocks.query.mock.calls.some(([q])=>sql(q).includes('INSERT INTO'))).toBe(false);expect(mocks.audit).not.toHaveBeenCalled()
 })
 it('keeps same-body retry, metadata and emergency CAS revocation without upgrading existing grants',async()=>{
  sjtDistributionTarget();sjtDistributionRow();inserted=false
  await expect(issueAdminContentRoot(actor,proof(),sjtDistributionInput())).resolves.toMatchObject({changed:false})
  const changed=sjtDistributionInput();changed.grant.scope.resourceKeys=[id(7)]
  await expect(issueAdminContentRoot(actor,proof(),changed)).rejects.toMatchObject({statusCode:409})
  mocks.sjtSource.mockClear()
  expect(await readAdminContentGrant(actor,proof(),grantId)).toMatchObject({scope:sjtDistributionInput().grant.scope,capabilities:['material.distribute'],remainingDelegationDepth:0})
  users[1].is_active=false
  await expect(revokeAdminContentGrant(actor,proof(),grantId,{expectedVersion:1,reason:'Withdraw entry distribution'})).resolves.toMatchObject({version:2,changed:true})
  expect(mocks.sjtSource).not.toHaveBeenCalled()
  expect(mocks.execute).toHaveBeenCalledTimes(1);expect(sql(mocks.execute.mock.calls[0][0])).toContain('UPDATE content_capability_grants')
 })
})
