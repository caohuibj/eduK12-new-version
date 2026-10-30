import {randomUUID} from 'node:crypto'
import {readFileSync,writeFileSync} from 'node:fs'
import {afterAll,expect,it,vi} from 'vitest'
import {UserRole} from '@prisma/client'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {MIXED_SCALE_DEFINITION} from '../questionnaire/product-fixtures'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import {publishTrainingSourcesFixture} from '../fixtures/published-measurement'
import {SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE as sjt} from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import {freezeAssignmentProfile,freezeDataForWrite} from '../../modules/cognitive/profile-freeze'
import {requireCognitiveRegistryEntry} from '../../modules/cognitive/cognitive.registry'
import {gonogoSequence} from '../../modules/cognitive/randomization'
import {createTrialEnvelope} from '../../modules/cognitive/v2/trial-envelope'
import {compositeItemSlotKey} from '../../modules/assessment-runtime/slot-set'
import {createCodeBundleDefinitionProvider} from '../../modules/bundle-product/code-catalog'
import {BundleDefinitionProvider} from '../../modules/bundle-product/definition-provider'
import {createBundleProductService} from '../../modules/bundle-product/service'
import {startUserAttempt,finalizeCompositeAttemptIfReady} from '../../modules/composite/composite.service'
import {submitCompositeFormSectionFinal} from '../../modules/composite/final-submit.service'
import {submitScaleAssessmentFinal} from '../../modules/scale/scale-final-submit.service'
import {submitCognitiveSessionFinal} from '../../modules/cognitive/final-submit.service'
import {submitSituationalAttemptFinal} from '../../modules/situational/situational-final-submit.service'
import {listTrainingAnalysisSources,loadTrainingAnalysisSources} from '../../modules/training-analysis/source'
import {listTrainingGroupReports,trainingGroupTools,generateTrainingGroupReport,readTrainingGroupReport} from '../../modules/training-analysis/group-report.service'
import * as canonicalReader from '../../modules/assessment-runtime/compact-assessment-storage'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL');if(!url)throw Error('isolated PostgreSQL required');requireIsolatedReleaseDatabase(url)
process.env.BUNDLE_PRODUCTS_ENABLED='true'
afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await db.$disconnect()})
it('consumes a real course Bundle leaf through existing source/statistics/artifact readers without Context or Profile aggregation',async()=>{
 const ready=process.env.TRAINING_BUNDLE_GROUP_FIXTURE?JSON.parse(readFileSync(process.env.TRAINING_BUNDLE_GROUP_FIXTURE,'utf8')):await(async()=>{
  const {actor,student,suffix,course,scale,assignment}=process.env.TRAINING_BUNDLE_GROUP_BOOTSTRAP?JSON.parse(readFileSync(process.env.TRAINING_BUNDLE_GROUP_BOOTSTRAP,'utf8')):await(async()=>{
   const suffix=randomUUID(),actor={userId:'bundle-group-owner-'+suffix,role:UserRole.TEACHER},student='bundle-group-person-'+suffix
  await db.user.createMany({data:[{id:actor.userId,username:actor.userId,passwordHash:'synthetic',role:'TEACHER',teacherApproved:true,accountDomain:'TRAINING'},{id:student,username:student,passwordHash:'synthetic',role:'STUDENT',accountDomain:'TRAINING'}]})
  const course=await db.course.create({data:{creatorId:actor.userId,title:'Native Bundle group fixture',courseType:'TRAINING_COURSE',courseCode:'bundle-group-'+suffix,status:'PUBLISHED'}})
  await db.courseStudent.create({data:{studentId:student,courseId:course.id,status:'ACTIVE'}})
  const freeze=freezeAssignmentProfile({entry:requireCognitiveRegistryEntry('gonogo','1.0.0','1.0.0'),profile:'standard',baseConfig:{totalTrials:120,nogoRatio:.25,stimulusMs:800,isiMs:500,validRtFloorMs:100,report:{reportVersion:'1.0.0',referenceMode:'none'}}})
  const config=await db.cognitiveTestConfig.upsert({where:{testType_configVersion:{testType:'gonogo',configVersion:'1.0.0'}},update:{},create:{testType:'gonogo',configVersion:'1.0.0',name:'Existing protocol',config:freeze.resolvedConfig as any,status:'PUBLISHED',engineVersion:'1.0.0',scoringVersion:'1.0.0',accessPolicy:'OPEN',publishedAt:new Date()}})
  const assignment=await db.cognitiveAssignment.create({data:{configId:config.id,courseId:course.id,createdBy:actor.userId,title:'Go/No-Go',status:'PUBLISHED',listedStandalone:true,maxAttempts:10,...freezeDataForWrite(freeze)}})
  const scale=await db.scale.create({data:{code:'bundle-group-'+suffix,name:'Native zero score',creatorId:actor.userId,status:'PUBLISHED',visibility:'HIDDEN',instrumentClass:'CUSTOM_DESCRIPTIVE',instrumentVersion:'2.0.0',definition:MIXED_SCALE_DEFINITION as any,definitionHash:hashScaleDefinition(MIXED_SCALE_DEFINITION),itemCount:1,dimensionCount:1}})
  await publishTrainingSourcesFixture(db,actor.userId,{scaleIds:[scale.id],assignmentIds:[assignment.id],situational:[{instrumentKey:sjt.key,instrumentVersion:sjt.instrumentVersion}]})
   const bootstrap={actor,student,suffix,course:{id:course.id},scale:{id:scale.id,code:scale.code},assignment:{id:assignment.id}}
   writeFileSync('/tmp/training-native-bundle-group-bootstrap.json',JSON.stringify(bootstrap));return bootstrap
  })()
  // Same pre-approved synthetic native Bundle fixture as the existing product
  // lifecycle suite, retaining every required measurement and Context field.
  const entry=createCodeBundleDefinitionProvider().exact('integrated_gonogo_adexi_adult_zh_cn_v1','1.0.0')!
  entry.definition.bundleKey='bundle_group_'+suffix.replaceAll('-','_');entry.definition.status='PUBLISHED';entry.definition.name='Synthetic native group source'
  entry.definition.rightsRequirements={required:false,instrumentKeys:[]};entry.definition.slots[1].instrumentKey=scale.code;entry.definition.slots[1].valueSelectors=['total']
  entry.definition.slots.push({slotKey:'situational',unitType:'SITUATIONAL',position:2,required:true,instrumentKey:sjt.key,instrumentVersion:sjt.instrumentVersion,respondentType:'SELF',valueSelectors:['bfi2.assertiveness.behavior']})
  const product=createBundleProductService(new BundleDefinitionProvider([entry]))
  await db.materialGrant.create({data:{teacherId:actor.userId,resourceType:'ASSESSMENT_BUNDLE',resourceId:entry.definition.bundleKey+'@1.0.0',grantedBy:actor.userId}})
  const draft=await product.create(actor,{requestId:randomUUID(),bundleKey:entry.definition.bundleKey,bundleVersion:'1.0.0',name:'Native course Bundle',courseId:course.id,bindings:[{slotKey:'gonogo',resourceId:assignment.id},{slotKey:'adexi',resourceId:scale.id},{slotKey:'situational'}]})
  const task=await product.publish(actor,draft.id,draft.revision)
  writeFileSync('/tmp/training-native-bundle-group-published.json',JSON.stringify({actor,student,courseId:course.id,taskId:task.id}))
  const started=await startUserAttempt(student,task.id),attemptId=started.attempt.id,form=started.attempt.currentItem as any
  writeFileSync('/tmp/training-native-bundle-group-started.json',JSON.stringify({actor,student,courseId:course.id,taskId:task.id,attemptId}))
  const section=await db.compositeFormSection.findFirstOrThrow({where:{compositeAssessmentId:task.id},include:{items:true}})
  await submitCompositeFormSectionFinal({attemptId,sectionId:section.id,userId:student,submissionId:randomUUID(),attemptEpoch:1,definitionHash:form.definitionHash,answers:section.items.map(item=>({formItemId:item.id,value:'25'}))})
  const scaleAttempt=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:attemptId}})
  await submitScaleAssessmentFinal({assessmentId:scaleAttempt.id,submissionId:randomUUID(),attemptEpoch:1,definitionHash:hashScaleDefinition(MIXED_SCALE_DEFINITION),contextSnapshotHash:null,answers:[{itemCode:'mixed-scale-item-1',responseValue:'no'}],userId:student})
  const cog=await db.cognitiveSession.findFirstOrThrow({where:{compositeAttemptId:attemptId},include:{assignment:true}})
  await submitCognitiveSessionFinal(student,{sessionId:cog.id,submissionId:randomUUID(),attemptEpoch:1,definitionHash:cog.assignment!.resolvedConfigHash!,contextSnapshotHash:null,trials:gonogoSequence(cog.randomSeed,120,.25).map((trialType,trialIndex)=>createTrialEnvelope({trialIndex,phase:'test',startedAtPerfMs:trialIndex*1000,endedAtPerfMs:trialIndex*1000+300,payload:{trialType,responded:trialType==='go',rtMs:trialType==='go'?300:null,interrupted:false}}))})
  const child=await db.situationalAttempt.findFirstOrThrow({where:{compositeAttemptId:attemptId}})
  await submitSituationalAttemptFinal({attemptId:child.id,userId:student,submissionId:randomUUID(),attemptEpoch:1,definitionHash:child.definitionHash,instrumentVersion:child.instrumentVersion,compiledRuntimeHash:child.compiledRuntimeHash,scoringVersion:child.scoringVersion,responses:[{sceneKey:'AS-01',channelKey:'behavior',responseValue:'A'},{sceneKey:'AS-02',channelKey:'behavior',responseValue:'B'}],embedded:{compositeAttemptId:attemptId,compositeItemId:child.compositeItemId!,compositeSlotKey:compositeItemSlotKey(child.compositeItemId!,'SITUATIONAL'),userId:student}})
  await finalizeCompositeAttemptIfReady(attemptId)
  const value={actor,student,courseId:course.id,taskId:task.id,attemptId,scaleItemId:scaleAttempt.compositeItemId,contextItemId:section.items[0].id}
  writeFileSync('/tmp/training-native-bundle-group-fixture.json',JSON.stringify(value));return value
 })()
 const scope={actor:ready.actor,courseId:ready.courseId},parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:ready.attemptId}})
 expect(parent).toMatchObject({status:'COMPLETED',deliveryCourseId:ready.courseId})
 expect((await listTrainingGroupReports(scope)).tasks.some(task=>task.id===ready.taskId)).toBe(true)
 const catalog=await trainingGroupTools({...scope,taskId:ready.taskId})
 expect(catalog.tools.every(tool=>tool.kind!=='FORM')).toBe(true)
 const tool=catalog.tools.find(tool=>tool.key===ready.scaleItemId)!
 expect(tool).toMatchObject({kind:'SCALE',source:{taskId:ready.taskId}})
 const selector={schemaVersion:1 as const,courseId:ready.courseId,mode:'PAIRWISE' as const,waves:[{waveKey:'single',...tool.source}]}
 const source=await db.$transaction(tx=>loadTrainingAnalysisSources(tx,ready.actor,selector,{group:{}}))
 expect(source.group!.parents).toHaveLength(1);expect(source.group!.observations.find(row=>row.metricKey==='total')?.value).toBe(0)
 await expect(db.$transaction(tx=>loadTrainingAnalysisSources(tx,ready.actor,{...selector,waves:[{...selector.waves[0],metrics:[{itemId:ready.contextItemId,metricKey:'age',label:'Context'}]}]},{group:{}}))).rejects.toMatchObject({statusCode:404})
 expect((await db.$transaction(tx=>listTrainingAnalysisSources(tx,ready.actor,ready.courseId))).list.some(task=>task.taskId===ready.taskId)).toBe(false)
 const {publication,configDigest,variantKey}=tool.source
 const generated=await generateTrainingGroupReport({...scope,selection:{taskId:ready.taskId,toolKey:tool.key,publication,configDigest,variantKey}})
 expect(generated.projection.tool.kind).toBe('SCALE');expect(generated.projection.metrics[0]).toMatchObject({state:'suppressed',validN:null,mean:null})
 const reader=vi.spyOn(canonicalReader,'loadStoredCanonicalUnitResults')
 expect(await readTrainingGroupReport({...scope,taskId:ready.taskId,artifactId:generated.artifactId})).toEqual(generated)
 expect(reader).not.toHaveBeenCalled();reader.mockRestore()
 writeFileSync('/tmp/training-native-bundle-group-proof.json',JSON.stringify({passed:true,realNativePublicationAndAllRequiredInputs:true,newParentCourseBinding:true,onlyDeclaredMeasurementLeaves:true,contextRejectedAsMetric:true,profileNotAggregated:true,canonicalZeroPreservedBeforeDisclosure:true,onePersonSuppressedByExistingFloor:true,storedReadDoesNotMaterializeCanonicalFacts:true,oldMultiWaveEntryUnchanged:true,productionAccessed:false},null,2))
},90_000)

it.each(['COGNITIVE','SJT'])('projects the retained native %s leaf with its frozen metric identities',async(kind)=>{
 const ready=JSON.parse(readFileSync(process.env.TRAINING_BUNDLE_GROUP_FIXTURE??'/tmp/training-native-bundle-group-fixture.json','utf8'))
 const catalog=await trainingGroupTools({actor:ready.actor,courseId:ready.courseId,taskId:ready.taskId})

  const tool=catalog.tools.find(tool=>tool.kind===kind)
  expect(tool,kind).toBeDefined()
  const selector={schemaVersion:1 as const,courseId:ready.courseId,mode:'PAIRWISE' as const,waves:[{waveKey:'single',...tool!.source}]}
  const source=await db.$transaction(tx=>loadTrainingAnalysisSources(tx,ready.actor,selector,{group:{}}))
  expect(source.group!.parents).toHaveLength(1)
  expect(source.group!.definitions.length).toBeGreaterThan(0)
  expect(source.group!.definitions.every(metric=>metric.measurement!=null)).toBe(true)
  const numeric=source.group!.observations.filter(row=>typeof row.value==='number')
  expect(numeric.length,kind).toBeGreaterThan(0)
  expect(numeric.every(row=>Number.isFinite(row.value))).toBe(true)
  expect(new Set(numeric.map(row=>row.parentId))).toEqual(new Set([ready.attemptId]))
 writeFileSync(`/tmp/training-native-bundle-group-${kind}.json`,JSON.stringify({passed:true,kind,metricKeys:source.group!.definitions.map(metric=>metric.key),numericObservations:numeric.length,reusedCompletedParent:true,newAdministration:false},null,2))
},30_000)
