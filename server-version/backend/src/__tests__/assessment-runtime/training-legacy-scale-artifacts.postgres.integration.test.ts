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
import {backfillLegacyTrainingScaleArtifacts,loadLegacyScaleArtifactMap} from '../../modules/composite/training-legacy-scale-artifacts'
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
suite('legacy v1 Training publication artifact map + backfill / real isolated PostgreSQL',()=>{
 let v2:any,teacherId:string,wrapperId:string
 async function legacy(mutate:(unit:any)=>any=u=>u,hashOverride?:string){
  const composite=await import('../../modules/composite/composite.service')
  const c=await db.compositeAssessment.create({data:{code:randomUUID(),name:'Legacy publication',createdBy:teacherId,productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',status:'DRAFT'}})
  await composite.addItem(teacherId,'TEACHER',c.id,{type:'SCALE',scaleId:wrapperId,required:true})
  const item=await db.compositeAssessmentItem.findFirstOrThrow({where:{compositeAssessmentId:c.id}})
  const {artifact:_drop,...unit}=v2.units[0]
  const snapshot={...v2,schemaVersion:1,compositeId:c.id,units:[mutate({...unit,itemId:item.id})]},hash=hashOverride??canonicalHash(snapshot)
  await db.$executeRaw`UPDATE composite_assessments SET training_content_snapshot=${JSON.stringify(snapshot)}::jsonb,training_content_snapshot_hash=${hash} WHERE id=${c.id}`
  return {id:c.id,hash,itemId:item.id,unit:snapshot.units[0]}
 }
 const mapRows=async(id:string)=>db.$queryRaw<any[]>`SELECT * FROM training_legacy_scale_artifacts WHERE composite_assessment_id=${id}`
 beforeAll(async()=>{
  process.env.DATA_ENCRYPTION_KEY='a'.repeat(64);process.env.DATA_PSEUDONYM_KEY='b'.repeat(64)
  requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  admin=(await db.user.create({data:{username:'artadmin'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})).id
  const u=await db.user.create({data:{username:'artowner'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'STUDENT',accountDomain:'SURVEY'}})
  const login='art'+randomUUID().replaceAll('-','').slice(0,20);await db.surveyAccount.create({data:{userId:u.id,loginName:login,normalizedLogin:login}})
  await db.surveyResearcherGrant.create({data:{userId:u.id,status:'ACTIVE',grantedBy:admin}})
  await db.surveyMfaCredential.create({data:{userId:u.id,enabled:true,secretCipher:'synthetic'}});owner=u.id
  project=randomUUID();await db.surveyProject.create({data:{id:project,ownerUserId:owner,title:'Synthetic artifact project',collectionMode:'SINGLE_UNLINKED'}})
  const composite=await import('../../modules/composite/composite.service')
  const {entryId}=await approved()
  const teacher=(await db.user.create({data:{username:'artteacher'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'TEACHER',teacherApproved:true,accountDomain:'TRAINING'}})).id
  const student=(await db.user.create({data:{username:'artstudent'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'STUDENT',accountDomain:'TRAINING'}})).id
  await grantLibraryUseFixture(db,admin,entryId,{requestId:randomUUID(),userId:teacher,product:'TRAINING'})
  const wrapper=await db.scale.findUniqueOrThrow({where:{libraryEntryId:entryId}})
  const course=await db.course.create({data:{title:'Synthetic artifact course',courseCode:randomUUID(),creatorId:teacher,status:'PUBLISHED'}})
  await db.courseStudent.create({data:{courseId:course.id,studentId:student,status:'APPROVED'}})
  const draft=await db.compositeAssessment.create({data:{code:randomUUID(),name:'Artifact questionnaire',createdBy:teacher,
    productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',status:'DRAFT',questionnaireCourses:{create:{courseId:course.id}}}})
  await composite.addItem(teacher,'TEACHER',draft.id,{type:'SCALE',scaleId:wrapper.id,required:true})
  await composite.publishComposite(teacher,'TEACHER',draft.id)
  teacherId=teacher;wrapperId=wrapper.id
  v2=trainingContentSnapshotSchema.parse((await db.compositeAssessment.findUniqueOrThrow({where:{id:draft.id}})).trainingContentSnapshot)
 })
 afterAll(async()=>{await db?.$disconnect()})
 it('maps a verified legacy unit to a format-3 artifact of its exact release, idempotently and without touching the publication',async()=>{
  const pub=await legacy()
  const first=await backfillLegacyTrainingScaleArtifacts(db,{compositeIds:[pub.id]})
  expect(first).toMatchObject({composites:1,mapped:1,alreadyMapped:0,skipped:[]})
  const map=await loadLegacyScaleArtifactMap(db,pub.id,pub.hash),entry=map.get(pub.itemId)!
  expect(entry).toMatchObject({releaseId:pub.unit.measurement.releaseId,contentHash:pub.unit.measurement.contentHash})
  const artifact=(await loadPublishedScaleArtifacts(db,[entry.artifact.hash])).get(entry.artifact.hash)!
  expect(artifact.release).toEqual({releaseId:pub.unit.measurement.releaseId,contentHash:pub.unit.measurement.contentHash})
  expect(entry.artifact.hash).toBe(v2.units[0].artifact.hash)
  const second=await backfillLegacyTrainingScaleArtifacts(db,{compositeIds:[pub.id]})
  expect(second).toMatchObject({mapped:0,alreadyMapped:1,skipped:[]})
  const stored=await db.compositeAssessment.findUniqueOrThrow({where:{id:pub.id}})
  expect(stored.trainingContentSnapshotHash).toBe(pub.hash);expect((stored.trainingContentSnapshot as any).schemaVersion).toBe(1)
  expect((await loadLegacyScaleArtifactMap(db,pub.id,'0'.repeat(64))).size).toBe(0)
 })
 it('skips and reports drift instead of fabricating a mapping',async()=>{
  const drift=await legacy(u=>({...u,measurement:{...u.measurement,contentHash:'d'.repeat(64)}}))
  const tampered=await legacy(u=>u,'c'.repeat(64))
  const report=await backfillLegacyTrainingScaleArtifacts(db,{compositeIds:[drift.id,tampered.id]})
  expect(report.mapped).toBe(0)
  expect(report.skipped).toEqual(expect.arrayContaining([{compositeId:drift.id,itemId:drift.itemId,reason:'RELEASE_MISMATCH'},{compositeId:tampered.id,reason:'SNAPSHOT_HASH_MISMATCH'}]))
  expect(await mapRows(drift.id)).toHaveLength(0);expect(await mapRows(tampered.id)).toHaveLength(0)
 })
 it('map rows are insert-only and must reference an existing artifact',async()=>{
  const pub=await legacy();await backfillLegacyTrainingScaleArtifacts(db,{compositeIds:[pub.id]})
  await expect(db.$executeRaw`UPDATE training_legacy_scale_artifacts SET release_id='x' WHERE composite_assessment_id=${pub.id}`).rejects.toThrow(/insert-only/)
  await expect(db.$executeRaw`DELETE FROM training_legacy_scale_artifacts WHERE composite_assessment_id=${pub.id}`).rejects.toThrow(/insert-only/)
  await expect(db.$executeRaw`INSERT INTO training_legacy_scale_artifacts(composite_assessment_id,publication_hash,item_id,artifact_hash,release_id,content_hash) VALUES (${pub.id},${'a'.repeat(64)},'i',${'e'.repeat(64)},'r','c')`).rejects.toThrow()
  expect(await mapRows(pub.id)).toHaveLength(1)
 })
 it('refuses to run in production',async()=>{
  const prev=process.env.NODE_ENV;process.env.NODE_ENV='production'
  try{await expect(backfillLegacyTrainingScaleArtifacts(db)).rejects.toThrow('NOT_FOR_PRODUCTION')}finally{process.env.NODE_ENV=prev}
 })
})
