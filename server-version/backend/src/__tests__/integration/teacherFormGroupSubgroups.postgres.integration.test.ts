import {randomUUID} from 'node:crypto'
import {readFileSync,writeFileSync} from 'node:fs'
import {afterAll,expect,it} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {createHuiteacherForm,updateHuiteacherForm,publishHuiteacherForm} from '../../modules/huiteacher/forms.service'
import {createHuiteacherTarget,createHuiteacherEvent,createHuiteacherEventRunDraft,transitionHuiteacherEvent,readHuiteacherEventRun} from '../../modules/huiteacher/evaluation.service'
import {addTeacherRunTrack,previewTeacherRun,publishTeacherRun,closeTeacherRun} from '../../modules/huiteacher/run.service'
import {generateTeacherFormGroupVersion,readTeacherFormGroupVersion,listTeacherFormGroupVersions} from '../../modules/huiteacher/groupReport.service'
import {saveReportPrivacyPreferences} from '../../modules/report-privacy/preferences.service'
import {STANDARD} from '../../modules/report-privacy/registry'
import {teacherFormResourceRef} from '../../modules/huiteacher/formRunResource'
import {startAssessmentRunExecution} from '../../modules/assessment-run/startExecution'
import {submitOwnHuiteacherFormFinal} from '../../modules/huiteacher/formFinal.service'
import type {AuthenticatedPrincipal} from '../../types'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL');if(!url)throw Error('explicit isolated database required');requireIsolatedReleaseDatabase(url)
process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED='true';process.env.REPORT_PRIVACY_TEACHER_V2_ENABLED='true'
const identity=()=>db.user.create({data:{id:randomUUID(),username:'group-teacher-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}})
afterAll(async()=>{await db.$disconnect()})
it('freezes real staff/tag subgroups, enforces the existing same-Form disclosure guard, and reopens native versions without FINAL work',async()=>{
 const fixture=process.env.TEACHER_GROUP_FIXTURE?JSON.parse(readFileSync(process.env.TEACHER_GROUP_FIXTURE,'utf8')):await(async()=>{
  const {admin,org,grant,participants}=process.env.TEACHER_GROUP_EXISTING_SCHOOL?JSON.parse(readFileSync(process.env.TEACHER_GROUP_EXISTING_SCHOOL,'utf8')):await(async()=>{
  const admin=await identity(),org=randomUUID()
  await db.organization.create({data:{id:org,name:'Synthetic Teacher subgroup school',productDomain:'SCHOOL',createdByUserId:admin.id}})
  const adminMembership=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org,userId:admin.id,orgRole:'ORG_ADMIN',validFrom:new Date('2026-09-01')}})
  await db.educationProductEntitlement.create({data:{organizationId:org,product:'HUITEACHER',status:'ACTIVE',grantedByUserId:admin.id}})
  const grant=await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:org,membershipId:adminMembership.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:admin.id}})
  const participants=[]
  for(let i=0;i<12;i++){
   const user=await identity(),member=await db.organizationMembership.create({data:{id:randomUUID(),organizationId:org,userId:user.id,orgRole:'MEMBER',validFrom:new Date('2026-09-01')}})
   await db.organizationPersonaGrant.create({data:{id:randomUUID(),organizationId:org,membershipId:member.id,persona:'TEACHER',grantedByUserId:admin.id}})
   participants.push({userId:user.id,membershipId:member.id})
  }
   return {admin,org,grant,participants}
  })()
  const grade=randomUUID()
  await db.$executeRaw`INSERT INTO organization_units(id,organization_id,unit_kind,name) VALUES(${grade},${org},'GRADE','Synthetic grade')`
  const classes=[randomUUID(),randomUUID(),randomUUID()]
  for(let c=0;c<classes.length;c++){
   await db.$executeRaw`INSERT INTO organization_units(id,organization_id,unit_kind,name,parent_unit_id) VALUES(${classes[c]},${org},'CLASS',${['冻结任教甲班','另任乙班','人数不足班'][c]},${grade})`
   const indices=c===0?[0,1,2,3,4,5]:c===1?[0,6,7,8,9,10,11]:[0,1,2,3]
   for(const i of indices)await db.$executeRaw`INSERT INTO organization_staff_class_assignments(id,organization_id,membership_id,class_unit_id,staff_role,valid_from) VALUES(${randomUUID()},${org},${participants[i].membershipId},${classes[c]},'TEACHING',${new Date('2026-09-01')})`
  }
  const dimension=randomUUID(),label=randomUUID()
  await db.$executeRaw`INSERT INTO organization_classification_dimensions(id,organization_id,key,name,cardinality) VALUES(${dimension},${org},${'subject-'+dimension},'任教学科','MULTI')`
  await db.$executeRaw`INSERT INTO organization_labels(id,organization_id,dimension_id,name) VALUES(${label},${org},${dimension},'语文学科')`
  for(const member of participants.slice(0,7))await db.$executeRaw`INSERT INTO organization_label_assignments(id,organization_id,membership_id,dimension_id,dimension_cardinality,label_id,valid_from) VALUES(${randomUUID()},${org},${member.membershipId},${dimension},'MULTI',${label},${new Date('2026-09-01')})`
  const key={organizationId:org,actorUserId:admin.id}
  const target=await createHuiteacherTarget({...key,kind:'ORGANIZATION',name:'School development'})
  const event=await createHuiteacherEvent({...key,targetId:target.id,kind:'ASSESSMENT',title:'Teacher subgroup survey'})
  const draft=await createHuiteacherForm({...key,title:'Teacher support'})
  await updateHuiteacherForm({...key,formId:draft.id,expectedRevision:draft.revision,title:'Teacher support',definition:{schemaVersion:2,pages:[{pageKey:'p',title:'支持',questions:[{itemKey:'q',type:'SINGLE',prompt:'工作支持',required:true,options:[{optionKey:'yes',label:'充分'},{optionKey:'no',label:'不足'}],rows:[]},{itemKey:'text',type:'SHORT_TEXT',prompt:'补充建议',required:false,options:[],rows:[],maxLength:200}]}]}})
  const form=await db.huiteacherFormInstrument.findUniqueOrThrow({where:{id:draft.id}})
  await publishHuiteacherForm({...key,formId:form.id,expectedRevision:form.revision})
  const run=await createHuiteacherEventRunDraft({...key,eventId:event.id,name:'Teacher Form subgroup Run'})
  await saveReportPrivacyPreferences({...key,actor:{userId:admin.id,username:'Synthetic admin',role:'TEACHER',platformRole:'STANDARD',accountDomain:'SCHOOL',tokenVersion:0,mustChangePassword:false} as AuthenticatedPrincipal,product:'HUITEACHER',scenario:'TEACHER_ADULT_FORM_GROUP',request:{scope:'MY',preset:'CUSTOM',options:{...STANDARD,crossReleaseOverlapGuard:true},expectedRevision:0,requestKey:randomUUID()}})
  await addTeacherRunTrack({...key,eventId:event.id,resource:teacherFormResourceRef(form.id,form.definitionDigest),subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'},requestedPolicy:{subjectRoles:['TEACHER'],respondentRoles:['TEACHER'],relationshipKinds:['SELF'],perspectives:['SELF_REPORT'],analysisMode:'COHORT_AGGREGATE',visibilityPolicyKey:'HUITEACHER_FORM_GROUP_V1',minimumRespondents:5}})
  const opened=await transitionHuiteacherEvent({...key,eventId:event.id,action:'OPEN',expectedVersion:1})
  const current=await readHuiteacherEventRun({...key,eventId:event.id})
  await previewTeacherRun({...key,eventId:event.id,expectedVersion:current.version})
  const published=await publishTeacherRun({...key,eventId:event.id,expectedVersion:current.version})
  expect(published.executionCount).toBe(12)
  const executions=await db.$queryRaw<Array<{id:string;userId:string}>>`SELECT e.id,actor.user_id AS "userId" FROM assessment_run_executions e JOIN assessment_run_actor_snapshots actor ON actor.id=e.respondent_actor_snapshot_id AND actor.run_id=e.run_id AND actor.organization_id=e.organization_id WHERE e.run_id=${run.runId} AND e.organization_id=${org}`
  for(const row of executions){
   const started=await startAssessmentRunExecution({executionId:row.id,actorUserId:row.userId})
   if(started.state!=='STARTED')throw Error('native Form start required')
   await submitOwnHuiteacherFormFinal({actorUserId:row.userId,attemptId:started.runtimeBindingRef,submissionId:randomUUID(),answers:{q:'yes'}})
  }
  await closeTeacherRun({...key,eventId:event.id})
  await transitionHuiteacherEvent({...key,eventId:event.id,action:'CLOSE',expectedVersion:opened.version})
  const ready={...key,eventId:event.id,formId:form.id,runId:run.runId,classes,label,grantId:grant.id,participants}
  writeFileSync('/tmp/teacher-group-subgroup-fixture.json',JSON.stringify(ready))
  return ready
 })()
 const {organizationId,actorUserId,eventId,formId,classes,label}=fixture
 const key={organizationId,actorUserId,eventId,formId}
 let phase='idle',finalQueries=0,rawReadQueries=0
 db.$use(async(params,next)=>{if(phase==='read'&&params.action.toLowerCase().includes('queryraw')){rawReadQueries++;if(JSON.stringify(params.args,(_,value)=>typeof value==='bigint'?value.toString():value).includes('huiteacher_form_finals'))finalQueries++;}return next(params)})
 if(process.env.TEACHER_GROUP_REVOKE_ONLY){
  const saved=JSON.parse(readFileSync('/tmp/teacher-group-subgroup-first.json','utf8'))
  phase='read';await readTeacherFormGroupVersion({...key,versionId:saved.versionId});phase='idle'
  expect(rawReadQueries).toBeGreaterThan(0);expect(finalQueries).toBe(0)
  await db.educationProductRoleGrant.update({where:{id:fixture.grantId},data:{revokedAt:new Date(),revokedByUserId:actorUserId}})
  await expect(readTeacherFormGroupVersion({...key,versionId:saved.versionId})).rejects.toMatchObject({code:'HUITEACHER_GROUP_REPORT_FORBIDDEN'})
  writeFileSync('/tmp/teacher-group-subgroup-proof.json',JSON.stringify({status:'PASSED_BY_RETAINED_STAGE_CONTINUATION',precedingCompletedAssertions:'postgres-scope-continuation.json; failure only at final revocation fixture update',actualNativeFormPublishedAndCompleted:12,selectedClassN:6,multiClassOrDedupN:12,smallClassWithheld:true,sameRunOverlapBlocked:true,correctedReadInstrumentation:{rawReadQueries,finalQueries},oldCaptionAndDigestFrozen:true,newVersionRetained:true,currentProductGrantRevocation:true,privateManifestNotReturned:true,productionAccessed:false},null,2))
  return
 }
 const catalog=await listTeacherFormGroupVersions(key)
 expect(catalog.groups.options.map(option=>option.id)).toEqual(expect.arrayContaining([...classes,label]))
 const first=await generateTeacherFormGroupVersion({...key,selection:{kind:'CLASSES',ids:[classes[0]]}}) as any
 writeFileSync('/tmp/teacher-group-subgroup-first.json',JSON.stringify(first))
 expect(first.independentRespondents).toBe(6);expect(first.populationLabel).toContain('冻结任教甲班')
 expect(first.distributions[0].cells[0].count).toBe(6)
 expect(first.__population).toBeUndefined()
 const stored=await db.educationReportReleaseRecord.findUniqueOrThrow({where:{id:first.versionId}})
 expect((stored.reportProjection as any).__population.contributingExecutionIds).toHaveLength(6)
 phase='read';expect(await readTeacherFormGroupVersion({...key,versionId:first.versionId})).toEqual(first);phase='idle'
 expect(finalQueries).toBe(0)
 await expect(generateTeacherFormGroupVersion({...key,selection:{kind:'CLASSES',ids:[classes[2]]}})).rejects.toMatchObject({code:'HUITEACHER_GROUP_INCOMPLETE_COHORT'})
 await expect(generateTeacherFormGroupVersion({...key,selection:{kind:'LABELS',ids:[label]}})).rejects.toMatchObject({code:'TEACHER_REPORT_EFFECTIVE_DIFFERENCING_BLOCKED'})
 const allClasses=await generateTeacherFormGroupVersion({...key,selection:{kind:'CLASSES',ids:classes.slice(0,2)}}) as any
 expect(allClasses.independentRespondents).toBe(12)
 await db.$executeRaw`UPDATE organization_units SET name='更名任教甲班' WHERE id=${classes[0]}`
 expect(await readTeacherFormGroupVersion({...key,versionId:first.versionId})).toHaveProperty('populationLabel',first.populationLabel)
 const updated=await generateTeacherFormGroupVersion({...key,selection:{kind:'CLASSES',ids:[classes[0]]}}) as any
 expect(updated.versionId).not.toBe(first.versionId);expect(updated.populationLabel).toContain('更名任教甲班')
 expect((await db.educationReportReleaseRecord.findUniqueOrThrow({where:{id:first.versionId}})).reportDigest).toBe(stored.reportDigest)
 const versions=await listTeacherFormGroupVersions(key);expect(versions.versions.map(row=>row.versionId)).toEqual(expect.arrayContaining([first.versionId,allClasses.versionId,updated.versionId]))
 await db.educationProductRoleGrant.update({where:{id:fixture.grantId},data:{revokedAt:new Date(),revokedByUserId:actorUserId}})
 await expect(readTeacherFormGroupVersion({...key,versionId:first.versionId})).rejects.toMatchObject({code:'HUITEACHER_GROUP_REPORT_FORBIDDEN'})
 writeFileSync('/tmp/teacher-group-subgroup-proof.json',JSON.stringify({passed:true,actualNativeFormPublishedAndCompleted:12,selectedClassN:6,multiClassOrDedupN:12,smallClassWithheld:true,sameRunOverlapBlocked:true,snapshotReadFinalQueries:finalQueries,oldCaptionAndDigestFrozen:true,newVersionRetained:true,currentProductGrantRevocation:true,privateManifestNotReturned:true,productionAccessed:false},null,2))
},60_000)
