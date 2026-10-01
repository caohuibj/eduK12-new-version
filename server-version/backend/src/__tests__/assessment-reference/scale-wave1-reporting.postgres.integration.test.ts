import { randomUUID } from 'node:crypto'
import { beforeAll,afterAll,describe,it,expect } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { buildReportingFixture } from '../integration/reporting-fixture'
import { grantCapability } from '../../modules/organization/service'
import { testReference } from './wave1-reference.fixture'
import { activateReviewedReference } from '../../modules/assessment-reference/lifecycle'
import { referenceSetHash } from '../../modules/assessment-runtime/reference-binding'
import { generateIndividualLongitudinal } from '../../modules/reporting/individualService'
import { readReportingArtifactRecord } from '../../modules/reporting/artifact'
import { createPlatformReportingSpec,reviewPlatformReportingSpec,publishPlatformReportingSpec } from '../../modules/reporting/spec'
import type { ReportingIndividualLongitudinalSpecV1 } from '../../modules/reporting/types'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
suite('Wave1 frozen references through authoritative reporting (real PostgreSQL)',{timeout:60_000},()=>{
 let db:PrismaClient
 beforeAll(()=>{process.env.DATABASE_URL=url;process.env.DATA_ENCRYPTION_KEY='b'.repeat(64);db=new PrismaClient({datasources:{db:{url}}})});afterAll(()=>db.$disconnect())
 it('persists decimal Scale facts, freezes v2; later v3 only changes explicit regeneration',async()=>{
  const key='wave1_reporting_'+randomUUID().replaceAll('-',''),references=[1,2,3].map(n=>{const r=testReference();r.instrumentKey=key;r.referenceVersion=`v${n}`;r.status='DRAFT';r.entries[0].scoreKey='score';r.entries[0].governance!.effectiveFrom=`2026-0${n}-01T00:00:00Z`;return r})
  await activateReviewedReference(db,references[0]);await activateReviewedReference(db,references[1])
  const identity=(n:number)=>({instrumentKey:key,instrumentVersion:'1.0.0',scoringVersion:'1.0.0',measurementHash:'a'.repeat(64),subjectKey:'physics',locale:'zh-CN',schoolStage:'junior_secondary' as const,scoreKey:'score',direction:'higher_is_more',range:{min:1,max:5},reportVersion:'1.0.0',originalReferenceVersion:`v${n}`,originalReferenceHash:referenceSetHash(references[n-1])})
  const first=await buildReportingFixture(db,1,false,undefined,undefined,{identity:identity(1),value:4/3})
  const manager=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:first.organizationId,userId:first.ownerId,orgRole:'ORG_ADMIN'}})
  await grantCapability({organizationId:first.organizationId,membershipId:manager.id,capability:'PSYCHOLOGY_STAFF',meta:{actorUserId:first.ownerId,commandKey:randomUUID()}})
  const resource=(await db.$queryRaw<Array<{key:string}>>`SELECT resource_key AS key FROM assessment_run_tracks WHERE id=${first.trackId}`)[0].key
  const second=await buildReportingFixture(db,1,false,{ownerId:first.ownerId,organizationId:first.organizationId,members:first.members,resourceKey:resource,at:new Date('2026-10-01')},undefined,{identity:identity(2),value:5/3})
  const actor={userId:first.ownerId,platformRole:'SYSTEM_ADMIN' as const},definition:ReportingIndividualLongitudinalSpecV1={schemaVersion:1,analysisKind:'INDIVIDUAL_LONGITUDINAL',engineKey:'ORG_INDIVIDUAL_LONGITUDINAL_V1',engineVersion:'1.0.0',privacyUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT',reportEvidenceCeiling:'PILOT',metricRules:[{metricId:'score',sourceMetricKey:'score',sourceFamily:'BUNDLE',sourceResourceKey:resource,valueType:'NUMBER',longitudinalMetricKey:'score',acceptedResultQuality:['interpretable'],acceptedMetricQuality:'IGNORE_METRIC_QUALITY',missingnessRule:'EXCLUDE',observationUnit:'SUBJECT',selectionPolicy:'UNIQUE_OR_REJECT'}],comparabilityRules:[]}
  const spec=await createPlatformReportingSpec({actor,specKey:randomUUID(),version:1,definition});await reviewPlatformReportingSpec({actor,specId:spec.id});await publishPlatformReportingSpec({actor,specId:spec.id})
  const input={principal:{userId:first.ownerId,platformRole:'STANDARD' as const},organizationId:first.organizationId,subjectUserId:first.members[0].userId,specId:spec.id,sources:[first,second].map(({runId,trackId})=>({runId,trackId}))}
  const report=await generateIndividualLongitudinal(input)
  expect(report.projection.referenceTrajectories!.metrics.score.selectedReferenceVersions).toEqual(['v2'])
  expect(report.projection.waves[0].metrics.score).toEqual({state:'present',value:1.33333333})
  const frozen=await readReportingArtifactRecord(report.artifactId)
  await activateReviewedReference(db,references[2])
  expect(await readReportingArtifactRecord(report.artifactId)).toEqual(frozen)
  expect((await generateIndividualLongitudinal(input)).artifactId).toBe(report.artifactId)
  const regenerated=await generateIndividualLongitudinal({...input,regenerateWithLatestReference:true})
  expect(regenerated.artifactId).not.toBe(report.artifactId)
  expect(regenerated.projection.referenceTrajectories!.metrics.score.selectedReferenceVersions).toEqual(['v3'])
 })
})
