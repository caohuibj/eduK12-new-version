import {finishP6StartedConnection} from './education-package-completion.fixture'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {createHmac,randomUUID} from 'node:crypto'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {setupEducationRuntimeActors} from '../integration/educationLibraryRuntimeFixture'
import {publishStaticMeasurementFixture} from '../fixtures/published-measurement'
import {scaffoldPackage} from '../../modules/assessment-bundle/onboarding/template'
import {packageEntry} from '../../modules/assessment-bundle/onboarding/catalog'
import {canonicalJsonString} from '../../modules/assessment-runtime/canonical'
import {hashDeclarativePackage} from '../../modules/assessment-bundle/onboarding/contract'
import {installPackage,publishPackage} from '../../modules/bundle-product/package-release'
import {BundleDefinitionProvider} from '../../modules/bundle-product/definition-provider'
import {createBundleProductService} from '../../modules/bundle-product/service'
import {issueAdminContentRoot,revokeAdminContentGrant} from '../../modules/measurement-content/admin-authority.service'
import {getContentRelease,publishContentRelease} from '../../modules/measurement-content/repository'
import {DECLARATIVE_REPORT_GENERATOR} from '../../modules/measurement-content/report-renderer'
import {educationPackageKey} from '../../modules/education-tools/package-reference.contracts'
import {listAdminEducationPackageSources,listEducationPackageSources} from '../../modules/education-tools/package-reference.catalog'
import {previewEducationWholePackage} from '../../modules/education-tools/package-reference.source'
import * as registration from '../../modules/education-tools/assessment-resource.service'
import {readEducationAssessmentDeliveryIdentity} from '../../modules/education-tools/assessment-resource.repository'
import {createCampusActivity,readCampusActivity,changeCampusActivityStatus} from '../../modules/campus/activity.service'
import {allocateCampusActivityParticipants} from '../../modules/campus/activity.allocation'
import {createCampusActivityRunDraft} from '../../modules/campus/activity.runs'
import {createHuiteacherTarget,createHuiteacherEvent,createHuiteacherEventRunDraft,transitionHuiteacherEvent} from '../../modules/huiteacher/evaluation.service'
import {addAssessmentRunTrackDraft} from '../../modules/assessment-run/repository'
import {publishAssessmentRun} from '../../modules/assessment-run/publish'
import {startAssessmentRunExecution} from '../../modules/assessment-run/startExecution'
import {resultAudiences} from '../../modules/assessment-policy/result-disclosure'
import type {EducationAssessmentContext} from '../../modules/education-tools/assessment-resource.issuer'

const url=integrationDatabaseUrl('BUNDLE_PRODUCT_TEST_DATABASE_URL'),suite=url?describe:describe.skip
suite('public whole Bundle connection on real PostgreSQL',()=>{
 const pack=scaffoldPackage('p6_connection_'+randomUUID().replace(/-/g,'')),secret='synthetic-p6-public-bundle-review-key-only'
 const proof=()=>({tokenVersion:0,adminSessionId:'synthetic-strong-proof',adminVerifiedAt:Date.now()/1000})
 let system:Awaited<ReturnType<typeof db.user.create>>,reviewer:typeof system,sourceId:string,releaseId:string
 const previousKey=process.env.BUNDLE_REVIEW_SIGNING_KEY,previousGate=process.env.BUNDLE_PRODUCTS_ENABLED
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!);process.env.BUNDLE_REVIEW_SIGNING_KEY=secret;process.env.BUNDLE_PRODUCTS_ENABLED='true'
  system=await db.user.create({data:{username:'p6-system-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING',role:'ADMIN',platformRole:'SYSTEM_ADMIN'}})
  reviewer=await db.user.create({data:{username:'p6-reviewer-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING',role:'ADMIN',platformRole:'SYSTEM_ADMIN'}})
  await publishStaticMeasurementFixture(db,{instrumentKey:'sjt-assertiveness-golden',instrumentVersion:'1.0.0'})
  releaseId=(await installPackage(db,system.id,pack)).id
  const material={contentHash:hashDeclarativePackage(pack),reviewerId:reviewer.id,expiresAt:new Date(Date.now()+3600000).toISOString(),claims:['independent_summary'],scientific:true,rights:true,language:true,report:true}
  await publishPackage(db,system.id,pack.manifest.definition.bundleKey,'1.0.0',{...material,signature:createHmac('sha256',secret).update(canonicalJsonString(material)).digest('hex')})
  const course=await db.course.create({data:{creatorId:system.id,title:'Synthetic original whole source',courseCode:'P6-'+randomUUID(),courseType:'TRAINING_COURSE',status:'PUBLISHED'}})
  const product=createBundleProductService(new BundleDefinitionProvider([packageEntry(pack)])),actor={userId:system.id,role:system.role}
  const created=await product.create(actor,{requestId:randomUUID(),bundleKey:pack.manifest.definition.bundleKey,bundleVersion:'1.0.0',name:'Synthetic complete original package',courseId:course.id,bindings:[{slotKey:'situational'}]})
  sourceId=(await product.publish(actor,created.id,created.revision)).id
 },60000)
 afterAll(async()=>{if(previousKey===undefined)delete process.env.BUNDLE_REVIEW_SIGNING_KEY;else process.env.BUNDLE_REVIEW_SIGNING_KEY=previousKey;if(previousGate===undefined)delete process.env.BUNDLE_PRODUCTS_ENABLED;else process.env.BUNDLE_PRODUCTS_ENABLED=previousGate;await db.$disconnect()})
 it.each(['SCHOOL','TEACHER'] as const)('%s exact U discovery, existing publication/START, continuation after revoke and saved feedback',async product=>{
  const actors=await setupEducationRuntimeActors(db,product),{manager,organizationId,participantMembershipId,participantUserId}=actors
  const c:EducationAssessmentContext={product,organizationId,principal:manager},privateContext={entry:product,organizationId,principal:manager}
  const sourceRef={provider:'NATIVE_RELEASE' as const,versionId:releaseId,contentHash:hashDeclarativePackage(pack)},key=educationPackageKey(sourceRef)
  const grant=async(capability:'material.use'|'material.distribute',resourceKeys:string[],subjectId=manager.userId)=>issueAdminContentRoot(system.id,proof(),{requestId:randomUUID(),expectedVersion:0,reason:'Explicit synthetic whole-source engineering fixture only',grant:{subjectId,
   scope:{product,scopeKind:'ORGANIZATION',scopeId:organizationId,resourceKind:'material',resourceKeys},capabilities:[capability],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})
  expect((await listAdminEducationPackageSources(system.id,proof(),{entry:product})).list.some(row=>row.catalogKey===key)).toBe(true)
  expect((await listEducationPackageSources(privateContext,{})).list).toEqual([])
  await expect(grant('material.use',[key],participantUserId)).rejects.toMatchObject({statusCode:403})
  const use=await grant('material.use',[key])
  expect((await listEducationPackageSources(privateContext,{})).list[0]).toMatchObject({sourceRef,canSplit:false,allowedActions:expect.arrayContaining(['REGISTER_WHOLE_PACKAGE'])})
  expect(await previewEducationWholePackage(privateContext,{sourceRef})).toMatchObject({protocol:'NATIVE_BUNDLE_V3',readOnly:true})
  expect((await registration.listEducationAssessmentSourceCandidates(c,undefined,sourceRef)).list).toEqual([])
  const original=await db.compositeAssessment.findUniqueOrThrow({where:{id:sourceId}})
  const units=(original.trainingContentSnapshot as unknown as {units:Array<{measurement:{releaseId:string}}>}).units
  const ids=[sourceId,...units.map(unit=>unit.measurement.releaseId)],distribution=await grant('material.distribute',ids)
  const licenses=ids.map(resourceId=>({resourceId,grantId:distribution.grantId}))
  expect((await registration.listEducationAssessmentSourceCandidates(c,undefined,sourceRef)).list[0]).toMatchObject({sourceCompositeId:sourceId,canPrepare:true})
  const prepared=await registration.prepareEducationAssessment(c,{resourceId:randomUUID(),sourceCompositeId:sourceId,title:'Synthetic public Bundle reference',family:'BUNDLE',licenses,publicPackage:sourceRef})
  expect(prepared).toMatchObject({publicPackage:sourceRef,fixedSelection:{references:{schemaVersion:1}}})
  const reports=[],metrics:string[]=[]
  for(const unit of prepared.units){
   const measurement=await db.$transaction(tx=>getContentRelease(tx,unit.measurement.releaseId));if(measurement?.layer!=='MEASUREMENT')throw Error('Exact measurement required')
   const keys=measurement.content.metrics.map(metric=>metric.metricKey);metrics.push(...keys)
   const report=await db.$transaction(tx=>publishContentRelease(tx,{family:unit.family,layer:'REPORT',key:'p6-target-report-'+randomUUID(),version:'1.0.0',scope:{kind:'PRIVATE',product,ownerId:manager.userId,resourceId:prepared.runtimeCompositeId},sourceReleaseId:null,assetRefs:[],provenance:{synthetic:true},content:{projectionVersion:1,measurements:[{releaseId:unit.measurement.releaseId,contentHash:unit.measurement.contentHash}],metricKeys:keys,audience:product==='SCHOOL'?'student':'teacher',language:'zh-CN',generatorVersion:DECLARATIVE_REPORT_GENERATOR,template:{title:'Synthetic allowed individual feedback',blocks:keys.map(metricKey=>({type:'METRIC' as const,metricKey,display:'RAW' as const}))}}},system.id))
   const r=await grant('material.distribute',[report.releaseId]);licenses.push({resourceId:report.releaseId,grantId:r.grantId});reports.push({itemId:unit.itemId,releaseId:report.releaseId})
  }
  const input={expectedPreparationHash:prepared.preparationHash,disclosure:{schemaVersion:1,policyKey:'synthetic-p6-personal-feedback',minimumRespondents:null,audiences:Object.fromEntries(resultAudiences.map(audience=>[audience,{mode:audience==='RESPONDENT'?'INDIVIDUAL_SUMMARY':'NONE',metricKeys:audience==='RESPONDENT'?metrics:[],longitudinalMetricKeys:[]}]))},feedbackPolicy:{schemaVersion:1,mode:'IMMEDIATE'},references:prepared.fixedSelection!.references,reports,licenses}
  await expect(registration.registerEducationAssessment(c,prepared.resourceId,{...input,references:{schemaVersion:1,units:[]}})).rejects.toMatchObject({code:'EDUCATION_PACKAGE_SELECTION_IMMUTABLE'})
  const registered=await registration.registerEducationAssessment(c,prepared.resourceId,input)
  const reviewContext:EducationAssessmentContext={...c,principal:{userId:reviewer.id,username:reviewer.username,role:reviewer.role,accountDomain:'TRAINING',platformRole:'SYSTEM_ADMIN',mustChangePassword:false,...proof()}}
  await registration.transitionEducationAssessment(reviewContext,prepared.resourceId,'REVIEW',{expectedEntryHash:registered.entryHash,reason:'Independent existing registration review'})
  const published=await registration.transitionEducationAssessment(reviewContext,prepared.resourceId,'PUBLISH',{expectedEntryHash:registered.entryHash,reason:'Existing publication, no new approval layer'})
  const identity=await db.$transaction(tx=>readEducationAssessmentDeliveryIdentity(tx,{resourceKey:published.resourceKey,version:'1.0.0',purpose:'NEW_USE'}))
  let runId:string,workflowId:string,open:()=>Promise<unknown>
  if(product==='SCHOOL'){
   const activity=await createCampusActivity({actor:manager,organizationId,title:'Synthetic P6 public Bundle',purpose:'STUDENT_WELLBEING'});workflowId=activity.id
   await allocateCampusActivityParticipants({actor:manager,organizationId,courseId:workflowId,classUnitIds:[actors.classUnitId!],requestKey:randomUUID(),expectedVersion:1})
   runId=(await createCampusActivityRunDraft({actor:manager,organizationId,courseId:workflowId,name:'Synthetic P6'})).id
   open=async()=>{const detail=await readCampusActivity({actor:manager,organizationId,courseId:workflowId})
    const submitted=await changeCampusActivityStatus({actor:manager,organizationId,courseId:workflowId,action:'SUBMIT',expectedVersion:detail.version})
    return changeCampusActivityStatus({actor:manager,organizationId,courseId:workflowId,action:'OPEN',expectedVersion:submitted.version})}
  }else{
   const target=await createHuiteacherTarget({actorUserId:manager.userId,organizationId,kind:'ORGANIZATION',name:'Synthetic participants'})
   const event=await createHuiteacherEvent({actorUserId:manager.userId,organizationId,targetId:target.id,kind:'ASSESSMENT',title:'Synthetic public Bundle'});workflowId=event.id
   runId=(await createHuiteacherEventRunDraft({actorUserId:manager.userId,organizationId,eventId:event.id,name:'Synthetic P6'})).runId
   open=()=>transitionHuiteacherEvent({actorUserId:manager.userId,organizationId,eventId:event.id,action:'OPEN',expectedVersion:1})
  }
  const a=identity.entry.applicability
  for(let n=0;n<2;n++){
   const [state]=await db.$queryRaw<Array<{version:number}>>`SELECT version FROM assessment_runs WHERE id=${runId}`
   await addAssessmentRunTrackDraft({actorUserId:manager.userId,organizationId,runId,expectedRunId:runId,expectedVersion:state.version,educationWorkflow:{product,id:workflowId},resource:{family:'BUNDLE',key:published.resourceKey,version:'1.0.0'},subjectSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[participantMembershipId]},respondentSelector:{kind:'MEMBERSHIP_IDS',membershipIds:[participantMembershipId]},requestedPolicy:{subjectRoles:a.subjectRoles,respondentRoles:a.respondentRoles,relationshipKinds:a.relationshipKinds,perspectives:a.perspectives,analysisMode:a.analysisMode,visibilityPolicyKey:a.visibilityPolicyKey,minimumRespondents:a.minimumRespondents}})
  }
  const [state]=await db.$queryRaw<Array<{version:number}>>`SELECT version FROM assessment_runs WHERE id=${runId}`
  await open()
  expect((await publishAssessmentRun({actorUserId:manager.userId,organizationId,runId,expectedVersion:state.version})).executionCount).toBe(2)
  const executions=await db.$queryRaw<Array<{id:string}>>`SELECT id FROM assessment_run_executions WHERE run_id=${runId} ORDER BY id`
  const started=await startAssessmentRunExecution({executionId:executions[0].id,actorUserId:participantUserId})
  if(!('runtimeBindingRef'in started)||typeof started.runtimeBindingRef!=='string')throw Error('Expected native binding')
  const parentId=started.runtimeBindingRef
  await revokeAdminContentGrant(system.id,proof(),use.grantId,{expectedVersion:1,reason:'Synthetic revoke before second START'})
  await expect(startAssessmentRunExecution({executionId:executions[1].id,actorUserId:participantUserId})).rejects.toMatchObject({code:'EDUCATION_PACKAGE_USE_REQUIRED'})
  expect(await startAssessmentRunExecution({executionId:executions[0].id,actorUserId:participantUserId})).toMatchObject({runtimeBindingRef:parentId})
  await finishP6StartedConnection({product,participantUserId,managerId:manager.userId,parentId,executionId:executions[0].id})
  expect((await listEducationPackageSources(privateContext,{})).list).toEqual([])
 },90000)
})
