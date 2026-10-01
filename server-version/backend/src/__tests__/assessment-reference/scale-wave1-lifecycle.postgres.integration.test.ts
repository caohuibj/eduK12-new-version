import { randomUUID } from 'node:crypto'
import { PrismaClient, Prisma } from '@prisma/client'
import { afterAll,describe,it,expect } from 'vitest'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { testReference } from './wave1-reference.fixture'
import { activateReviewedReference } from '../../modules/assessment-reference/lifecycle'
import { referenceSetHash,loadFrozenReferenceSets } from '../../modules/assessment-runtime/reference-binding'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
suite('governed reference lifecycle (real PostgreSQL)',()=>{
 const db=new PrismaClient({datasources:{db:{url}}});afterAll(()=>db.$disconnect())
 it('activates, supersedes, retires; immutable history still replays',async()=>{
  const v1=testReference();v1.instrumentKey='test_wave1_'+randomUUID().replaceAll('-','');v1.status='DRAFT'
  await activateReviewedReference(db,v1)
  const v2=structuredClone(v1);v2.referenceVersion='v2';v2.entries[0].governance!.effectiveFrom='2026-10-02T00:00:00Z'
  await activateReviewedReference(db,v2)
  const old=await db.assessmentReferenceSet.findUniqueOrThrow({where:{instrumentType_instrumentKey_referenceVersion:{instrumentType:'SCALE',instrumentKey:v1.instrumentKey,referenceVersion:'v1'}}})
  expect(old.status).toBe('SUPERSEDED')
  await expect(db.assessmentReferenceSet.update({where:{id:old.id},data:{definition:{changed:true}}})).rejects.toThrow('REFERENCE_SNAPSHOT_IMMUTABLE')
  await expect(db.assessmentReferenceSet.delete({where:{id:old.id}})).rejects.toThrow('REFERENCE_SNAPSHOT_DELETE_FORBIDDEN')
  await expect(db.assessmentReferenceSet.update({where:{id:old.id},data:{status:'ACTIVE'}})).rejects.toThrow('REFERENCE_LIFECYCLE_INVALID')
  await db.assessmentReferenceSet.update({where:{id:old.id},data:{status:'RETIRED'}})
  const replay=await loadFrozenReferenceSets(db as never,{instrumentType:'SCALE',instrumentKey:v1.instrumentKey,bindings:[{referenceKey:v1.instrumentKey,referenceVersion:'v1',referenceHash:referenceSetHash(v1)}]})
  expect(replay[0].status).toBe('ACTIVE')
  // Immutable test records intentionally remain in the disposable verification DB.
 })
 it('legacy ungoverned rows can still be deleted',async()=>{
  const legacy=testReference();delete legacy.entries[0].governance;legacy.entries[0].referenceKind='descriptive_sample';legacy.entries[0].evidenceLevel='local_pilot';legacy.entries[0].provenanceType='local_observed';legacy.instrumentKey='test_legacy_'+randomUUID()
  const row=await db.assessmentReferenceSet.create({data:{instrumentType:'SCALE',instrumentKey:legacy.instrumentKey,referenceVersion:'v1',status:'DRAFT',definition:legacy as unknown as Prisma.InputJsonValue}})
  await db.assessmentReferenceSet.delete({where:{id:row.id}});expect(await db.assessmentReferenceSet.findUnique({where:{id:row.id}})).toBeNull()
 })
})
