import {afterEach,describe,expect,it,vi} from 'vitest'
vi.mock('../../config/database',()=>({prisma:{}}))
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {ASSESSMENT_OPERATIONAL_HOLDS,operationalIdentityKey} from '../../modules/assessment-governance/operational-hold'
import {freezeTrainingStandardReference,verifyStoredTrainingStandardItem,decodeTrainingStandardItemSource,trainingStandardCombinationSummary} from '../../modules/composite/training-standard-combination'
import {hashScaleDeploymentPolicy} from '../../modules/scale/policy/deployment'
import {ids,tid,trainingSourceHarness} from './training-standard-source.fixture'
const run=(f:ReturnType<typeof trainingSourceHarness>)=>freezeTrainingStandardReference(f.db,ids.owner,ids.composite,f.input)
const frozen=(f:ReturnType<typeof trainingSourceHarness>,source:unknown)=>{f.h.composite.items[0].standardCombinationSource=source;return f.h.composite.items[0]}
afterEach(()=>ASSESSMENT_OPERATIONAL_HOLDS.clear())

describe('Training consumes one exact shared combination through one user MaterialGrant',()=>{
 it('pins C/P/R and the original 21B root without requiring a legacy Scale grant',async()=>{
  const f=trainingSourceHarness();f.h.materialActive=false
  const source=await run(f)
  expect(source.reference.combination).toMatchObject({releaseId:ids.combo,combinationHash:f.h.row.combination_hash,toolKey:'who5',instrumentVersion:'1.0.0'})
  for(const axis of ['CONTENT','PARAMETERS','REPORT'] as const)expect(source.reference.combination.axes[axis]).toEqual({version:f.h.row.snapshot.parts[axis].version,axisHash:f.h.row.snapshot.parts[axis].hash,sourceVersion:'1.0.0'})
  expect(source.reference.authority).toEqual({useGrantId:ids.leaf,useGrantVersion:1,authorityGrantId:ids.root,issuerId:ids.issuer})
  expect(source.reference.measurement.contentHash).toBe(f.h.release.content_hash)
  expect(source.referenceHash).toBe(canonicalHash(source.reference));expect(Object.isFrozen(source.reference.combination.axes)).toBe(true)
  expect(f.db.materialGrant.findUnique).not.toHaveBeenCalled();expect(f.h.writes).toEqual([]);expect(f.h.scale.visibility).toBe('HIDDEN')
  expect(JSON.stringify(source)).not.toMatch(/"template"|"payload"|"answers"|"definition"/)
 })
 it('uses the same exact user use across two owned courses without another grant',async()=>{
  const f=trainingSourceHarness(),first=await run(f)
  f.h.composite.questionnaireCourses=[{courseId:tid(80)}]
  const second=await run(f)
  expect(second.reference.authority).toEqual(first.reference.authority)
  expect(second.referenceHash).toBe(first.referenceHash);expect(f.h.writes).toEqual([])
 })
 it('pins the same exact grant in an owned anonymous GENERAL draft without borrowing a course',async()=>{
  const f=trainingSourceHarness();f.h.composite.questionnaireType='GENERAL';f.h.composite.questionnaireCourses=[]
  f.h.composite.publicEnabled=true
  const source=await run(f)
  expect(source.reference.authority.useGrantId).toBe(ids.leaf)
  expect(source.reference.ownerId).toBe(ids.owner)
  expect(source.reference.combination.combinationHash).toBe(f.h.row.combination_hash)
  expect(f.h.calls.some((sql:string)=>sql.includes('FROM courses WHERE id IN'))).toBe(false)
 })
 it.each(['foreign-course','legacy-course','legacy-container','unknown-type'])('rejects mixed or legacy anonymous scope: %s',async kind=>{
  const f=trainingSourceHarness();f.h.composite.questionnaireType='GENERAL';f.h.composite.questionnaireCourses=[]
  if(kind==='foreign-course')f.h.composite.questionnaireCourses=[{courseId:tid(90)}]
  if(kind==='legacy-course')f.h.composite.courseId=tid(91)
  if(kind==='legacy-container')f.h.composite.productKind='LEGACY_COMPOSITE'
  if(kind==='unknown-type')f.h.composite.questionnaireType='OTHER'
  await expect(run(f)).rejects.toThrow('COMPOSITE_UNAVAILABLE')
 })
 // The merged entry contract (PR355, per the 2026-10-25 daily-release rules):
 // a CURRENT formal Training entry admin distributes without per-content
 // re-approval; anyone else must present the exact delegated 21B root.
 // Use-row integrity and the delegated path keep their strict negatives.
 it.each(['missing-use','wrong-recipient','wrong-combo','wrong-hash'])(
  'cannot start from a use row that is not the exact current combination use: %s',async field=>{
   const f=trainingSourceHarness()
   if(field==='missing-use')f.h.use=null
   if(field==='wrong-recipient')f.h.use.teacher_id=tid(99)
   if(field==='wrong-combo')f.h.use.resource_id=tid(99)
   if(field==='wrong-hash')f.h.use.standard_combination_hash='f'.repeat(64)
   await expect(run(f)).rejects.toThrow('精确组合的 Training 使用授权不可用');expect(f.h.writes).toEqual([])
  })
 it.each(['system-issuer'])(
  'entry distribution never borrows system authority: %s',async field=>{
   const f=trainingSourceHarness()
   if(field==='system-issuer')f.h.entryRole='SYSTEM_ADMIN'
   await expect(run(f)).rejects.toThrow('系统管理员不能代替入口管理员');expect(f.h.writes).toEqual([])
  })
 it.each(['replaced-root','missing-root','wrong-product','course-root','wrong-content','wrong-subject','no-distribute','revoked-root','expired-root','future-root','wrong-entry','revoked-entry'])(
  'without a current entry role the exact 21B delegation root is still enforced: %s',async field=>{
   const f=trainingSourceHarness()
   // No formal TRAINING entry admin: distribution must come from the exact grant.
   f.h.entryActive=false
   if(field==='replaced-root')f.h.use.authority_grant_id=tid(99)
   if(field==='missing-root'||field==='wrong-entry'||field==='revoked-entry')f.h.grants=[]
   if(field==='wrong-product')f.root().product='SURVEY'
   if(field==='course-root'){f.root().scope_kind='COURSE';f.root().scope_id=ids.course}
   if(field==='wrong-content')f.root().resource_keys=[tid(99)]
   if(field==='wrong-subject')f.root().subject_id=tid(99)
   if(field==='no-distribute')f.root().capabilities=['material.use']
   if(field==='revoked-root')f.root().revoked_at=new Date('2026-01-01')
   if(field==='expired-root')f.root().expires_at=new Date('2025-01-01')
   if(field==='future-root')f.root().valid_from=new Date('2027-01-01')
   const reason='CONTENT_AUTHORITY_DENIED'
   await expect(run(f)).rejects.toThrow(reason);expect(f.h.writes).toEqual([])
  })
 it('a current formal entry admin distributes without per-content re-approval',async()=>{
  const f=trainingSourceHarness()
  // A use CREATED on the entry-role basis needs no delegated content root.
  // This is distinct from an older delegated use whose issuer gains that role.
  f.h.use.authority_grant_id=null;f.h.use.authority_entry_grant_id=f.h.entryGrantId;f.h.use.authority_entry_grant_version=f.h.entryGrantVersion;f.h.grants=[]
  const source=await run(f)
  expect(source.reference.authority).toMatchObject({useGrantId:ids.leaf,issuerId:ids.issuer})
  expect(f.h.writes).toEqual([])
 })
 it.each(['foreign-owner','foreign-course-owner','library-course','wrong-course-type','frozen-owner','survey-realm','wrong-item','changed-scale-version','changed-scale-key'])(
  'keeps the actual container/source boundary: %s',async field=>{
   const f=trainingSourceHarness()
   if(field==='foreign-owner')f.h.owned=false
   if(field==='foreign-course-owner')f.h.courseOwner=tid(99)
   if(field==='library-course')f.h.courseLibrary=true
   if(field==='wrong-course-type')f.h.courseType='OTHER'
   if(field==='frozen-owner')f.h.principal.is_frozen=true
   if(field==='survey-realm')f.h.principal.account_domain='SURVEY'
   if(field==='wrong-item')f.input.itemId=tid(99)
   if(field==='changed-scale-version')f.h.scale.instrumentVersion='other'
   if(field==='changed-scale-key')f.h.sourceChanged=true
   const reason=field==='foreign-owner'?'测量实例或工具来源不存在':field==='wrong-item'?'SCALE_SOURCE_REQUIRED'
    :field.startsWith('changed-')?'SCALE_SOURCE_CHANGED':['frozen-owner','survey-realm'].includes(field)?'测量实例发布需要当前真实作者资格':'测量实例须属于本人 Training 课程'
   await expect(run(f)).rejects.toThrow(reason)
  })
 it.each(['WITHDRAWN','TRIAL_FAILED','APPROVED','TRIAL_RUNNING'])('refuses new use in %s',async state=>{
  const f=trainingSourceHarness();f.h.row.state=state
  await expect(run(f)).rejects.toThrow('STANDARD_COMBINATION_NOT_CURRENT')
 })
 // License-record absence/revocation/expiry no longer gates deployment or the
 // runtime chain (user decision 2026-10-25 09:48UTC: third-party license
 // records retire as a system gate; real sources and copyright notes remain
 // presentation metadata). Deployment-policy integrity stays enforced.
 it.each(['missing-license','revoked-license','expired-license'])('keeps %s non-gating after license retirement',async field=>{
  const f=trainingSourceHarness()
  if(field==='missing-license')f.h.auth=null
  if(field==='revoked-license')f.h.auth.status='REVOKED'
  if(field==='expired-license')f.h.auth.validTo=new Date('2025-01-01')
  const source=await run(f)
  expect(source.reference.combination).toMatchObject({releaseId:ids.combo})
  expect(f.h.writes).toEqual([])
 })
 it.each(['wrong-mode','changed-policy-hash'])('preserves deployment policy integrity: %s',async field=>{
  const f=trainingSourceHarness()
  if(field==='wrong-mode'){f.h.policy.deploymentModes=['STANDALONE'];f.h.deployment.policyHash=hashScaleDeploymentPolicy(f.h.policy)}
  if(field==='changed-policy-hash')f.h.deployment.policyHash='f'.repeat(64)
  await expect(run(f)).rejects.toThrow(field==='changed-policy-hash'?'Scale deployment policy hash mismatch':'DEPLOYMENT_OR_RIGHTS_UNAVAILABLE')
 })
 it.each(['missing-measurement','revoked-measurement','axis-tamper','report-tamper','template-tamper','parameters-tamper','emergency-stop'])(
  'rejects a broken/stopped source: %s',async field=>{
   const f=trainingSourceHarness()
   if(field==='missing-measurement')f.h.missingMeasurement=true
   if(field==='revoked-measurement')f.h.release.status='REVOKED'
   if(field==='axis-tamper')f.h.row.snapshot.parts.REPORT.payload={unexpected:'changed'}
   if(field==='report-tamper')f.h.row.snapshot.definition.report.disclaimer+=' changed'
   if(field==='template-tamper')f.h.row.snapshot.template.disclaimer+=' changed'
   if(field==='parameters-tamper')f.h.row.snapshot.references.push({unexpected:'changed'})
   if(field==='emergency-stop')f.h.emergency=true
   const reason=field==='report-tamper'?'REPORT_SNAPSHOT_MISMATCH':field==='template-tamper'?'REPORT_TEMPLATE_MISMATCH'
    :field==='parameters-tamper'?'PARAMETERS_SNAPSHOT_MISMATCH':field==='emergency-stop'?'该量表版本已紧急停用':'IDENTITY_MISMATCH'
   await expect(run(f)).rejects.toThrow(reason)
  })
 it('rejects owner and original root expiry after source-lock waits',async()=>{
  const f=trainingSourceHarness();f.h.expireDuringStop=true
  await expect(run(f)).rejects.toThrow('账号不可用')
 })
 it('keeps deployment-policy expiry checks while the license gate is retired',async()=>{
  const f=trainingSourceHarness();f.h.auth.validTo=new Date('2027-01-01');f.h.expireLicenseDuringStop=true
  const source=await run(f)
  expect(source.reference.combination).toMatchObject({releaseId:ids.combo})
 })
 it('rejects client axes, self-authored and PUBLIC fields before any SQL',async()=>{
  const f=trainingSourceHarness()
  for(const extra of [{self_authored:true},{visibility:'PUBLIC'},{axes:f.h.row.snapshot.parts},{ownerId:ids.owner}])
   await expect(freezeTrainingStandardReference(f.db,ids.owner,ids.composite,{...f.input,...extra})).rejects.toMatchObject({name:'ZodError'})
  expect(f.h.calls).toEqual([])
 })
})

describe('the persisted Training source is exact, while live use remains current',()=>{
 it('freezes formal entry authority without inventing a delegated content root',async()=>{
  const f=trainingSourceHarness()
  f.h.grants=[];f.h.use.authority_grant_id=null
  Object.assign(f.h.use,{authority_entry_grant_id:f.h.entryGrantId,authority_entry_grant_version:1})
  const source=await run(f)
  expect(source.reference.authority).toEqual({useGrantId:ids.leaf,useGrantVersion:1,issuerId:ids.issuer,authorityEntryGrantId:f.h.entryGrantId,authorityEntryGrantVersion:1})
  expect(source.reference.authority).not.toHaveProperty('authorityGrantId')
  expect(decodeTrainingStandardItemSource(source)).toEqual(source)
  expect(f.h.calls.some(sql=>sql.includes('FROM content_capability_grants leaf'))).toBe(false)
 })
 it.each(['missing-role','wrong-entry','system-issuer','replaced-role','reissued-role','mixed-bases','partial-basis'])(
  'does not substitute a changed or malformed formal entry basis: %s',async field=>{
   const f=trainingSourceHarness();f.h.use.authority_grant_id=null
   Object.assign(f.h.use,{authority_entry_grant_id:f.h.entryGrantId,authority_entry_grant_version:1})
   if(field==='missing-role')f.h.entryActive=false
   if(field==='wrong-entry')f.h.entryProduct='SURVEY'
   if(field==='system-issuer')f.h.entryRole='SYSTEM_ADMIN'
   if(field==='replaced-role')f.h.entryGrantId=tid(99)
   if(field==='reissued-role')f.h.entryGrantVersion=3
   if(field==='mixed-bases')f.h.use.authority_grant_id=ids.root
   if(field==='partial-basis')f.h.use.authority_entry_grant_version=null
   await expect(run(f)).rejects.toMatchObject({statusCode:403})
   expect(f.h.writes).toEqual([])
  })
 it.each(['compositeId','itemId','scaleId','ownerId'] as const)('refuses a changed %s context before SQL',async field=>{
  const f=trainingSourceHarness(),source=await run(f),context={compositeId:ids.composite,itemId:ids.item,scaleId:ids.scale,ownerId:ids.owner,[field]:tid(99)}
  f.h.calls=[]
  expect(()=>decodeTrainingStandardItemSource(source,context)).toThrow('BINDING_IDENTITY_MISMATCH');expect(f.h.calls).toEqual([])
 })
 it('does not silently adopt a newly issued use id',async()=>{
  const f=trainingSourceHarness(),source=await run(f),item=frozen(f,source);f.h.use.id=tid(99)
  await expect(verifyStoredTrainingStandardItem(f.db,f.h.composite,item,'COLLECTION')).rejects.toThrow('使用授权不可用')
 })
 it('does not revive an old frozen reference when the same use UUID is explicitly reissued',async()=>{
  const f=trainingSourceHarness(),source=await run(f),item=frozen(f,source)
  f.h.use.revoked_at=new Date('2026-10-25T06:01:00Z');f.h.use.version=2
  await expect(verifyStoredTrainingStandardItem(f.db,f.h.composite,item,'COLLECTION')).rejects.toThrow('使用授权不可用')
  f.h.use.revoked_at=null;f.h.use.version=3
  await expect(verifyStoredTrainingStandardItem(f.db,f.h.composite,item,'COLLECTION')).rejects.toThrow('使用授权不可用')
  const fresh=await run(f);expect(fresh.reference.authority.useGrantVersion).toBe(3)
  expect(fresh.referenceHash).not.toBe(source.referenceHash)
 })
 it('preserves frozen C/P/R through installed-version changes, but not current grant or emergency revocation',async()=>{
  const f=trainingSourceHarness(),source=await run(f),item=frozen(f,source)
  f.h.scale.status='DRAFT';f.h.scale.instrumentVersion='newer';f.h.auth.validTo=new Date('2025-01-01');f.h.release.status='SUPERSEDED'
  await expect(verifyStoredTrainingStandardItem(f.db,f.h.composite,item,'COLLECTION')).resolves.toMatchObject({referenceHash:source.referenceHash})
  f.h.scaleStop=true;await expect(verifyStoredTrainingStandardItem(f.db,f.h.composite,item,'COLLECTION')).rejects.toThrow('SCALE_EMERGENCY_STOPPED')
  f.h.scaleStop=false;f.h.use=null;await expect(verifyStoredTrainingStandardItem(f.db,f.h.composite,item,'COLLECTION')).rejects.toThrow('使用授权不可用')
 })
 it('keeps start-only hold semantics and current combination withdrawal separate',async()=>{
  const f=trainingSourceHarness(),source=await run(f),item=frozen(f,source),identity={family:'SCALE' as const,key:'who5',version:'1.0.0'}
  ASSESSMENT_OPERATIONAL_HOLDS.set(operationalIdentityKey(identity),{...identity,reasonCode:'SYNTHETIC_NEW_START_ONLY',effectiveAt:'2026-10-25T00:00:00Z'})
  await expect(run(f)).rejects.toThrow('OPERATIONALLY_PAUSED')
  await expect(verifyStoredTrainingStandardItem(f.db,f.h.composite,item,'COLLECTION')).resolves.toMatchObject({referenceHash:source.referenceHash})
  f.h.row.state='WITHDRAWN';await expect(verifyStoredTrainingStandardItem(f.db,f.h.composite,item,'COLLECTION')).rejects.toThrow('NOT_CURRENT')
 })
})


describe('exact Training entry approval precedes grant and publication',()=>{
 it.each(['PENDING','RETURNED','PAUSED'] as const)('rejects %s during source binding instead of waiting for student START',async state=>{
  const f=trainingSourceHarness();f.h.trainingDecision=state==='PAUSED'?'APPROVED':state;f.h.trainingPaused=state==='PAUSED'
  await expect(run(f)).rejects.toMatchObject({statusCode:409})
  expect(f.h.writes).toEqual([])
 })
 it('does not issue a Training use for a combination without Training entry approval',async()=>{
  const f=trainingSourceHarness();f.h.trainingDecision='PENDING'
  const {prisma}=await import('../../config/database'),client=prisma as any,previous=client.$transaction
  client.$transaction=async(fn:any)=>fn(f.db)
  try{
   const {grantTrainingStandardCombinationUse}=await import('../../modules/measurement-content/standard-combination-use')
   await expect(grantTrainingStandardCombinationUse(ids.issuer,ids.combo,{requestId:tid(101),userId:ids.owner,combinationHash:f.h.row.combination_hash})).rejects.toMatchObject({statusCode:409})
   expect(f.h.writes).toEqual([])
  }finally{client.$transaction=previous}
 })
})


describe('frozen delegation is not replaced by a later entry appointment',()=>{
 it.each(['missing','revoked','expired','wrong-content','wrong-product'] as const)('rejects the original %s root even while issuer has a current entry role',async state=>{
  const f=trainingSourceHarness();expect(f.h.entryActive).toBe(true)
  if(state==='missing')f.h.grants=[]
  if(state==='revoked')f.root().revoked_at=new Date('2026-01-01')
  if(state==='expired')f.root().expires_at=new Date('2025-01-01')
  if(state==='wrong-content')f.root().resource_keys=[tid(99)]
  if(state==='wrong-product')f.root().product='SURVEY'
  await expect(run(f)).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
  expect(f.h.writes).toEqual([])
 })
})


it('projects each approved C/P/R version label for the authorized Training picker without exposing its snapshot',async()=>{
 const f=trainingSourceHarness(),parts=f.h.row.snapshot.parts
 parts.CONTENT.version='approved-content-1';parts.PARAMETERS.version='approved-parameters-2';parts.REPORT.version='none-v1'
 const {prisma}=await import('../../config/database'),client=prisma as any,previous=client.$transaction
 client.$transaction=async(fn:any)=>fn(f.db)
 try{
  const {listTrainingStandardCombinationChoices}=await import('../../modules/measurement-content/standard-combination-use')
  const choices=await listTrainingStandardCombinationChoices(ids.owner)
  expect(choices).toHaveLength(1)
  expect(choices[0]).toMatchObject({combination:f.input.combination,scaleId:ids.scale,instrumentVersion:'1.0.0',axisVersions:{CONTENT:'approved-content-1',PARAMETERS:'approved-parameters-2',REPORT:'none-v1'}})
  expect(choices[0]).not.toHaveProperty('snapshot');expect(choices[0]).not.toHaveProperty('definition');expect(choices[0]).not.toHaveProperty('references')
  expect(f.h.writes).toEqual([])
 }finally{client.$transaction=previous}
})


it('projects only validated frozen display metadata into teacher summaries without current authority reads',async()=>{
 const f=trainingSourceHarness(),source=await run(f),combination=source.reference.combination
 // Historical labels come from the validated frozen item, even after mutable
 // availability changes. The caller still owns normal container/data ACL.
 f.h.use=null;f.h.entryActive=false;f.h.row.state='WITHDRAWN';f.h.calls=[]
 const summary=trainingStandardCombinationSummary(source)
 expect(summary).toEqual({instrumentVersion:combination.instrumentVersion,configurationName:null,authorizationMode:'LEGACY',axisVersions:{
  CONTENT:combination.axes.CONTENT.version,PARAMETERS:combination.axes.PARAMETERS.version,REPORT:combination.axes.REPORT.version}})
 expect(summary.axisVersions).not.toBe(combination.axes)
 expect(Object.keys(summary).sort()).toEqual(['authorizationMode','axisVersions','configurationName','instrumentVersion'])
 expect(JSON.stringify(summary)).not.toMatch(/authority|issuer|grant|hash|releaseId|scaleId|ownerId|definition|snapshot/i)
 expect(f.h.calls).toEqual([]);expect(f.h.writes).toEqual([])
 const tampered=JSON.parse(JSON.stringify(source));tampered.reference.combination.axes.REPORT.version='later-report'
 expect(()=>trainingStandardCombinationSummary(tampered)).toThrow('REFERENCE_HASH_MISMATCH')
 expect(()=>trainingStandardCombinationSummary(null)).toThrow()
 expect(f.h.calls).toEqual([])
})

it('continues past 100 stale grants through an explicit page cursor, retaining current use checks',async()=>{
 const f=trainingSourceHarness(),original=f.db.$queryRaw.getMockImplementation()!
 f.h.use!.id=tid(1100)
 const {prisma}=await import('../../config/database'),client=prisma as any,previous=client.$transaction
 client.$transaction=async(fn:any)=>fn(f.db)
 let pages=0
 f.db.$queryRaw.mockImplementation(async(query:any,...args:any[])=>{
  if(query.sql.includes('FROM material_grants g JOIN survey_standard_releases')){
   const [valid]=await original(query,...args)
   if(++pages===1)return [...Array.from({length:100},(_,i)=>({...valid,use_id:tid(1000+i)})),valid]
   expect(query.sql).toContain('(r.tool_key,r.id,g.id)>')
   expect(query.values.slice(-3)).toEqual([valid.tool_key,valid.id,tid(1099)])
   return [valid]
  }
  return original(query,...args)
 })
 try{
  const {listTrainingStandardCombinationChoicePage}=await import('../../modules/measurement-content/standard-combination-use')
  const first=await listTrainingStandardCombinationChoicePage(ids.owner)
  expect(first.list).toEqual([]);expect(first.nextCursor).not.toBeNull()
  const second=await listTrainingStandardCombinationChoicePage(ids.owner,first.nextCursor!)
  expect(pages).toBe(2);expect(second.list).toHaveLength(1);expect(second.list[0].useGrantId).toBe(tid(1100))
 }finally{client.$transaction=previous}
})
