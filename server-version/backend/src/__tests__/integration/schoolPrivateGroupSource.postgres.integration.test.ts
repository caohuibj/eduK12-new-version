import {randomUUID} from 'node:crypto'
import {Prisma,PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,it,expect} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupSchoolCompositionDraft} from './educationPrivateCompositionExecutionFixture'
import * as tools from '../../modules/education-tools/private-tool.service'
import {preparePrivateScaleRuntimeResource} from '../../modules/education-tools/private-tool.runtime-resources'
import {addPrivateCompositionRunTrack} from '../../modules/education-tools/private-tool.run-adapter'
import {readPrivateCompositionRunSources} from '../../modules/education-tools/private-tool.composition-source'
import {privateScaleRegistryIdentitySql} from '../../modules/assessment-run/educationPrivateScaleIdentitySql'
import {readFrozenCompositionIdentity} from '../../modules/assessment-run/educationCompositionExecution'
import {resolveSchoolPrivateGroupHistory} from '../../modules/education-tools/school-private-group-history'
import {isSelfGroupV2Entry} from '../../modules/assessment-policy/self-group-contract'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import type {RunResourcePolicy} from '../../modules/assessment-run/resourceAuthority'

const url=integrationDatabaseUrl('SCHOOL_GROUP_SOURCE_DATABASE_URL'),suite=url?describe:describe.skip
suite('School explicit group source / real publication only, not FINAL or group generation',()=>{
 let db:PrismaClient
 beforeAll(async()=>{requireIsolatedReleaseDatabase(url!)
  process.env.DATA_ENCRYPTION_KEY||='55'.repeat(32);process.env.DATA_PSEUDONYM_KEY||='56'.repeat(32);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY||='57'.repeat(32)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()})
 afterAll(async()=>{await db?.$disconnect()})
 it('keeps legacy private rights, publishes a new configured questionnaire and verifies actual frozen execution identity',async()=>{
  const f=await setupSchoolCompositionDraft(db),audiences={PROFESSIONAL:['total'],TEACHER:[],ORGANIZATION:['total']}
  const privateScale={versionId:f.visible.id,contentHash:f.visible.contentHash,administration:{population:'STUDENT',responseMode:'SELF'}}
  const original=await db.$transaction(tx=>preparePrivateScaleRuntimeResource(tx,f.context,privateScale),{isolationLevel:'ReadCommitted'})
  const groupReporting={schemaVersion:1,minimumRespondents:10,leaves:[{versionId:f.visible.id,contentHash:f.visible.contentHash,audiences}]}
  const grouped=await db.$transaction(tx=>preparePrivateScaleRuntimeResource(tx,f.context,{...privateScale,groupReporting}),{isolationLevel:'ReadCommitted'})
  expect(original.resourceEntry.resultDisclosure!.audiences.ORGANIZATION.mode).toBe('NONE')
  expect(grouped.origin.adapterVersion).toBe('2.0.0');expect(isSelfGroupV2Entry(grouped.resourceEntry)).toBe(true)
  expect(grouped.origin.releaseId).toBe(original.origin.releaseId)
  expect(grouped.resourceEntry.resultDisclosure!.audiences.RESPONDENT).toEqual(original.resourceEntry.resultDisclosure!.audiences.RESPONDENT)
  const catalog=await tools.listPrivateScaleRuntimeCandidates(f.context)
  expect(catalog.list.find(row=>row.versionId===f.visible.id)).toHaveProperty('groupChoice')
  const rows=await db.$queryRaw<Array<{valid:boolean}>>(Prisma.sql`SELECT ${privateScaleRegistryIdentitySql({registered:Prisma.sql`r`,organizationId:Prisma.sql`${f.organizationId}`,product:'SCHOOL'})} AS valid
   FROM registered_assessment_resources r WHERE r.resource_key=${grouped.resourceEntry.applicability.resourceKey}`)
  expect(rows).toEqual([{valid:true}])
  await expect(db.$executeRaw`UPDATE registered_assessment_resources SET entry=entry WHERE resource_key=${original.resourceEntry.applicability.resourceKey}`).rejects.toThrow('PRIVATE_SCALE_REGISTERED_IDENTITY_IMMUTABLE')
  const configured={...f.definition,groupReporting:{...groupReporting,leaves:[{...groupReporting.leaves[0],blockId:f.definition.blocks[0].blockId}]}}
  const draft=await tools.createPrivateTool(f.context,{kind:'COMPOSITION',title:'Synthetic explicit School GROUP'})
  const saved=await tools.updatePrivateTool(f.context,draft.id,{expectedRevision:1,title:draft.title,definition:configured})
  const fixed=await tools.freezePrivateTool(f.context,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
  if(!('runtime' in fixed)||!fixed.runtime)throw new Error('Expected actual DB-sealed runtime')
  const track=await addPrivateCompositionRunTrack({organizationId:f.organizationId,runId:f.runId,actorUserId:f.managerUserId,
   parent:{kind:'SCHOOL_ACTIVITY',id:f.workflow.id}},{...f.body,privateComposition:{versionId:fixed.id,contentHash:fixed.contentHash}})
  await f.open();await f.publish()
  const [published]=await db.$queryRaw<Array<{key:string;version:string;policy:RunResourcePolicy;policyHash:string}>>`
   SELECT resource_key AS key,resource_version AS version,frozen_resource_policy AS policy,resource_policy_hash AS "policyHash"
   FROM assessment_run_tracks WHERE run_id=${f.runId} AND id=${track.id}`
  expect(published.policy.analysisMode).toBe('COHORT_AGGREGATE')
  const identity=await db.$transaction(tx=>readFrozenCompositionIdentity(tx,{...published,organizationId:f.organizationId}))
  expect(identity.binding.unitReports.find(unit=>unit.blockId===configured.blocks[0].blockId)?.groupDisclosure?.audiences.TEACHER.mode).toBe('NONE')
  expect(identity.binding.unitReports.find(unit=>unit.blockId===configured.blocks[2].blockId)?.groupDisclosure).toBeUndefined()
  const source=(await db.$transaction(tx=>readPrivateCompositionRunSources(tx,f.context,[{family:'BUNDLE',key:published.key,version:published.version}]))).get(published.key)!
  const historical=await db.$transaction(tx=>resolveSchoolPrivateGroupHistory(tx,{resourceKind:'BUNDLE',resourceKey:published.key,
   resourceVersion:published.version,entryHash:canonicalHash(source.resourceEntry)}))
  expect(historical&&isSelfGroupV2Entry(historical)).toBe(true)
  await expect(db.$transaction(tx=>readFrozenCompositionIdentity(tx,{...published,organizationId:randomUUID()}))).rejects.toThrow('PRIVATE_COMPOSITION_EXECUTION_INVALID')
  console.info(JSON.stringify({kind:'synthetic-publication-checkpoint',organizationId:f.organizationId,runId:f.runId,trackId:track.id,
   fixedVersionId:fixed.id,participantUserId:f.participantUserId,publicationOnly:true,canonicalFinalInserted:false,groupReportGenerated:false}))
 },120000)
})
