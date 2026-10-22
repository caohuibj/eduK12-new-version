import {educationLibraryRuntimeContext} from '../../modules/scale-library-governance/education-runtime-context'
import {readEducationLibraryExistingWrapperIdentity} from '../../modules/scale-library-governance/education-runtime-source'
import {readEducationLibraryUse} from '../../modules/scale-library-governance/education-use'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import {catalogSnapshotsForDrafts} from '../../modules/survey/catalog.service'
import {canUseScale,createGrant} from '../../services/materialGrant'
import {canReadLibraryScale} from '../../modules/scale-library-governance/readers'
import {readPublishedScaleMeasurementSource} from '../../modules/scale/measurement-source'
import {randomUUID} from 'node:crypto'
import {Prisma,PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {publishContentRelease} from '../../modules/measurement-content/repository'
import {scaleMeasurementRelease} from '../../modules/measurement-content/scale'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {submit,review,withdraw,changeEntryStatus,stopCollection,readSubmission,listEntries} from '../../modules/scale-library-governance/service'
import {grantUse,revokeUse} from '../../modules/scale-library-governance/distribution'
import {assertLibraryUseGrantCurrent} from '../../modules/scale-library-governance/usage'
import {assertScaleLibraryCollectionAllowed} from '../../modules/scale-library-governance/collection-guard'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,admin:string,owner:string,reader:string,project:string
const metadata={title:'合成治理量表',author:'Synthetic author',copyright:'Self authored redistribution explicitly permitted',applicability:'Synthetic research only',scoringDescription:'Mean',reportDescription:'Descriptive, no diagnosis'}
const definition={schemaVersion:1,presentationMode:'ALL_AT_ONCE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'one',label:'1',score:1},{optionKey:'two',label:'2',score:2}],dimensions:[{dimensionKey:'total',label:'总分',direction:'descriptive'}],items:[{itemKey:'item',prompt:'问题',required:true,reverse:false,dimensionKeys:['total']}]}
async function source(sourceReleaseId:string|null=null,relationship='ORIGINAL'){
 const localId=randomUUID(),compiled=compileResearchScale(metadata.title,definition)
 return db.$transaction(tx=>publishContentRelease(tx,scaleMeasurementRelease({localId,version:'v1',instrumentVersion:'1',definition:compiled,instrumentClass:'CUSTOM_DESCRIPTIVE',presentationMode:'ALL_AT_ONCE',
  scope:{kind:'PRIVATE',ownerId:owner,product:'SURVEY',resourceId:project},sourceReleaseId,
  provenance:{authoringRelationship:relationship,authoringSnapshot:{title:metadata.title,definition,instrumentClass:'CUSTOM_DESCRIPTIVE',product:'SURVEY'}}}),owner))
}
async function application(){const release=await source();const submission=await submit(owner,'SURVEY',{requestId:randomUUID(),releaseId:release.releaseId,metadata});return {release,submission}}
async function approved(){const state=await application();const result=await review(admin,state.submission.id,{expectedVersion:1,decision:'APPROVE',reason:'Synthetic approval'});return {...state,entryId:result.entryId!}}
suite('Scale library governance / real isolated PostgreSQL',()=>{
 beforeAll(async()=>{
  process.env.DATA_ENCRYPTION_KEY='a'.repeat(64);process.env.DATA_PSEUDONYM_KEY='b'.repeat(64)
  requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  admin=(await db.user.create({data:{username:'libadmin'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})).id
  for(const who of ['owner','reader']){const u=await db.user.create({data:{username:'lib'+who+randomUUID().slice(0,8),passwordHash:'synthetic',role:'STUDENT',accountDomain:'SURVEY'}})
   const login='lib'+randomUUID().replaceAll('-','').slice(0,20);await db.surveyAccount.create({data:{userId:u.id,loginName:login,normalizedLogin:login}})
   await db.surveyResearcherGrant.create({data:{userId:u.id,status:'ACTIVE',grantedBy:admin}})
   await db.surveyMfaCredential.create({data:{userId:u.id,enabled:true,secretCipher:'synthetic'}})
   if(who==='owner')owner=u.id;else reader=u.id}
  project=randomUUID();await db.surveyProject.create({data:{id:project,ownerUserId:owner,title:'Synthetic library project',collectionMode:'SINGLE_UNLINKED'}})
 })
 afterAll(async()=>{await db?.$disconnect()})
 it('freezes application metadata, denies foreign review and keeps exact source release',async()=>{
  const {release,submission}=await application()
  await expect(review(reader,submission.id,{expectedVersion:1,decision:'APPROVE',reason:'Not authorized'})).rejects.toThrow()
  await expect(db.$executeRaw(Prisma.sql`UPDATE scale_library_submissions SET metadata='{}'::jsonb WHERE id=${submission.id}`)).rejects.toThrow()
  await expect(readSubmission(reader,submission.id)).rejects.toThrow()
  const detail=await readSubmission(owner,submission.id)
  expect(detail.release.releaseId).toBe(release.releaseId)
  expect(detail.snapshot.compiledDefinition.scoring).toEqual(compileResearchScale(metadata.title,definition).scoring)
  const result=await review(admin,submission.id,{expectedVersion:1,decision:'APPROVE',reason:'Exact snapshot approved'})
  const [entry]=await db.$queryRaw<Array<{release_id:string}>>(Prisma.sql`SELECT release_id FROM scale_library_entries WHERE id=${result.entryId}`)
  expect(entry.release_id).toBe(release.releaseId)
  const catalog=await listEntries(reader)
  expect(catalog.list.some(e=>e.id===result.entryId)).toBe(true)
  expect(JSON.stringify(catalog)).not.toContain('compiledDefinition')
 })
 it('serializes author withdrawal against approval without a half-approved entry',async()=>{
  const {submission}=await application()
  const results=await Promise.allSettled([review(admin,submission.id,{expectedVersion:1,decision:'APPROVE',reason:'Race approval'}),withdraw(owner,submission.id,{expectedVersion:1,reason:'Race withdraw'})])
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1)
  const [row]=await db.$queryRaw<Array<{status:string;entries:bigint}>>(Prisma.sql`SELECT s.status,(SELECT count(*) FROM scale_library_entries e WHERE e.submission_id=s.id) AS entries FROM scale_library_submissions s WHERE s.id=${submission.id}`)
  expect(Number(row.entries)).toBe(row.status==='APPROVED'?1:0)
 })
 it('requires the recipient target-entry identity and ordinary withdrawal preserves frozen collection',async()=>{
  const {entryId,release}=await approved()
  // This SURVEY-only account is not a Training recipient; source origin is not restricted.
  await expect(grantUse(admin,entryId,{requestId:randomUUID(),userId:reader,product:'TRAINING'})).rejects.toThrow()
  const grant=await grantUse(admin,entryId,{requestId:randomUUID(),userId:reader,product:'SURVEY'})
  await db.$transaction(tx=>assertLibraryUseGrantCurrent(tx,{entryId,userId:reader,product:'SURVEY'}))
  await changeEntryStatus(admin,entryId,{expectedVersion:1,status:'WITHDRAWN',reason:'Future use only'})
  await expect(db.$transaction(tx=>assertLibraryUseGrantCurrent(tx,{entryId,userId:reader,product:'SURVEY'}))).rejects.toThrow()
  await db.$transaction(tx=>assertScaleLibraryCollectionAllowed(tx,[release.releaseId]))
  await revokeUse(admin,grant.id,{expectedVersion:1,reason:'Withdraw explicit use'})
  const [tool]=await db.$queryRaw<Array<{status:string}>>(Prisma.sql`SELECT t.status FROM survey_tool_grants t JOIN scale_library_use_grants g ON g.survey_tool_grant_id=t.id WHERE g.id=${grant.id}`)
  expect(tool.status).toBe('REVOKED')
 })
 it('materializes one immutable platform wrapper, never inherits author or entry-admin privileges',async()=>{
  const {entryId,release}=await approved()
  const teacher=(await db.user.create({data:{username:'libteacher'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'TEACHER',teacherApproved:true,accountDomain:'TRAINING'}})).id
  const entryAdmin=(await db.user.create({data:{username:'libentry'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'ADMIN',accountDomain:'LEGACY'}})).id
  const use=await grantUse(admin,entryId,{requestId:randomUUID(),userId:teacher,product:'TRAINING'})
  const wrapper=await db.scale.findUniqueOrThrow({where:{libraryEntryId:entryId}})
  expect(wrapper.measurementReleaseId).toBe(release.releaseId)
  expect(wrapper.definition).toEqual(compileResearchScale(metadata.title,definition))
  expect(await canUseScale(owner,'TEACHER',wrapper,db)).toBe(false)
  expect(await canUseScale(teacher,'TEACHER',wrapper,db)).toBe(true)
  expect(await canReadLibraryScale(entryAdmin,entryId)).toBe(false)
  await expect(createGrant({teacherId:teacher,resourceType:'SCALE',resourceId:wrapper.id,grantedBy:entryAdmin})).rejects.toThrow()
  await expect(db.scale.update({where:{id:wrapper.id},data:{definition:{changed:true}}})).rejects.toThrow()
  await db.user.update({where:{id:owner},data:{isFrozen:true}})
  try{const resolved=await db.$transaction(tx=>readPublishedScaleMeasurementSource(tx,wrapper));expect(resolved.release.releaseId).toBe(release.releaseId)
    expect(await canUseScale(teacher,'TEACHER',wrapper,db)).toBe(true)}finally{await db.user.update({where:{id:owner},data:{isFrozen:false}})}
  await revokeUse(admin,use.id,{expectedVersion:1,reason:'Synthetic revoke'})
  expect(await canUseScale(teacher,'TEACHER',wrapper,db)).toBe(false)
  await db.$transaction(tx=>assertScaleLibraryCollectionAllowed(tx,[],[wrapper.id]))
 })
 it('an approved Training version survives original private archival and author suspension in both target entries',async()=>{
  const author=(await db.user.create({data:{username:'liboriginal'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'TEACHER',teacherApproved:true,accountDomain:'TRAINING'}})).id
  const teacher=(await db.user.create({data:{username:'librecipient'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'TEACHER',teacherApproved:true,accountDomain:'TRAINING'}})).id
  const id=randomUUID(),compiled=compileResearchScale(metadata.title,definition)
  const release=await db.$transaction(tx=>publishContentRelease(tx,scaleMeasurementRelease({localId:id,version:'v1',instrumentVersion:'1',definition:compiled,instrumentClass:'CUSTOM_DESCRIPTIVE',scope:{kind:'PRIVATE',ownerId:author,product:'TRAINING',resourceId:id},provenance:{authoringRelationship:'ORIGINAL',authoringSnapshot:{title:metadata.title,definition:compiled,instrumentClass:'CUSTOM_DESCRIPTIVE',product:'TRAINING'}}}),author))
  await db.scale.create({data:{id,code:'original:'+id,name:metadata.title,creatorId:author,status:'PUBLISHED',visibility:'HIDDEN',instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:'1',definition:compiled as unknown as Prisma.InputJsonValue,definitionHash:hashScaleDefinition(compiled),measurementReleaseId:release.releaseId}})
  const application=await submit(author,'TRAINING',{requestId:randomUUID(),releaseId:release.releaseId,metadata})
  const approval=await review(admin,application.id,{expectedVersion:1,decision:'APPROVE',reason:'Synthetic source independence'})
  const entryId=approval.entryId!
  await db.scale.update({where:{id},data:{status:'ARCHIVED'}})
  await db.user.update({where:{id:author},data:{isFrozen:true}})
  await grantUse(admin,entryId,{requestId:randomUUID(),userId:teacher,product:'TRAINING'})
  const survey=await grantUse(admin,entryId,{requestId:randomUUID(),userId:reader,product:'SURVEY'})
  const wrapper=await db.scale.findUniqueOrThrow({where:{libraryEntryId:entryId}})
  expect(await canUseScale(author,'TEACHER',wrapper,db)).toBe(false)
  expect(await canUseScale(teacher,'TEACHER',wrapper,db)).toBe(true)
  const resolved=await db.$transaction(tx=>readPublishedScaleMeasurementSource(tx,wrapper))
  expect(resolved.definition).toEqual(compiled)
  const [tool]=await db.$queryRaw<Array<{survey_tool_grant_id:string}>>(Prisma.sql`SELECT survey_tool_grant_id FROM scale_library_use_grants WHERE id=${survey.id}`)
  const snapshots=await db.$transaction(tx=>catalogSnapshotsForDrafts(tx,reader,[tool.survey_tool_grant_id]))
  expect(snapshots.get(tool.survey_tool_grant_id)?.compiledDefinition).toEqual(compiled)
 })
 it('keeps approved Survey ALL_AT_ONCE through the real Training parent publication/start/restore chain',async()=>{
  const composite=await import('../../modules/composite/composite.service')
  const whole=await import('../../modules/composite/whole-questionnaire.service')
  const {entryId}=await approved()
  const teacher=(await db.user.create({data:{username:'protocolteacher'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'TEACHER',teacherApproved:true,accountDomain:'TRAINING'}})).id
  const student=(await db.user.create({data:{username:'protocolstudent'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'STUDENT',accountDomain:'TRAINING'}})).id
  const use=await grantUse(admin,entryId,{requestId:randomUUID(),userId:teacher,product:'TRAINING'})
  const wrapper=await db.scale.findUniqueOrThrow({where:{libraryEntryId:entryId}})
  const course=await db.course.create({data:{title:'Synthetic protocol course',courseCode:randomUUID(),creatorId:teacher,status:'PUBLISHED'}})
  await db.courseStudent.create({data:{courseId:course.id,studentId:student,status:'APPROVED'}})
  const draft=await db.compositeAssessment.create({data:{code:randomUUID(),name:'Shared protocol questionnaire',createdBy:teacher,
    productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',status:'DRAFT',questionnaireCourses:{create:{courseId:course.id}}}})
  await composite.addItem(teacher,'TEACHER',draft.id,{type:'SCALE',scaleId:wrapper.id,required:true})
  await composite.publishComposite(teacher,'TEACHER',draft.id)
  const oldWhole=process.env.ASSESSMENT_WHOLE_SUBMIT_ENABLED,oldAsync=process.env.ASSESSMENT_REPORT_ASYNC_ENABLED
  process.env.ASSESSMENT_WHOLE_SUBMIT_ENABLED='true';process.env.ASSESSMENT_REPORT_ASYNC_ENABLED='true'
  try{
    const started=await composite.startUserAttempt(student,draft.id)
    expect(started.attempt.currentItem).toMatchObject({type:'SCALE',presentationMode:'ALL_AT_ONCE'})
    const frozen=await whole.getWholeQuestionnaireDefinition(started.attempt.id,{userId:student})
    expect(frozen.units).toHaveLength(1);expect(frozen.units[0].presentationMode).toBe('ALL_AT_ONCE')
    await revokeUse(admin,use.id,{expectedVersion:1,reason:'Synthetic ordinary withdrawal after frozen publication'})
    const restored=await composite.getAttemptState(started.attempt.id,{userId:student})
    expect(restored.currentItem).toMatchObject({type:'SCALE',presentationMode:'ALL_AT_ONCE'})
  }finally{
    if(oldWhole===undefined)delete process.env.ASSESSMENT_WHOLE_SUBMIT_ENABLED;else process.env.ASSESSMENT_WHOLE_SUBMIT_ENABLED=oldWhole
    if(oldAsync===undefined)delete process.env.ASSESSMENT_REPORT_ASYNC_ENABLED;else process.env.ASSESSMENT_REPORT_ASYNC_ENABLED=oldAsync
  }
 })
 it('entry admin is a distributor only within the exact explicit parent grant; revocation stops new use',async()=>{
  const {entryId,release}=await approved()
  const delegate=(await db.user.create({data:{username:'libdelegate'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'ADMIN',accountDomain:'LEGACY'}})).id
  await db.adminEntryGrant.create({data:{id:randomUUID(),userId:delegate,entry:'SURVEY',grantedBy:admin}})
  await expect(grantUse(delegate,entryId,{requestId:randomUUID(),userId:reader,product:'SURVEY'})).rejects.toThrow()
  const parentId=randomUUID()
  await db.contentCapabilityGrant.create({data:{id:parentId,subjectId:delegate,issuerId:admin,product:'SURVEY',scopeKind:'PLATFORM',scopeId:'scale-library-governance',resourceKind:'material',resourceKeys:[release.releaseId],capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60000),expiresAt:new Date(Date.now()+60000),ancestry:[parentId]}})
  await grantUse(delegate,entryId,{requestId:randomUUID(),userId:reader,product:'SURVEY',grantId:parentId})
  await expect(review(delegate,(await application()).submission.id,{expectedVersion:1,decision:'APPROVE',reason:'Distribution is not review',grantId:parentId})).rejects.toThrow()
  await db.$transaction(tx=>assertLibraryUseGrantCurrent(tx,{entryId,userId:reader,product:'SURVEY'}))
  await db.contentCapabilityGrant.update({where:{id:parentId},data:{revokedAt:new Date(),revokedBy:admin,revokeReason:'Synthetic parent withdrawal',version:{increment:1}}})
  await expect(db.$transaction(tx=>assertLibraryUseGrantCurrent(tx,{entryId,userId:reader,product:'SURVEY'}))).rejects.toThrow()
  await db.$transaction(tx=>assertScaleLibraryCollectionAllowed(tx,[release.releaseId]))
 })
 it('exact emergency stops reject collection but do not cascade across independent native revisions',async()=>{
  const v1=await source(),v2=await source(v1.releaseId,'REVISION'),dependent=await source(v1.releaseId,'LICENSED_USE')
  await db.$transaction(tx=>stopCollection(tx,admin,'RELEASE',v1.releaseId,'Synthetic exact stop'))
  await expect(db.$transaction(tx=>assertScaleLibraryCollectionAllowed(tx,[v1.releaseId]))).rejects.toThrow()
  await db.$transaction(tx=>assertScaleLibraryCollectionAllowed(tx,[v2.releaseId]))
  await expect(db.$transaction(tx=>assertScaleLibraryCollectionAllowed(tx,[dependent.releaseId]))).rejects.toThrow()
  const rows=await db.$queryRaw<Array<{id:string;status:string}>>(Prisma.sql`SELECT id,status FROM measurement_content_releases WHERE id=ANY(${[v1.releaseId,v2.releaseId]}::text[])`)
  expect(rows.every(r=>r.status==='PUBLISHED')).toBe(true)
 })
 it('real FINAL commits before stop retain results and allow only exact replay; new wrapper starts are denied',async()=>{
  const {submitScaleAssessmentFinal}=await import('../../modules/scale/scale-final-submit.service')
  const {startStandaloneScaleAssessment}=await import('../../modules/scale/scale-start.controller')
  const {entryId,release}=await approved()
  const teacher=(await db.user.create({data:{username:'finalteacher'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'TEACHER',teacherApproved:true,accountDomain:'TRAINING'}})).id
  const student=(await db.user.create({data:{username:'finalstudent'+randomUUID().slice(0,8),passwordHash:'synthetic',accountDomain:'TRAINING'}})).id
  await grantUse(admin,entryId,{requestId:randomUUID(),userId:teacher,product:'TRAINING'})
  const wrapper=await db.scale.findUniqueOrThrow({where:{libraryEntryId:entryId}})
  const compiled=compileResearchScale(metadata.title,definition)
  const assessment=await db.assessment.create({data:{scaleId:wrapper.id,userId:student,status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',attemptEpoch:1}})
  const input={assessmentId:assessment.id,userId:student,submissionId:randomUUID(),attemptEpoch:1,definitionHash:hashScaleDefinition(compiled),contextSnapshotHash:null,answers:compiled.items.map(item=>({itemCode:item.itemCode,responseValue:compiled.responseSets.find(set=>set.key===item.responseSetKey)!.options[0].value}))}
  await submitScaleAssessmentFinal(input)
  const saved=await db.assessment.findUniqueOrThrow({where:{id:assessment.id}})
  expect(saved.status).toBe('COMPLETED')
  await db.$transaction(tx=>stopCollection(tx,admin,'RELEASE',release.releaseId,'Synthetic post-FINAL stop'))
  const replay=await submitScaleAssessmentFinal(input)
  expect(replay.replayed).toBe(true)
  await expect(submitScaleAssessmentFinal({...input,answers:compiled.items.map(item=>({itemCode:item.itemCode,responseValue:compiled.responseSets.find(set=>set.key===item.responseSetKey)!.options[1].value}))})).rejects.toThrow()
  const retained=await db.assessment.findUniqueOrThrow({where:{id:assessment.id}})
  expect(retained.result).toEqual(saved.result);expect(retained.answers).toEqual(saved.answers)
  expect(retained.submissionPayloadHash).toBe(saved.submissionPayloadHash)
  const course=await db.course.create({data:{title:'Synthetic owned course',courseCode:randomUUID(),creatorId:teacher,status:'PUBLISHED'}})
  await db.courseScale.create({data:{courseId:course.id,scaleId:wrapper.id}})
  await db.courseStudent.create({data:{courseId:course.id,studentId:student,status:'APPROVED'}})
  const response:any={};response.status=(status:number)=>{response.statusCode=status;return response};response.json=(body:unknown)=>{response.body=body;return response}
  await startStandaloneScaleAssessment({user:{userId:student,role:'STUDENT'},params:{scaleId:wrapper.id},body:{}} as any,response)
  expect(response.statusCode).toBe(403)
  expect(await db.assessment.count({where:{scaleId:wrapper.id,userId:student}})).toBe(1)
 })
 it('real FINAL waiting on an uncommitted emergency fence cannot collect after the stop commits',async()=>{
  const {submitScaleAssessmentFinal}=await import('../../modules/scale/scale-final-submit.service')
  const {entryId,release}=await approved()
  const teacher=(await db.user.create({data:{username:'raceteacher'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'TEACHER',teacherApproved:true,accountDomain:'TRAINING'}})).id
  await grantUse(admin,entryId,{requestId:randomUUID(),userId:teacher,product:'TRAINING'})
  const wrapper=await db.scale.findUniqueOrThrow({where:{libraryEntryId:entryId}}),compiled=compileResearchScale(metadata.title,definition)
  const assessment=await db.assessment.create({data:{scaleId:wrapper.id,userId:teacher,status:'IN_PROGRESS',deliveryMode:'FINAL_ONLY',attemptEpoch:1}})
  const input={assessmentId:assessment.id,userId:teacher,submissionId:randomUUID(),attemptEpoch:1,definitionHash:hashScaleDefinition(compiled),contextSnapshotHash:null,answers:compiled.items.map(item=>({itemCode:item.itemCode,responseValue:compiled.responseSets.find(set=>set.key===item.responseSetKey)!.options[0].value}))}
  let locked!:()=>void,commit!:()=>void
  const lockReady=new Promise<void>(resolve=>{locked=resolve}),commitStop=new Promise<void>(resolve=>{commit=resolve})
  const stopping=db.$transaction(async tx=>{await stopCollection(tx,admin,'RELEASE',release.releaseId,'Synthetic FINAL race');locked();await commitStop},{timeout:15000})
  await lockReady
  const final=submitScaleAssessmentFinal(input).then(value=>({ok:true,value}),error=>({ok:false,error}))
  let waiting=false
  try{
    for(let n=0;n<100&&!waiting;n++){
      const [row]=await db.$queryRaw<Array<{waiting:boolean}>>(Prisma.sql`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND cardinality(pg_blocking_pids(pid))>0 AND query ILIKE '%measurement_content_releases%') AS waiting`)
      waiting=row.waiting;if(!waiting)await new Promise(resolve=>setTimeout(resolve,25))
    }
  }finally{commit()}
  await stopping
  expect(waiting).toBe(true)
  expect((await final).ok).toBe(false)
  const retained=await db.assessment.findUniqueOrThrow({where:{id:assessment.id}})
  expect(retained.status).toBe('IN_PROGRESS');expect(retained.submissionId).toBeNull();expect(retained.result).toBeNull()
 })
 it('old Serializable snapshots cannot miss a committed stop after the existing-identity fence',async()=>{
  const release=await source();let ready!:()=>void,resume!:()=>void
  const started=new Promise<void>(r=>{ready=r}),continueAfterStop=new Promise<void>(r=>{resume=r})
  const old=db.$transaction(async tx=>{await tx.$queryRaw`SELECT count(*) FROM measurement_content_releases`;ready();await continueAfterStop;await assertScaleLibraryCollectionAllowed(tx,[release.releaseId])},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:10000})
  const observed=old.then(()=>({ok:true,error:null}),error=>({ok:false,error}))
  await started;await db.$transaction(tx=>stopCollection(tx,admin,'RELEASE',release.releaseId,'Synthetic serializable stop'));resume()
  const outcome=await observed;expect(outcome.ok).toBe(false)
  expect(JSON.stringify(outcome.error)).toMatch(/40001|P2034|serialize/i)
 })
 it('education foundation rejects distribution before adapters without creating a grant',async()=>{
  const {entryId}=await approved()
  for(const product of ['SCHOOL','TEACHER']){
   const requestId=randomUUID()
   await expect(grantUse(admin,entryId,{requestId,product,scopeKind:'USER',organizationId:randomUUID(),userId:reader})).rejects.toThrow('EDUCATION_LIBRARY_ADAPTER_NOT_READY')
   expect(await db.scaleLibraryUseGrant.findUnique({where:{id:requestId}})).toBeNull()
  }
 })
 it('education foundation enforces organization scopes, immutable identity and independent active grants',async()=>{
  const {entryId,release}=await approved()
  const member=(await db.user.create({data:{username:'libschool'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'TEACHER',teacherApproved:true,accountDomain:'SCHOOL'}})).id
  const org=randomUUID(),otherOrg=randomUUID(),membership=randomUUID()
  for(const organizationId of [org,otherOrg]){
   await db.organization.create({data:{id:organizationId,name:'Synthetic library school',productDomain:'SCHOOL',createdByUserId:admin}})
   await db.educationProductEntitlement.create({data:{organizationId,product:'HUISCHOOL',grantedByUserId:admin}})
  }
  await db.organizationMembership.create({data:{id:membership,organizationId:org,userId:member}})
  const userGrant=randomUUID(),orgGrant=randomUUID()
  const insert=(id:string,product:string,scopeKind:string,organizationId:string|null,userId:string|null)=>db.$executeRaw(Prisma.sql`
   INSERT INTO scale_library_use_grants(id,entry_id,product,scope_kind,organization_id,user_id,issuer_id)
   VALUES(${id},${entryId},${product},${scopeKind},${organizationId},${userId},${admin})`)
  // These rows are synthetic DB fixtures, not a product grant path.
  await insert(userGrant,'SCHOOL','USER',org,member)
  await insert(orgGrant,'SCHOOL','ORGANIZATION',org,null)
  await expect(insert(randomUUID(),'SCHOOL','USER',org,member)).rejects.toThrow()
  await expect(insert(randomUUID(),'SCHOOL','ORGANIZATION',org,null)).rejects.toThrow()
  for(const args of [
   ['SCHOOL','USER',null,member],['SCHOOL','USER',org,null],['SCHOOL','ORGANIZATION',org,member],
   ['SURVEY','USER',org,reader],['TRAINING','ORGANIZATION',null,null],
  ] as const)await expect(insert(randomUUID(),args[0],args[1],args[2],args[3])).rejects.toThrow()
  await expect(db.$executeRaw(Prisma.sql`UPDATE scale_library_use_grants SET organization_id=${otherOrg} WHERE id=${userGrant}`)).rejects.toThrow()
  await expect(db.$executeRaw(Prisma.sql`UPDATE scale_library_use_grants SET scope_kind='ORGANIZATION',user_id=NULL WHERE id=${userGrant}`)).rejects.toThrow()
  const input={entryId,releaseId:release.releaseId,contentHash:release.contentHash,organizationId:org,actorId:member,product:'SCHOOL' as const}
  const read=(patch:Partial<typeof input>={})=>db.$transaction(tx=>readEducationLibraryUse(tx,{...input,...patch}))
  expect(await read()).toMatchObject({grantId:userGrant,scopeKind:'USER',runtimeStatus:'EDUCATION_LIBRARY_ADAPTER_NOT_READY',canPublish:false})
  await db.educationProductEntitlement.create({data:{organizationId:org,product:'HUITEACHER',grantedByUserId:admin}})
  const readTeacher=()=>db.$transaction(tx=>readEducationLibraryUse(tx,{...input,product:'TEACHER'}))
  await expect(readTeacher()).rejects.toThrow('USE_GRANT_REQUIRED')
  const teacherGrant=randomUUID()
  await insert(teacherGrant,'TEACHER','USER',org,member)
  expect(await readTeacher()).toMatchObject({product:'TEACHER',grantId:teacherGrant})
  await revokeUse(admin,teacherGrant,{expectedVersion:1,reason:'Synthetic Teacher grant revoked'})
  await expect(readTeacher()).rejects.toThrow('USE_GRANT_REQUIRED')
  await expect(read({contentHash:'0'.repeat(64)})).rejects.toThrow('EXACT_VERSION_MISMATCH')
  await expect(read({releaseId:randomUUID()})).rejects.toThrow('EXACT_VERSION_MISMATCH')
  await expect(read({organizationId:otherOrg})).rejects.toThrow('MEMBERSHIP_REQUIRED')
  await revokeUse(admin,userGrant,{expectedVersion:1,reason:'Synthetic user grant revoked'})
  expect(await read()).toMatchObject({grantId:orgGrant,scopeKind:'ORGANIZATION'})
  await expect(db.$transaction(tx=>assertLibraryUseGrantCurrent(tx,{entryId,userId:member,product:'TRAINING'}))).rejects.toThrow()
  const deny=randomUUID()
  await db.organizationAccessDeny.create({data:{id:deny,organizationId:org,userId:member,permission:'HUISCHOOL_ACCESS',reason:'Synthetic deny',deniedByUserId:admin}})
  await expect(read()).rejects.toThrow('MEMBERSHIP_REQUIRED')
  await db.organizationAccessDeny.update({where:{id:deny},data:{liftedAt:new Date(),liftedByUserId:admin}})
  await db.organizationMembership.update({where:{id:membership},data:{validUntil:new Date(),endedByUserId:admin,endReason:'Synthetic ended'}})
  await expect(read()).rejects.toThrow('MEMBERSHIP_REQUIRED')
 })

 it('education runtime identity reads real wrappers without granting education use',async()=>{
  const {entryId,release}=await approved()
  const member=(await db.user.create({data:{username:'libidentity'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'TEACHER',teacherApproved:true,accountDomain:'SCHOOL'}})).id
  const org=randomUUID()
  await db.organization.create({data:{id:org,name:'Synthetic identity school',productDomain:'SCHOOL',createdByUserId:admin}})
  for(const product of ['HUISCHOOL','HUITEACHER'] as const)
   await db.educationProductEntitlement.create({data:{organizationId:org,product,grantedByUserId:admin}})
  await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org,userId:member}})
  const reference={entryId,releaseId:release.releaseId,contentHash:release.contentHash}
  const scope={product:'SCHOOL' as const,organizationId:org,actorId:member}
  const context=educationLibraryRuntimeContext(scope,reference,'READ')
  const read=(patch:Partial<typeof context>={})=>db.$transaction(tx=>readEducationLibraryExistingWrapperIdentity(tx,{...context,...patch}))
  await expect(read()).rejects.toThrow('EXISTING_WRAPPER_REQUIRED')
  const teacher=(await db.user.create({data:{username:'libwrapper'+randomUUID().slice(0,8),passwordHash:'synthetic',role:'TEACHER',teacherApproved:true,accountDomain:'TRAINING'}})).id
  await grantUse(admin,entryId,{requestId:randomUUID(),userId:teacher,product:'TRAINING'})
  for(const product of ['SCHOOL','TEACHER'] as const){
   const resolved=await read({product})
   expect(resolved).toMatchObject({identityOnly:true,runtimeStatus:'EDUCATION_LIBRARY_ADAPTER_NOT_READY',canDistribute:false,canPublish:false})
   expect(resolved.wrapper.libraryEntryId).toBe(entryId)
   expect(resolved.release.releaseId).toBe(release.releaseId)
   expect(resolved.definition).toEqual(compileResearchScale(metadata.title,definition))
   await expect(db.$transaction(tx=>readEducationLibraryUse(tx,{...scope,...reference,product}))).rejects.toThrow('USE_GRANT_REQUIRED')
  }
  await expect(read({contentHash:'0'.repeat(64)})).rejects.toThrow('EXACT_VERSION_MISMATCH')
  await expect(read({releaseId:randomUUID()})).rejects.toThrow('WRAPPER_IDENTITY_MISMATCH')
  await db.user.update({where:{id:owner},data:{isFrozen:true}})
  try{expect((await read()).release.releaseId).toBe(release.releaseId)}
  finally{await db.user.update({where:{id:owner},data:{isFrozen:false}})}
  await changeEntryStatus(admin,entryId,{expectedVersion:1,status:'WITHDRAWN',reason:'Synthetic identity withdrawal'})
  await expect(read()).rejects.toThrow('CONTENT_SCALE_LIBRARY_IDENTITY_MISMATCH')
 })

 it('freezes education applicability with the approved exact library version',async()=>{
  const release=await source(),requestId=randomUUID()
  const educationApplicability={schemaVersion:1,administrations:[{population:'STUDENT',responseMode:'SELF'},{population:'TEACHER',responseMode:'SELF'}]}
  const request={requestId,releaseId:release.releaseId,metadata,educationApplicability}
  const submission=await submit(owner,'SURVEY',request)
  expect(submission.educationApplicability).toEqual(educationApplicability)
  expect(submission.educationApplicabilityHash).toMatch(/^[a-f0-9]{64}$/)
  const repeated=await submit(owner,'SURVEY',{...request,educationApplicability:{...educationApplicability,administrations:[...educationApplicability.administrations].reverse()}})
  expect(repeated.id).toBe(submission.id)
  await expect(submit(owner,'SURVEY',{...request,educationApplicability:{schemaVersion:1,administrations:[{population:'STUDENT',responseMode:'PARENT_REPORT'}]}})).rejects.toThrow('请求编号已用于其他申请')
  const approvedVersion=await review(admin,submission.id,{expectedVersion:1,decision:'APPROVE',reason:'Explicit applicability approved with this version'})
  const detail=await readSubmission(owner,submission.id)
  expect(detail.educationApplicability).toEqual(educationApplicability)
  expect(detail.educationApplicabilityHash).toBe(submission.educationApplicabilityHash)
  expect(detail.snapshot.educationApplicability).toEqual(educationApplicability)
  expect(detail.release.releaseId).toBe(release.releaseId)
  await expect(db.$executeRaw(Prisma.sql`UPDATE scale_library_submissions SET snapshot=jsonb_set(snapshot,'{educationApplicability}','{}'::jsonb) WHERE id=${submission.id}`)).rejects.toThrow()
  await expect(submit(owner,'SURVEY',{...request,requestId:randomUUID()})).rejects.toThrow()
  const entries=await listEntries(admin,approvedVersion.entryId!)
  expect(entries.list[0].educationApplicabilityHash).toBe(submission.educationApplicabilityHash)
  expect(entries.list[0].supportedEntrypoints).not.toContain('SCHOOL')
  expect(entries.list[0].supportedEntrypoints).not.toContain('TEACHER')
 })

})
