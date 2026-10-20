import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {issueAdminContentRoot,revokeAdminContentGrant,readAdminContentGrant,adminContentRootRequestSchema} from '../../modules/measurement-content/admin-authority.service'
const mocks=vi.hoisted(()=>({transaction:vi.fn(),query:vi.fn(),execute:vi.fn(),audit:vi.fn(),auditRead:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const actor=id(1),target=id(2),project=id(3),resource=id(4),grantId=id(5)
const now=new Date('2026-10-20T05:00:00Z')
const proof=()=>({tokenVersion:3,adminSessionId:'existing-session',adminVerifiedAt:Math.floor(Date.now()/1000)})
const input=()=>({requestId:grantId,expectedVersion:0,reason:'Approved project work',grant:{subjectId:target,
 scope:{product:'SURVEY',scopeKind:'PROJECT',scopeId:project,resourceKind:'reference',resourceKeys:[resource]},
 capabilities:['reference.analyze','reference.review','reference.publish'],delegableCapabilities:['reference.analyze'],remainingDelegationDepth:1,
 validFrom:'2026-10-20T04:00:00Z',expiresAt:'2026-10-21T05:00:00Z'}})
const user=(id:string)=>({id,token_version:3,platform_role:id===actor?'SYSTEM_ADMIN':'STANDARD',account_domain:id===actor?'TRAINING':'SURVEY',is_active:true,is_frozen:false,must_change_password:false,expires_at:null as Date|null})
const row=()=>({id:grantId,subject_id:target,issuer_id:actor,parent_grant_id:null as string|null,product:'SURVEY',scope_kind:'PROJECT',scope_id:project,resource_kind:'reference',resource_keys:[resource],capabilities:input().grant.capabilities,delegable_capabilities:['reference.analyze'],remaining_delegation_depth:1,valid_from:new Date(input().grant.validFrom),expires_at:new Date(input().grant.expiresAt),ancestry:[grantId],version:1,revoked_at:null as Date|null,revoked_by:null as string|null,revoke_reason:null as string|null})
let users:ReturnType<typeof user>[],existing:ReturnType<typeof row>,inserted:boolean,qualified:boolean,resources:string[],owned:boolean
const sql=(query:any)=>query.strings.join(' ')
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(now);vi.clearAllMocks();users=[user(actor),user(target)];existing=row();inserted=true;qualified=true;resources=[resource];owned=true
 mocks.transaction.mockImplementation(async(fn:any)=>fn({$queryRaw:mocks.query,$executeRaw:mocks.execute,adminAuthorizationAudit:{create:mocks.audit,findUnique:mocks.auditRead}}))
 mocks.auditRead.mockResolvedValue({actorUserId:actor,reason:input().reason,action:'CONTENT_ROOT_GRANTED'});mocks.execute.mockResolvedValue(1)
 mocks.query.mockImplementation(async query=>{
  const text=sql(query)
  if(text.includes('clock_timestamp() AS now'))return [{now:new Date()}]
  if(text.includes('FROM survey_projects'))return owned?[{id:project}]:[]
  if(text.includes('FROM users'))return users
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
