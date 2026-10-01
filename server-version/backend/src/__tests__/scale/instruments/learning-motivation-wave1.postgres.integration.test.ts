import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { describe,it,expect,afterAll } from 'vitest'
import { integrationDatabaseUrl } from '../../integration/integration-env'
import { listScaleInstrumentSources,getScaleInstrumentRuntimePolicy } from '../../../modules/scale/onboarding/instrument-registry'
import { installScaleInstrument,planScaleInstrumentInstall } from '../../../modules/scale/onboarding/install'
import { planStandardScalePublication,publishStandardScale } from '../../../modules/scale/onboarding/publish'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
suite('Wave1 registered content install and publication (isolated PostgreSQL)',{timeout:60_000},()=>{
 const db=new PrismaClient({datasources:{db:{url}}});afterAll(()=>db.$disconnect())
 it('installs all 36, publishes with real gates, and reapplies idempotently',async()=>{
  const actor=await db.user.upsert({where:{username:'wave1-test-system-admin'},create:{username:'wave1-test-system-admin',passwordHash:'test-only',role:'ADMIN',platformRole:'SYSTEM_ADMIN'},update:{}})
  const sources=listScaleInstrumentSources().filter(s=>s.executable?.definition.versionAxes)
  for(const source of sources){
   const key=source.identity.instrumentKey,digest=createHash('sha256').update('wave1-test-only-'+key).digest('hex'),auth=`${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`
   await db.instrumentAuthorization.deleteMany({where:{instrumentKey:key,authorizationKey:'wave1-test-only-'+key,basis:'TEST ONLY — not a production grant'}})
   if(!await db.instrumentAuthorization.findFirst({where:{authorizationKey:auth,version:1}}))await db.instrumentAuthorization.create({data:{authorizationKey:auth,version:1,instrumentKey:key,instrumentVersion:'1.0.0',grantor:'Disposable test fixture',grantee:'Disposable Wave1 verification database',electronicAdministration:true,scoring:true,display:true,translation:true,territories:['CN'],locales:['zh-CN'],commercialNature:'NON_COMMERCIAL',validFrom:new Date('2020-01-01'),validTo:new Date('2099-01-01'),basis:'TEST ONLY — not a production grant',status:'APPROVED',approvedByUserId:actor.id,approvedAt:new Date(),createdByUserId:actor.id,recordHash:'a'.repeat(64)}})
   const input={instrumentKey:key,instrumentVersion:'1.0.0',actorUserId:actor.id,deploymentPolicy:{schemaVersion:1 as const,revision:1,locale:'zh-CN',territory:'CN',commercialNature:'NON_COMMERCIAL' as const,deploymentModes:['STANDALONE','COMPOSITE'] as ('STANDALONE'|'COMPOSITE')[],requiredRightsActions:['electronicAdministration','scoring','display'],authorizationRefs:[auth],runtimePolicyHash:getScaleInstrumentRuntimePolicy(key,'1.0.0')!.runtimePolicyHash,localizationVersion:'1.0.0',inFlightCompletion:'FROZEN_DEADLINE' as const,completionWindowMs:86400000}}
   expect((await planScaleInstrumentInstall(db,input)).blockers,key).toEqual([])
   await installScaleInstrument(db,input)
   const publication={instrumentKey:key,instrumentVersion:'1.0.0',actorUserId:actor.id,visibility:'COURSE' as const},preview=await planStandardScalePublication(db,publication)
   expect(preview.blockers,key).toEqual([]);await publishStandardScale(db,{...publication,expectedProofHash:preview.proofHash})
   const row=await db.scale.findUniqueOrThrow({where:{code:key}});expect(row.status).toBe('PUBLISHED');expect(row.instrumentClass).toBe('STANDARD')
   const snapshots=await db.$queryRaw<Array<{source_hash:string}>>`SELECT source_hash FROM scale_axis_snapshots WHERE scale_id=${row.id}`;expect(snapshots).toHaveLength(1);expect(snapshots[0].source_hash).toMatch(/^[a-f0-9]{64}$/)
   await expect(db.$executeRaw`UPDATE scale_axis_snapshots SET source_hash=${'b'.repeat(64)} WHERE scale_id=${row.id}`).rejects.toThrow()
   await expect(db.$executeRaw`DELETE FROM scale_axis_snapshots WHERE scale_id=${row.id}`).rejects.toThrow()
   expect((await installScaleInstrument(db,input)).deploymentAlreadyActive).toBe(true)
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
