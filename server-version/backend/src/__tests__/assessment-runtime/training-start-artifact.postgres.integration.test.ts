import {grantLibraryUseFixture} from '../fixtures/library-distribution'
import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {publishContentRelease} from '../../modules/measurement-content/repository'
import {scaleMeasurementRelease} from '../../modules/measurement-content/scale'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {submit,review} from '../../modules/scale-library-governance/service'
import {decodePublishedScaleArtifact,loadPublishedScaleArtifacts,buildPublishedScaleArtifact,appendPublishedScaleArtifact} from '../../modules/assessment-runtime/published-scale-artifact'
import {trainingContentSnapshotSchema} from '../../modules/composite/training-content-binding'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {backfillLegacyTrainingScaleArtifacts} from '../../modules/composite/training-legacy-scale-artifacts'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,admin:string,owner:string,project:string
const metadata={title:'合成治理量表',author:'Synthetic author',copyright:'Self authored redistribution explicitly permitted',applicability:'Synthetic research only',scoringDescription:'Mean',reportDescription:'Descriptive, no diagnosis'}
const definition={schemaVersion:1,presentationMode:'ALL_AT_ONCE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'one',label:'1',score:1},{optionKey:'two',label:'2',score:2}],dimensions:[{dimensionKey:'total',label:'总分',direction:'descriptive'}],items:[{itemKey:'item',prompt:'问题',required:true,reverse:false,dimensionKeys:['total']}]}
async function source(sourceReleaseId:string|null=null,relationship='ORIGINAL'){
 const localId=randomUUID(),compiled=compileResearchScale(metadata.title,definition)
 return db.$transaction(tx=>publishContentRelease(tx,scaleMeasurementRelease({localId,version:'v1',instrumentVersion:'1',definition:compiled,instrumentClass:'CUSTOM_DESCRIPTIVE',presentationMode:'ALL_AT_ONCE',
  scope:{kind:'PRIVATE',ownerId:owner,product:'SURVEY',resourceId:project},sourceReleaseId,
  provenance:{authoringRelationship:relationship,authoringSnapshot:{title:metadata.title,definition,instrumentClass:'CUSTOM_DESCRIPTIVE',product:'SURVEY'}}}),owner))
}
async function application(){const release=await source();const submission=await submit(owner,'SURVEY',{requestId:randomUUID(),releaseId:release.releaseId,metadata});return {release,submission}}
async function approved(){const state=await application();const result=await review(admin,state.submission.id,{expectedVersion:1,decision:'APPROVE',allowedProducts:['TRAINING','SURVEY'],reason:'Synthetic approval'});return {...state,entryId:result.entryId!}}
const row=async(hash:string)=>(await db.$queryRaw<any[]>`SELECT artifact_hash AS "artifactHash",format_version AS "formatVersion",plaintext_bytes AS "plaintextBytes",payload_encrypted AS "payloadEncrypted" FROM assessment_runtime_artifacts WHERE artifact_hash=${hash}`)[0]
suite('3b-2 START uses the published Scale artifact / real isolated PostgreSQL',()=>{
 let teacher:string,wrapperId:string,courseId:string,published:any,v2:any
 const service=async()=>import('../../modules/composite/composite.service')
 async function student(){
  const id=(await db.user.create({data:{username:'s3b2'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'STUDENT',accountDomain:'TRAINING'}})).id
  await db.courseStudent.create({data:{courseId,studentId:id,status:'APPROVED'}});return id
 }
 async function start(compositeId:string){
  const who=await student(),started=await (await service()).startUserAttempt(who,compositeId)
  const child=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:started.attempt.id}})
  const {loadFrozenScaleRuntimeSnapshot}=await import('../../modules/assessment-runtime/runtime-snapshot')
  return loadFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted,db as any) as any
 }
 /** A sibling publication of the same wrapper with a rewritten snapshot (v1 or tampered v2). */
 async function sibling(snapshotOf:(compositeId:string,itemId:string)=>any){
  const c=await db.compositeAssessment.create({data:{code:randomUUID(),name:'3b-2 sibling',createdBy:teacher,productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',status:'DRAFT',questionnaireCourses:{create:{courseId}}}})
  const svc=await service();await svc.addItem(teacher,'TEACHER',c.id,{type:'SCALE',scaleId:wrapperId,required:true});await svc.publishComposite(teacher,'TEACHER',c.id)
  const item=await db.compositeAssessmentItem.findFirstOrThrow({where:{compositeAssessmentId:c.id}})
  const snapshot=snapshotOf(c.id,item.id),hash=canonicalHash(snapshot)
  // Fixture only: simulate a pre-existing (legacy or tampered) publication, in one
  // transaction so the immutability guard is back before anything else runs.
  await db.$transaction([db.$executeRawUnsafe('ALTER TABLE composite_assessments DISABLE TRIGGER training_content_publication_guard'),
   db.$executeRaw`UPDATE composite_assessments SET training_content_snapshot=${JSON.stringify(snapshot)}::jsonb,training_content_snapshot_hash=${hash} WHERE id=${c.id}`,
   db.$executeRawUnsafe('ALTER TABLE composite_assessments ENABLE TRIGGER training_content_publication_guard')])
  return {id:c.id,itemId:item.id,hash}
 }
 const legacyOf=(compositeId:string,itemId:string)=>{const {artifact:_a,...unit}=v2.units[0];return {...v2,schemaVersion:1,compositeId,units:[{...unit,itemId}]}}
 const setInstruction=async(value:string|null)=>{await db.$executeRaw`UPDATE scales SET instruction=${value} WHERE id=${wrapperId}`}
 beforeAll(async()=>{
  process.env.DATA_ENCRYPTION_KEY='a'.repeat(64);process.env.DATA_PSEUDONYM_KEY='b'.repeat(64)
  requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  admin=(await db.user.create({data:{username:'b2admin'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})).id
  const u=await db.user.create({data:{username:'b2owner'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'STUDENT',accountDomain:'SURVEY'}})
  const login='b2'+randomUUID().replaceAll('-','').slice(0,20);await db.surveyAccount.create({data:{userId:u.id,loginName:login,normalizedLogin:login}})
  await db.surveyResearcherGrant.create({data:{userId:u.id,status:'ACTIVE',grantedBy:admin}})
  await db.surveyMfaCredential.create({data:{userId:u.id,enabled:true,secretCipher:'synthetic'}});owner=u.id
  project=randomUUID();await db.surveyProject.create({data:{id:project,ownerUserId:owner,title:'Synthetic 3b-2 project',collectionMode:'SINGLE_UNLINKED'}})
  const {entryId}=await approved()
  teacher=(await db.user.create({data:{username:'b2teacher'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'TEACHER',teacherApproved:true,accountDomain:'TRAINING'}})).id
  await grantLibraryUseFixture(db,admin,entryId,{requestId:randomUUID(),userId:teacher,product:'TRAINING'})
  wrapperId=(await db.scale.findUniqueOrThrow({where:{libraryEntryId:entryId}})).id
  courseId=(await db.course.create({data:{title:'Synthetic 3b-2 course',courseCode:randomUUID(),creatorId:teacher,status:'PUBLISHED'}})).id
  await setInstruction('published instruction')
  const draft=await db.compositeAssessment.create({data:{code:randomUUID(),name:'3b-2 questionnaire',createdBy:teacher,productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',status:'DRAFT',questionnaireCourses:{create:{courseId}}}})
  const svc=await service();await svc.addItem(teacher,'TEACHER',draft.id,{type:'SCALE',scaleId:wrapperId,required:true});await svc.publishComposite(teacher,'TEACHER',draft.id)
  published=await db.compositeAssessment.findUniqueOrThrow({where:{id:draft.id}})
  v2=trainingContentSnapshotSchema.parse(published.trainingContentSnapshot)
 },120000)
 afterAll(async()=>{if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}})
 it('v2 START freezes exactly the published artifact content, with live reference bindings',async()=>{
  const hash=v2.units[0].artifact.hash,artifact=(await loadPublishedScaleArtifacts(db,[hash])).get(hash)!
  const runtime=await start(published.id)
  expect(runtime.sourceDefinitionHash).toBe(artifact.sourceDefinitionHash)
  expect(runtime.compiledRuntime.compiledRuntimeHash).toBe(artifact.compiledRuntime.compiledRuntimeHash)
  expect(runtime.measurementPresentation).toEqual(artifact.measurementPresentation)
  expect(canonicalHash(runtime.instruction??null)).toBe(canonicalHash(artifact.instruction))
 })
 it('an edit after publish still delivers the published artifact (v2 and backfilled v1); un-backfilled v1 keeps the live path',async()=>{
  const legacyMapped=await sibling(legacyOf),legacyPlain=await sibling(legacyOf)
  expect((await backfillLegacyTrainingScaleArtifacts(db,{compositeIds:[legacyMapped.id]})).mapped).toBe(1)
  const before=await start(published.id)
  // Bypass the 3b-4 guard (when present) only for this counterexample.
  const guard=(await db.$queryRaw<any[]>`SELECT 1 FROM pg_trigger WHERE tgname='scale_published_reference_immutable'`).length>0
  if(guard)await db.$executeRawUnsafe('ALTER TABLE scales DISABLE TRIGGER scale_published_reference_immutable')
  try{
   await setInstruction('EDITED after publish')
   for(const id of [published.id,legacyMapped.id]){
    const after=await start(id)
    expect(canonicalHash(after.instruction??null)).toBe(canonicalHash(before.instruction??null))
    expect(after.compiledRuntime.compiledRuntimeHash).toBe(before.compiledRuntime.compiledRuntimeHash)
   }
   const live=await start(legacyPlain.id)
   expect(JSON.stringify(live.instruction)).toContain('EDITED after publish')
  }finally{await setInstruction('published instruction');if(guard)await db.$executeRawUnsafe('ALTER TABLE scales ENABLE TRIGGER scale_published_reference_immutable')}
 })
 it('a missing or mismatched artifact fails closed and never falls back to the live Scale',async()=>{
  const missing=await sibling((cid,itemId)=>({...v2,compositeId:cid,units:[{...v2.units[0],itemId,artifact:{formatVersion:3,hash:'f'.repeat(64)}}]}))
  await expect(start(missing.id)).rejects.toThrow(/BINDING_INVALID/)
  // A valid artifact of a different release is rejected by its hash-bound release.
  const other=buildPublishedScaleArtifact({instrumentKey:(await db.scale.findUniqueOrThrow({where:{id:wrapperId}})).code,instrumentVersion:'1',
   definition:(await loadPublishedScaleArtifacts(db,[v2.units[0].artifact.hash])).get(v2.units[0].artifact.hash)!.definition,instruction:null,
   release:{releaseId:randomUUID(),contentHash:'e'.repeat(64)}})
  const ref=await db.$transaction(tx=>appendPublishedScaleArtifact(tx as any,other))
  const swapped=await sibling((cid,itemId)=>({...v2,compositeId:cid,units:[{...v2.units[0],itemId,artifact:ref}]}))
  await expect(start(swapped.id)).rejects.toThrow(/BINDING_INVALID/)
  // A legacy map row whose release disagrees with the publication fails closed.
  const legacy=await sibling(legacyOf)
  await db.$executeRaw`INSERT INTO training_legacy_scale_artifacts(composite_assessment_id,publication_hash,item_id,artifact_hash,release_id,content_hash)
   VALUES (${legacy.id},${legacy.hash},${legacy.itemId},${ref.hash},${randomUUID()},${'e'.repeat(64)})`
  await expect(start(legacy.id)).rejects.toThrow(/BINDING_INVALID/)
 })
})
