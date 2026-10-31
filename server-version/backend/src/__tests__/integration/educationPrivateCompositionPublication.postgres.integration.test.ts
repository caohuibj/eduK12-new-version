import {randomUUID} from 'node:crypto'
import {Prisma,PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationLibraryRuntimeFixture} from './educationLibraryRuntimeFixture'
import * as tools from '../../modules/education-tools/private-tool.service'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'
import {readPrivateCompositionRunSources} from '../../modules/education-tools/private-tool.composition-source'
import {addTeacherPrivateCompositionRunTrack,previewTeacherRun,publishTeacherRun} from '../../modules/huiteacher/run.service'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient
async function fixture(){
 const f=await setupEducationLibraryRuntimeFixture({db,product:'TEACHER',trackCount:0,publish:false})
 const c:PrivateToolContext={entry:'TEACHER',organizationId:f.organizationId,principal:{userId:f.managerUserId,accountDomain:'SCHOOL'}}
 const freeze=async(kind:'SCALE'|'FORM'|'COMPOSITION',definition:unknown)=>{
  const draft=await tools.createPrivateTool(c,{kind,title:'Synthetic '+kind})
  const saved=await tools.updatePrivateTool(c,draft.id,{expectedRevision:1,title:draft.title,definition})
  return tools.freezePrivateTool(c,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
 }
 const scale=compileResearchScale('Synthetic',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',
  responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
  items:[{itemKey:'q',prompt:'Synthetic scale question',required:true,reverse:false,dimensionKeys:['total']}]})
 const hidden=await freeze('SCALE',scale)
 scale.report.audienceContract={schemaVersion:1,respondent:'ADULT_SELF',audience:'teacher',locale:'zh-CN'}
 const visible=await freeze('SCALE',scale),form=await freeze('FORM',{schemaVersion:2,pages:[{pageKey:'p',title:'Original form page',questions:[
  {itemKey:'comment',type:'SHORT_TEXT',prompt:'Comment',required:false,options:[],rows:[]},
 ]}]})
 const definition={schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'SELF'},instruction:'One real questionnaire',
  blocks:[visible,form,hidden].map(source=>({blockId:randomUUID(),instruction:'',source:{provider:'PRIVATE_VERSION',kind:source.kind,versionId:source.id,contentHash:source.contentHash}}))}
 const fixed=await freeze('COMPOSITION',definition)
 if(!('runtime' in fixed)||!fixed.runtime)throw new Error('missing composition runtime')
 const teacher={organizationId:f.organizationId,eventId:f.workflow.id,actorUserId:f.managerUserId}
 const body={expectedVersion:f.expectedVersion,privateComposition:{versionId:fixed.id,contentHash:fixed.contentHash},
  subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[f.subjectMembershipId]}}
 const attach=(raw:unknown=body)=>addTeacherPrivateCompositionRunTrack(teacher,raw)
 return {f,c,teacher,body,attach,fixed,runtime:fixed.runtime,definition,visible,hidden}
}
const parent=(id:string)=>db.compositeAssessment.findUniqueOrThrow({where:{id},include:{items:{orderBy:{position:'asc'}},formSections:{orderBy:{position:'asc'}}}})
const state=async(runId:string)=>(await db.$queryRaw<Array<{status:string;version:number;executions:bigint}>>`
 SELECT status,version,(SELECT count(*) FROM assessment_run_executions WHERE run_id=${runId}) AS executions FROM assessment_runs WHERE id=${runId}`)[0]
const policy=async(trackId:string)=>(await db.$queryRaw<Array<{frozen:unknown;hash:string|null}>>`
 SELECT frozen_resource_policy AS frozen,resource_policy_hash AS hash FROM assessment_run_tracks WHERE id=${trackId}`)[0]

suite('Private ordinary questionnaire / Teacher SELF real Run publication',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  process.env.DATA_ENCRYPTION_KEY||='55'.repeat(32);process.env.DATA_PSEUDONYM_KEY||='56'.repeat(32);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY||='57'.repeat(32)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
 })
 afterAll(async()=>{await db?.$disconnect()})
 it('attaches one fixed parent, previews without mutation, and atomically publishes one SELF execution with exact per-unit ceilings',async()=>{
  const x=await fixture(),before=await parent(x.runtime.compositeId)
  await expect(x.attach({...x.body,privateComposition:{...x.body.privateComposition,contentHash:'a'.repeat(64)}})).rejects.toMatchObject({code:'PRIVATE_COMPOSITION_SOURCE_NOT_FOUND',statusCode:404})
  expect(await state(x.f.runId)).toMatchObject({status:'DRAFT',version:x.body.expectedVersion,executions:0n})
  const track=await x.attach(),command={...x.teacher,expectedVersion:x.body.expectedVersion+1}
  await expect(x.attach()).rejects.toMatchObject({code:'RUN_VERSION_CONFLICT'})
  const preview=await previewTeacherRun(command)
  expect(preview.tracks).toHaveLength(1);expect(preview.tracks[0].resourcePolicy).not.toHaveProperty('educationComposition')
  expect(await parent(before.id)).toEqual(before)
  expect((await policy(track.id)).hash).toBeNull()
  // A participant's valid task membership is not authoring permission.
  await expect(readPrivateCompositionRunSources(db,{...x.c,principal:{userId:x.f.participantUserId,accountDomain:'SCHOOL'}},
   [{family:'BUNDLE',key:track.resourceKey,version:'1.0.0'}])).rejects.toThrow('AUTHOR_REQUIRED')
  await x.f.open()
  await publishTeacherRun(command)
  const published=await parent(before.id),frozen=await policy(track.id)
  expect(published.status).toBe('PUBLISHED');expect(published.publishedAt).not.toBeNull()
  expect(published.items).toEqual(before.items);expect(published.formSections).toEqual(before.formSections)
  expect(published.trainingContentSnapshotHash).toBe(before.trainingContentSnapshotHash)
  expect(await state(x.f.runId)).toMatchObject({status:'PUBLISHED',executions:1n})
  expect(await db.compositeAssessmentAttempt.count({where:{compositeAssessmentId:before.id}})).toBe(0)
  expect(await db.$queryRaw`SELECT id FROM registered_assessment_resources WHERE composite_id=${before.id}`).toEqual([])
  expect(frozen.hash).toBe(canonicalHash(frozen.frozen))
  expect(frozen.frozen).toMatchObject({family:'BUNDLE',runtimeLaunchTarget:{kind:'COMPOSITE',ref:before.id},educationComposition:{
   origin:x.runtime.origin,manifestHash:before.trainingContentSnapshotHash,unitReports:[
    {blockId:x.definition.blocks[0].blockId,versionId:x.visible.id,respondent:{mode:'INDIVIDUAL_SUMMARY',metricKeys:['total']}},
    {blockId:x.definition.blocks[2].blockId,versionId:x.hidden.id,respondent:{mode:'NONE',metricKeys:[]}},
   ]}})
  await expect(publishTeacherRun(command)).rejects.toThrow()
  expect(await state(x.f.runId)).toMatchObject({status:'PUBLISHED',executions:1n})
 },90_000)
 it('rolls back the real source publication, frozen policy and assigned executions on a post-source Run update failure',async()=>{
  const x=await fixture(),track=await x.attach(),before=await parent(x.runtime.compositeId),frozenBefore=await policy(track.id)
  await x.f.open()
  const name='test_composition_publish_'+randomUUID().replaceAll('-','')
  await db.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id=TG_ARGV[0] AND NEW.status='PUBLISHED' THEN IF NOT EXISTS (SELECT 1 FROM composite_assessments WHERE id=TG_ARGV[1] AND status='PUBLISHED') THEN RAISE EXCEPTION 'source publication not reached'; END IF; RAISE EXCEPTION 'synthetic composition publication failure'; END IF; RETURN NEW; END $$`)
  try{
   await db.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE UPDATE OF status ON assessment_runs FOR EACH ROW EXECUTE FUNCTION ${name}('${x.f.runId}','${before.id}')`)
   await expect(publishTeacherRun({...x.teacher,expectedVersion:x.body.expectedVersion+1})).rejects.toThrow('synthetic composition publication failure')
   expect(await parent(before.id)).toEqual(before)
   expect(await policy(track.id)).toEqual(frozenBefore)
   expect(await state(x.f.runId)).toMatchObject({status:'DRAFT',version:x.body.expectedVersion+1,executions:0n})
   expect(await db.$queryRaw`SELECT id FROM assessment_run_relationship_snapshots WHERE run_id=${x.f.runId}`).toEqual([])
  }finally{
   await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON assessment_runs`)
   await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${name}()`)
  }
 },90_000)
 it('denies foreign ownership, author revocation and stopped leaves, while metadata batches avoid reading source bodies',async()=>{
  const x=await fixture(),ref={family:'BUNDLE',key:x.runtime.resourceKey,version:'1.0.0'},before=await parent(x.runtime.compositeId)
  const measured=new PrismaClient({datasources:{db:{url:url!}},log:[{level:'query',emit:'event'}]}),queries:string[]=[]
  measured.$on('query',e=>queries.push(e.query))
  try{
   const started=performance.now(),cpu=process.cpuUsage(),rssBefore=process.memoryUsage().rss
   const result=await readPrivateCompositionRunSources(measured,x.c,[ref,ref])
   const cpuUsed=process.cpuUsage(cpu),metadata=queries.filter(q=>q.includes('AS leaves'))
   expect(result.size).toBe(1);expect(metadata).toHaveLength(1)
   expect(metadata[0]).not.toMatch(/SELECT\s+\*|s\.definition\s*(,|AS)|training_content_snapshot\s*(,|AS)|composite_assessment_items|composite_form_sections/i)
   console.log(JSON.stringify({evidence:'advisory ordinary questionnaire metadata, not task START or performance qualification',sqlStatements:queries.length,
    metadataQueries:metadata.length,responseBytes:Buffer.byteLength(JSON.stringify([...result.values()])),elapsedMs:performance.now()-started,
    nodeCpuMicros:cpuUsed.user+cpuUsed.system,rssBefore,rssAfter:process.memoryUsage().rss}))
  }finally{await measured.$disconnect()}
  await expect(readPrivateCompositionRunSources(db,{...x.c,entry:'SCHOOL'},[ref])).rejects.toThrow('RESOURCE_INVALID')
  const other=await setupEducationLibraryRuntimeFixture({db,product:'TEACHER',trackCount:0,publish:false})
  await expect(readPrivateCompositionRunSources(db,{entry:'TEACHER',organizationId:other.organizationId,principal:{userId:other.managerUserId,accountDomain:'SCHOOL'}},[ref])).rejects.toThrow('SOURCE_NOT_FOUND')
  const grant=await db.educationProductRoleGrant.findFirstOrThrow({where:{organizationId:x.c.organizationId,revokedAt:null,role:'PRODUCT_ADMIN'}})
  await db.$executeRaw`UPDATE education_product_role_grants SET revoked_at=clock_timestamp(),revoked_by_user_id=${x.f.managerUserId} WHERE id=${grant.id}`
  await expect(x.attach()).rejects.toThrow()
  await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:x.c.organizationId,membershipId:grant.membershipId,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:x.f.managerUserId}})
  const snapshot=before.trainingContentSnapshot as unknown as {units:Array<{measurement:{releaseId:string}}>}
  await db.scaleLibraryEmergencyStop.create({data:{targetKind:'RELEASE',targetId:snapshot.units[0].measurement.releaseId,actorId:x.f.libraryAdminUserId,reason:'Synthetic new-use stop'}})
  await expect(x.attach()).rejects.toThrow()
  expect(await state(x.f.runId)).toMatchObject({status:'DRAFT',version:x.body.expectedVersion,executions:0n})
  expect(await parent(before.id)).toEqual(before)
 },90_000)
})
