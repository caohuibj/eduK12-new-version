import {afterEach,describe,expect,it,vi} from 'vitest'
vi.mock('../../config/database',()=>({prisma:{}}))
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {ASSESSMENT_OPERATIONAL_HOLDS,operationalIdentityKey} from '../../modules/assessment-governance/operational-hold'
import {freezeTrainingStandardReference,verifyTrainingStandardReference,freezeTrainingStandardBinding,verifyTrainingStandardBinding} from '../../modules/composite/training-standard-combination'
import {ids,tid,trainingSourceHarness} from './training-standard-source.fixture'
import {hashScaleDeploymentPolicy} from '../../modules/scale/policy/deployment'

afterEach(()=>ASSESSMENT_OPERATIONAL_HOLDS.clear())
const run=(f:ReturnType<typeof trainingSourceHarness>)=>freezeTrainingStandardReference(f.db,ids.owner,ids.composite,f.input)
describe('Training consumes one exact shared C/P/R reference under real current authority guards',()=>{
  it('pins the same shared combination, axes and formal C while keeping HIDDEN and writing no business data',async()=>{
    const f=trainingSourceHarness(),before=structuredClone(f.h),result=await run(f)
    expect(result.reference.combination).toMatchObject({releaseId:f.h.row.id,combinationHash:f.h.row.combination_hash,toolKey:'who5',instrumentVersion:'1.0.0'})
    for(const axis of ['CONTENT','PARAMETERS','REPORT'] as const)expect(result.reference.combination.axes[axis]).toEqual({version:f.h.row.snapshot.parts[axis].version,axisHash:f.h.row.snapshot.parts[axis].hash,sourceVersion:'1.0.0'})
    expect(result.reference.measurement).toEqual({releaseId:ids.measurement,contentHash:f.h.release.content_hash,measurementHash:f.h.release.content.measurementHash})
    expect(result.reference.authority).toEqual({useGrantId:ids.leaf,useGrantVersion:1,issuerId:ids.issuer})
    expect(result.reference.reportDisclosure).toBe('EXISTING_TRAINING_POLICY')
    expect(result.referenceHash).toBe(canonicalHash(result.reference));expect(Object.isFrozen(result.reference.combination.axes)).toBe(true)
    expect(f.h.scale.visibility).toBe('HIDDEN');expect(f.h.grants).toEqual(before.grants);expect(f.h.writes).toEqual([])
    expect(JSON.stringify(result.reference)).not.toMatch(/"template"|"payload"|"answers"|"summary"|"definition"/)
    expect(f.h.calls[0]).toContain('c.created_by=')
    expect(f.h.calls.findIndex(s=>s.includes('pg_advisory_xact_lock_shared'))).toBeLessThan(f.h.calls.findIndex(s=>s.includes('FROM content_capability_grants leaf')))
  })
  it.each(['missing-material','missing-use-grant','wrong-entry','revoked-entry','system-issuer','wrong-product','wrong-course','wrong-combo','wrong-subject','no-use-capability','revoked-use','expired-use','future-use','missing-parent'])(
    'ONLINE cannot substitute for %s authorization',async field=>{
      const f=trainingSourceHarness()
      if(field==='missing-material')f.h.materialActive=false
      if(field==='missing-use-grant')f.h.grants=[]
      if(field==='wrong-entry')f.h.entryProduct='SURVEY'
      if(field==='revoked-entry')f.h.entryActive=false
      if(field==='system-issuer')f.h.entryRole='SYSTEM_ADMIN'
      if(field==='wrong-product')for(const g of f.h.grants)g.product='SURVEY'
      if(field==='wrong-course')for(const g of f.h.grants)g.scope_id=tid(99)
      if(field==='wrong-combo')for(const g of f.h.grants)g.resource_keys=['other-combination']
      if(field==='wrong-subject')f.leaf().subject_id='other'
      if(field==='no-use-capability')f.leaf().capabilities=['material.adapt']
      if(field==='revoked-use')f.leaf().revoked_at=new Date('2026-01-01')
      if(field==='expired-use')f.leaf().expires_at=new Date('2025-01-01')
      if(field==='future-use')f.leaf().valid_from=new Date('2027-01-01')
      if(field==='missing-parent')f.h.grants=f.h.grants.filter(g=>g.id!==ids.root)
      const reason=field==='missing-material'?'SCALE_USE_DENIED'
        :['wrong-entry','revoked-entry','system-issuer'].includes(field)?'缺少当前入口管理授权':'CONTENT_AUTHORITY_DENIED'
      await expect(run(f)).rejects.toThrow(reason);expect(f.h.writes).toEqual([])
    })
  it.each(['foreign-owner','foreign-course-owner','wrong-course-type','library-course','frozen-owner','survey-realm','wrong-item','wrong-scale-version','changed-source'])(
    'retains actual project and source scope: %s',async field=>{
      const f=trainingSourceHarness()
      if(field==='foreign-owner')f.h.owned=false
      if(field==='foreign-course-owner')f.h.courseOwner='foreign'
      if(field==='wrong-course-type')f.h.courseType='OTHER'
      if(field==='library-course')f.h.courseLibrary=true
      if(field==='frozen-owner')f.h.principal.is_frozen=true
      if(field==='survey-realm')f.h.principal.account_domain='SURVEY'
      if(field==='wrong-item')f.input.itemId=tid(99)
      if(field==='wrong-scale-version')f.h.scale.instrumentVersion='other'
      if(field==='changed-source')f.h.sourceChanged=true
      const reason=field==='foreign-owner'?'测量实例或工具来源不存在'
        :['foreign-course-owner','wrong-course-type','library-course'].includes(field)?'测量实例须属于本人 Training 课程'
        :['frozen-owner','survey-realm'].includes(field)?'测量实例发布需要当前真实作者资格'
        :field==='wrong-item'?'SCALE_SOURCE_REQUIRED':'SCALE_SOURCE_CHANGED'
      await expect(run(f)).rejects.toThrow(reason);expect(f.h.writes).toEqual([])
    })
  it.each(['WITHDRAWN','TRIAL_FAILED','APPROVED','TRIAL_RUNNING'])('refuses a shared combination in %s',async state=>{
    const f=trainingSourceHarness();f.h.row.state=state
    await expect(run(f)).rejects.toThrow('STANDARD_COMBINATION_NOT_CURRENT');expect(f.h.writes).toEqual([])
  })
  it.each(['missing-license','revoked-license','expired-license','wrong-rights-mode','changed-policy-hash'])(
    'keeps the actual deployment/third-party license boundary: %s',async field=>{
      const f=trainingSourceHarness()
      if(field==='missing-license')f.h.auth=null
      if(field==='revoked-license')f.h.auth.status='REVOKED'
      if(field==='expired-license')f.h.auth.validTo=new Date('2025-01-01')
      if(field==='wrong-rights-mode'){f.h.policy.deploymentModes=['STANDALONE'];f.h.deployment.policyHash=hashScaleDeploymentPolicy(f.h.policy)}
      if(field==='changed-policy-hash')f.h.deployment.policyHash='f'.repeat(64)
      await expect(run(f)).rejects.toThrow(field==='changed-policy-hash'?'Scale deployment policy hash mismatch':'DEPLOYMENT_OR_RIGHTS_UNAVAILABLE')
      expect(f.h.writes).toEqual([])
    })
  it.each(['missing-measurement','revoked-measurement','axis-tamper','compiled-report-tamper','parameters-tamper','emergency-stop'])(
    'does not accept a broken or stopped frozen source: %s',async field=>{
      const f=trainingSourceHarness()
      if(field==='missing-measurement')f.h.missingMeasurement=true
      if(field==='revoked-measurement')f.h.release.status='REVOKED'
      if(field==='axis-tamper')f.h.row.snapshot.parts.REPORT.payload={unexpected:'changed'}
      if(field==='compiled-report-tamper')f.h.row.snapshot.definition.report.disclaimer+=' changed'
      if(field==='parameters-tamper')f.h.row.snapshot.references.push({unexpected:'changed'})
      if(field==='emergency-stop')f.h.emergency=true
      const reason=field==='compiled-report-tamper'?'REPORT_SNAPSHOT_MISMATCH'
        :field==='parameters-tamper'?'PARAMETERS_SNAPSHOT_MISMATCH':field==='emergency-stop'?'该量表版本已紧急停用':'IDENTITY_MISMATCH'
      await expect(run(f)).rejects.toThrow(reason);expect(f.h.writes).toEqual([])
    })
  it('rechecks UTC use-grant expiry after a source/stop lock wait',async()=>{
    const f=trainingSourceHarness();f.h.expireDuringStop=true
    await expect(run(f)).rejects.toThrow('CONTENT_AUTHORITY_DENIED');expect(f.h.writes).toEqual([])
  })
  it('rechecks real source license expiry after the same lock wait',async()=>{
    const f=trainingSourceHarness();f.h.auth.validTo=new Date('2027-01-01');f.h.expireLicenseDuringStop=true
    await expect(run(f)).rejects.toThrow('DEPLOYMENT_OR_RIGHTS_UNAVAILABLE');expect(f.h.writes).toEqual([])
  })
  it('rejects client-supplied axes, self-authored labels and public visibility fields',async()=>{
    const f=trainingSourceHarness()
    for(const extra of [{self_authored:true},{visibility:'PUBLIC'},{axes:f.h.row.snapshot.parts}])await expect(freezeTrainingStandardReference(f.db,ids.owner,ids.composite,{...f.input,...extra})).rejects.toThrow()
    expect(f.h.calls).toEqual([])
  })
})

describe('frozen Training combination reference is exact and independently reauthorized',()=>{
  it('serializes an immutable reference and verifies the same ids without latest or implicit grants',async()=>{
    const f=trainingSourceHarness(),frozen=await freezeTrainingStandardBinding(f.db,f.context,f.input)
    const restored=JSON.parse(JSON.stringify(frozen.binding))
    expect(await verifyTrainingStandardBinding(f.db,f.context,restored,frozen.bindingHash)).toEqual(frozen.binding)
    expect(f.h.calls.filter(s=>s.includes('FROM survey_standard_releases')).every(s=>s.includes('WHERE id=')&&s.includes('FOR SHARE'))).toBe(true)
    expect(f.h.writes).toEqual([])
  })
  it.each(['attemptId','epoch','publicationHash','compositeId','actorId','courseId'] as const)('rejects changed %s container scope before reading source/grants',async field=>{
    const f=trainingSourceHarness(),frozen=await freezeTrainingStandardBinding(f.db,f.context,f.input),changed={...f.context}
    ;(changed as any)[field]=field==='epoch'?2:field==='publicationHash'?'f'.repeat(64):tid(99)
    f.h.calls=[]
    await expect(verifyTrainingStandardBinding(f.db,changed,frozen.binding,frozen.bindingHash)).rejects.toThrow('BINDING_IDENTITY_MISMATCH')
    expect(f.h.calls).toEqual([])
  })
  it('does not let a matching recomputed hash replace current authority',async()=>{
    const f=trainingSourceHarness(),source=await run(f)
    f.leaf().revoked_at=new Date('2026-01-01')
    await expect(verifyTrainingStandardReference(f.db,source.reference,canonicalHash(source.reference))).rejects.toThrow('CONTENT_AUTHORITY_DENIED')
  })
  it('rejects a later grant version and never silently renews the frozen reference',async()=>{
    const f=trainingSourceHarness(),source=await run(f);f.leaf().version++
    await expect(verifyTrainingStandardReference(f.db,source.reference,source.referenceHash)).rejects.toThrow('FROZEN_IDENTITY_CHANGED')
  })
  it('preserves start-only hold semantics while DB emergency stops and combo withdrawal still block collection',async()=>{
    const f=trainingSourceHarness(),source=await run(f),identity={family:'SCALE' as const,key:'who5',version:'1.0.0'}
    ASSESSMENT_OPERATIONAL_HOLDS.set(operationalIdentityKey(identity),{...identity,reasonCode:'SYNTHETIC_NEW_START_ONLY',effectiveAt:'2026-10-25T00:00:00Z'})
    await expect(run(f)).rejects.toThrow('OPERATIONALLY_PAUSED')
    await expect(verifyTrainingStandardReference(f.db,source.reference,source.referenceHash)).resolves.toMatchObject({referenceHash:source.referenceHash})
    f.h.scaleStop=true
    await expect(verifyTrainingStandardReference(f.db,source.reference,source.referenceHash)).rejects.toThrow('SCALE_EMERGENCY_STOPPED')
    f.h.scaleStop=false;f.h.row.state='WITHDRAWN'
    await expect(verifyTrainingStandardReference(f.db,source.reference,source.referenceHash)).rejects.toThrow('NOT_CURRENT')
  })
  it('does not reinterpret in-flight source identity as a new deployment approval',async()=>{
    const f=trainingSourceHarness(),source=await run(f)
    f.h.auth.validTo=new Date('2025-01-01');f.h.release.status='SUPERSEDED';f.h.scale.status='DRAFT'
    await expect(run(f)).rejects.toThrow()
    await expect(verifyTrainingStandardReference(f.db,source.reference,source.referenceHash)).resolves.toMatchObject({referenceHash:source.referenceHash})
    expect(f.h.writes).toEqual([])
  })
})
