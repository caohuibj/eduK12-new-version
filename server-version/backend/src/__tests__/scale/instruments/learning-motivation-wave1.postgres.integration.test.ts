import { PrismaClient } from '@prisma/client'
import { describe,it,expect,afterAll } from 'vitest'
import { integrationDatabaseUrl } from '../../integration/integration-env'
import { listScaleInstrumentSources,getScaleInstrumentRuntimePolicy } from '../../../modules/scale/onboarding/instrument-registry'
import { installScaleInstrument,planScaleInstrumentInstall } from '../../../modules/scale/onboarding/install'
import { planStandardScalePublication,publishStandardScale } from '../../../modules/scale/onboarding/publish'
import chemistryHistory from '../../../modules/scale/instruments/teacher_subject_liking_chemistry_zh_cn/1.0.0/report-variants.json'
const wave1Keys=new Set(['academic_self_concept','academic_self_efficacy','domain_fixed_mindset','teacher_subject_liking','tutoring_necessity','value_cost'].flatMap(family=>
 ['mathematics','chemistry','physics','biology','english','chinese'].map(subject=>`${family}_${subject}_zh_cn`)))
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
suite('Wave1 registered content install and publication (isolated PostgreSQL)',{timeout:60_000},()=>{
 const db=new PrismaClient({datasources:{db:{url}}});afterAll(()=>db.$disconnect())
 it('installs all 36, publishes with real gates, and reapplies idempotently',async()=>{
  const actor=await db.user.upsert({where:{username:'wave1-test-system-admin'},create:{username:'wave1-test-system-admin',passwordHash:'test-only',role:'ADMIN',platformRole:'SYSTEM_ADMIN'},update:{}})
  // Other independent-axis packages have their own versions and report variants.
  const sources=listScaleInstrumentSources().filter(s=>wave1Keys.has(s.identity.instrumentKey)&&s.identity.instrumentVersion==='1.0.0')
  expect(sources).toHaveLength(36)
  expect(sources.map(source=>source.identity.instrumentKey).sort()).toEqual([...wave1Keys].sort())
  for(const source of sources){
   const key=source.identity.instrumentKey
   const input={instrumentKey:key,instrumentVersion:'1.0.0',actorUserId:actor.id,deploymentPolicy:{schemaVersion:2 as const,revision:1,locale:'zh-CN',territory:'CN',deploymentModes:['STANDALONE','COMPOSITE'] as ('STANDALONE'|'COMPOSITE')[],runtimePolicyHash:getScaleInstrumentRuntimePolicy(key,'1.0.0')!.runtimePolicyHash,localizationVersion:'1.0.0',inFlightCompletion:'FROZEN_DEADLINE' as const,completionWindowMs:86400000}}
   expect((await planScaleInstrumentInstall(db,input)).blockers,key).toEqual([])
   await installScaleInstrument(db,input)
   const publication={instrumentKey:key,instrumentVersion:'1.0.0',actorUserId:actor.id,visibility:'COURSE' as const,allowedProducts:['TRAINING' as const]},preview=await planStandardScalePublication(db,publication)
   expect(preview.blockers,key).toEqual([]);await publishStandardScale(db,{...publication,expectedProofHash:preview.proofHash})
   const row=await db.scale.findUniqueOrThrow({where:{code:key}});expect(row.status).toBe('PUBLISHED');expect(row.instrumentClass).toBe('STANDARD')
   const snapshots=await db.$queryRaw<Array<{source_hash:string;axes:{reportVersion:string};source_snapshot:{executable:{definition:{report:unknown}}}}>>`SELECT source_hash,axes,source_snapshot FROM scale_axis_snapshots WHERE scale_id=${row.id} ORDER BY axis_hash`
   const expectedReports=key==='teacher_subject_liking_chemistry_zh_cn'?['1.1.0','1.1.1']:['1.1.0']
   expect(snapshots.map(snapshot=>snapshot.axes.reportVersion).sort()).toEqual(expectedReports)
   for(const snapshot of snapshots)expect(snapshot.source_hash).toMatch(/^[a-f0-9]{64}$/)
   if(key==='teacher_subject_liking_chemistry_zh_cn')expect(snapshots.find(snapshot=>snapshot.axes.reportVersion==='1.1.0')!.source_snapshot.executable.definition.report).toEqual(chemistryHistory.variants[0].report)
   await expect(db.$executeRaw`UPDATE scale_axis_snapshots SET source_hash=${'b'.repeat(64)} WHERE scale_id=${row.id}`).rejects.toThrow()
   await expect(db.$executeRaw`DELETE FROM scale_axis_snapshots WHERE scale_id=${row.id}`).rejects.toThrow()
   expect((await installScaleInstrument(db,input)).deploymentAlreadyActive).toBe(true)
   if(key==='teacher_subject_liking_chemistry_zh_cn')expect(await db.$queryRaw`SELECT source_hash,axes,source_snapshot FROM scale_axis_snapshots WHERE scale_id=${row.id} ORDER BY axis_hash`).toEqual(snapshots)
   expect(await db.assessmentReferenceSet.count({where:{instrumentKey:key,status:'ACTIVE'}})).toBe(1)
  }
  expect(sources).toHaveLength(36)
  // Leave reviewable installed content in the disposable test DB. No production data used.
 })
 it('refuses publication by a non-platform-admin',async()=>{
  const actor=await db.user.upsert({where:{username:'wave1-test-student'},create:{username:'wave1-test-student',passwordHash:'test-only',role:'STUDENT'},update:{}})
  const preview=await planStandardScalePublication(db,{instrumentKey:'academic_self_concept_chemistry_zh_cn',instrumentVersion:'1.0.0',actorUserId:actor.id,visibility:'COURSE'})
  expect(preview.blockers).toContain('SYSTEM_ADMIN_REQUIRED')
 })
})
