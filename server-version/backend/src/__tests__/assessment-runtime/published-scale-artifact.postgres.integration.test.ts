import {grantLibraryUseFixture} from '../fixtures/library-distribution'
import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {publishContentRelease} from '../../modules/measurement-content/repository'
import {scaleMeasurementRelease} from '../../modules/measurement-content/scale'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {submit,review} from '../../modules/scale-library-governance/service'
import {decodePublishedScaleArtifact,loadPublishedScaleArtifacts,buildPublishedScaleArtifact,appendPublishedScaleArtifact,publishedScaleArtifactHash} from '../../modules/assessment-runtime/published-scale-artifact'
import {gzipSync} from 'node:zlib'
import {canonicalJsonBytes} from '../../modules/assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {trainingContentSnapshotSchema,assertTrainingSnapshotArtifacts} from '../../modules/composite/training-content-binding'
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
suite('publish-time static Scale artifact (format 3) / real isolated PostgreSQL',()=>{
 let published:{compositeId:string;student:string;hash:string;snapshot:any}
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
  const stored=await db.compositeAssessment.findUniqueOrThrow({where:{id:draft.id}})
  const snapshot=trainingContentSnapshotSchema.parse(stored.trainingContentSnapshot)
  published={compositeId:draft.id,student,hash:snapshot.units[0].artifact!.hash,snapshot}
 })
 afterAll(async()=>{await db?.$disconnect()})
 it('publish writes a v2 snapshot whose Scale unit references a verified format-3 artifact of the exact release',async()=>{
  const {snapshot,hash}=published
  expect(snapshot.schemaVersion).toBe(2);expect(snapshot.units).toHaveLength(1)
  expect(snapshot.units[0].artifact).toEqual({formatVersion:3,hash})
  expect(()=>assertTrainingSnapshotArtifacts(snapshot)).not.toThrow()
  const stored=await row(hash);expect(stored.formatVersion).toBe(3)
  const artifact=decodePublishedScaleArtifact(stored,hash)
  expect(artifact.release).toEqual({releaseId:snapshot.units[0].measurement.releaseId,contentHash:snapshot.units[0].measurement.contentHash})
  expect(artifact.measurementPresentation?.presentationMode).toBe('ALL_AT_ONCE')
  expect(JSON.stringify(artifact)).not.toMatch(/referenceBindings|frozenAt|allowNewStarts|deployment/)
 })
 it('START on a v2 publication still succeeds through the unchanged path',async()=>{
  const composite=await import('../../modules/composite/composite.service')
  const started=await composite.startUserAttempt(published.student,published.compositeId)
  expect(started.attempt.currentItem).toMatchObject({type:'SCALE',presentationMode:'ALL_AT_ONCE'})
 })
 it('format-3 rows are immutable and undeletable',async()=>{
  await expect(db.$executeRaw`UPDATE assessment_runtime_artifacts SET plaintext_bytes=plaintext_bytes WHERE artifact_hash=${published.hash}`).rejects.toThrow()
  await expect(db.$executeRaw`DELETE FROM assessment_runtime_artifacts WHERE artifact_hash=${published.hash}`).rejects.toThrow()
  await expect(db.$executeRaw`INSERT INTO assessment_runtime_artifacts(artifact_hash,format_version,plaintext_bytes,payload_encrypted) VALUES (${'f'.repeat(64)},4,1,'x')`).rejects.toThrow()
 })
 it('tampered, mislabeled or missing artifacts fail closed',async()=>{
  const stored=await row(published.hash)
  expect(()=>decodePublishedScaleArtifact({...stored,payloadEncrypted:stored.payloadEncrypted.slice(0,-4)+'AAAA'},published.hash)).toThrow()
  expect(()=>decodePublishedScaleArtifact({...stored,formatVersion:1},published.hash)).toThrow()
  expect(()=>decodePublishedScaleArtifact(stored,'0'.repeat(64))).toThrow()
  await expect(loadPublishedScaleArtifacts(db,['e'.repeat(64)])).rejects.toThrow('missing')
  expect((await loadPublishedScaleArtifacts(db,[published.hash])).get(published.hash)?.release.releaseId).toBe(published.snapshot.units[0].measurement.releaseId)
 })
 it('an artifact appended in a rolled-back publish transaction does not persist',async()=>{
  const artifact=decodePublishedScaleArtifact(await row(published.hash),published.hash)
  const built=buildPublishedScaleArtifact({instrumentKey:artifact.instrumentKey+'-rb',instrumentVersion:artifact.instrumentVersion,definition:artifact.definition,
    instruction:artifact.instruction,release:artifact.release})
  await expect(db.$transaction(async tx=>{await appendPublishedScaleArtifact(tx,built);throw new Error('rollback')})).rejects.toThrow('rollback')
  expect(await row(built.hash)).toBeUndefined()
 })
 it('an untampered artifact compiled by an older/newer compiler still decodes as stored; only publish re-checks compilation',async()=>{
  const artifact=decodePublishedScaleArtifact(await row(published.hash),published.hash)
  // Simulate a compiler change: same definition, a different compiledRuntime.
  const other={...artifact,instrumentKey:artifact.instrumentKey+'-cc',compiledRuntime:{...artifact.compiledRuntime,compilerGeneration:'other'}}
  const bytes=canonicalJsonBytes(other),hash=publishedScaleArtifactHash(other)
  const record={artifactHash:hash,formatVersion:3,plaintextBytes:bytes.length,payloadEncrypted:encryptUnifiedRuntimePayload({kind:'SCALE_PUBLISHED_STATIC',storageVersion:3,
    artifactHash:hash,codec:'gzip-json-v1',plaintextBytes:bytes.length,data:gzipSync(bytes).toString('base64')})}
  const decoded=decodePublishedScaleArtifact(record,hash)
  expect(decoded.compiledRuntime).toEqual(other.compiledRuntime)
  expect(()=>decodePublishedScaleArtifact(record,published.hash)).toThrow()
  await expect(db.$transaction(async tx=>appendPublishedScaleArtifact(tx,{artifact:other as any,hash,record}))).rejects.toThrow('compile mismatch')
  expect(await row(hash)).toBeUndefined()
 })
 it('the v2 completeness rule rejects a missing or stray artifact reference',()=>{
  const {snapshot}=published,unit=snapshot.units[0]
  expect(()=>assertTrainingSnapshotArtifacts({...snapshot,units:[{...unit,artifact:undefined}]})).toThrow()
  expect(()=>assertTrainingSnapshotArtifacts({...snapshot,schemaVersion:1})).toThrow()
 })
})
