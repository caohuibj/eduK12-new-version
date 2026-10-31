import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {compileCognitiveRuntime} from '../../modules/assessment-runtime/compiler'
import {createFrozenActiveSlotSet,compositeItemSlotKey} from '../../modules/assessment-runtime/slot-set'
import {createFrozenUnitAdmission,encryptFrozenUnitAdmission} from '../../modules/assessment-runtime/admission-snapshot'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {getParticipantKey} from '../../modules/assessment-runtime/participant-key'
import {createCanonicalUnitResultEnvelope,projectCognitiveCanonicalUnitResult,projectSituationCanonicalUnitResult} from '../../modules/assessment-runtime/unit-result'
import {freezeSituationalRuntimeAtAttemptStart,encryptFrozenSituationalRuntimeSnapshot} from '../../modules/assessment-runtime/situational-runtime-snapshot'
import {requireCognitiveRegistryEntry} from '../../modules/cognitive/cognitive.registry'
import {getCognitiveV2TaskDefinition} from '../../modules/cognitive/v2/registry'
import {createSessionConfigSnapshot} from '../../modules/cognitive/v2/session-snapshot'
import {freezeAssignmentProfile,readFrozenReport,freezeDataForWrite} from '../../modules/cognitive/profile-freeze'
import {encryptCognitivePayload} from '../../modules/cognitive/cognitive.security'
import {projectThreeLayerReport} from '../../modules/cognitive/v2/report'
import type {CognitiveResultSnapshot,CognitiveProfile} from '../../modules/cognitive/v2/types'
import {buildCognitiveBundleBridge} from '../../modules/assessment-bundle/sources'
import {cognitiveMeasurementRelease} from '../../modules/measurement-content/cognitive'
import {sjtMeasurementRelease} from '../../modules/measurement-content/sjt'
import {prepareRelease,type PreparedRelease} from '../../modules/measurement-content/release'
import {interpretContentBinding} from '../../modules/measurement-content/final-interpretation'
import {compileSjtAuthorDocument} from '../../modules/situational/authoring/dispatcher'
import {SJT_ONLINE_PROTOCOL_FLAG} from '../../modules/situational/situational-task-satisfaction'
import teacherExample from '../../modules/situational/authoring/examples/teacher-demonstration.json'
import onlineExample from '../../modules/situational/authoring/examples/online-hand-calculated.json'
import type {SituationalResultV1} from '../../modules/situational/situation-scoring'
import {GENERATED_SITUATIONAL_INSTRUMENT_SOURCES} from '../../modules/situational/onboarding/instruments.generated'
import {createSituationalInstrumentRegistry} from '../../modules/situational/onboarding/instrument-registry'
import {publicationContentDigest} from '../../modules/situational/onboarding/schema'
import type {SituationalScientificContextV1} from '../../modules/situational/onboarding/scientific-schema'
import * as scientificMaturity from '../../modules/situational/scientific-maturity'
import * as situationRegistry from '../../modules/situational/situation-package.registry'
import type {TrainingContentSnapshot} from '../../modules/composite/training-content-binding'
import {educationCompositionKey} from '../../modules/education-tools/private-tool.composition-contracts'
import type {FrozenCompositionIdentity} from '../../modules/assessment-run/educationCompositionExecution'
import {readOrdinaryNativeFeedback} from '../../modules/reporting/education-ordinary-native-feedback'

vi.mock('../../config/database',()=>({prisma:{}}))
const id=(n:number)=>`96300000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash='a'.repeat(64),completed=new Date('2026-10-29T16:00:00.000Z')
const actorId=id(1),ownerId=id(2),compositeId=id(3),parentId=id(4),cognitiveId=id(10),sjtId=id(11)
const cognitiveBlock=id(20),sjtBlock=id(21),configId=id(30),authorId=id(31),assignmentId=id(40)
const base={totalTrials:20,foreperiodMinMs:700,foreperiodMaxMs:1500,timeoutMs:2000,readyDurationMs:1000,report:{reportVersion:'1.0.0',referenceMode:'none'}}
const registry=createSituationalInstrumentRegistry(GENERATED_SITUATIONAL_INSTRUMENT_SOURCES),installed=registry.sources[0],installedPackage=registry.get(installed.content.identity.instrumentKey,installed.content.identity.instrumentVersion)!
beforeEach(()=>{
 vi.stubEnv('DATA_ENCRYPTION_KEY','a'.repeat(64));vi.stubEnv('DATA_PSEUDONYM_KEY','b'.repeat(64))
 vi.stubEnv('ASSESSMENT_COMPACT_FACTS_ENABLED','false');vi.stubEnv('ASSESSMENT_SHARED_CONTROL_ENABLED','false');vi.stubEnv('ASSESSMENT_SHARED_RUNTIME_STORAGE_ENABLED','false')
})
afterEach(()=>vi.unstubAllEnvs())
function stored(id:string,value:PreparedRelease){return {id,layer:value.layer,family:value.family,content_key:value.key,version:value.version,
 hash_scheme:value.hashScheme,content_hash:value.contentHash,content:value.content,provenance:value.provenance,scope:value.scope,
 asset_refs:value.assetRefs,source_release_id:value.sourceReleaseId,status:'PUBLISHED',published_by:ownerId,published_at:completed}}
async function fixture(options:{profile?:CognitiveProfile;quality?:'interpretable'|'limited'|'invalid';online?:boolean;narrative?:boolean;frozenScientificContext?:SituationalScientificContextV1}={}){
 const selectedProfile=options.profile??'experience',qualityState=options.quality??'interpretable'
 const entry=requireCognitiveRegistryEntry('reaction','1.0.0','1.0.0'),definition=getCognitiveV2TaskDefinition('reaction','1.0.0','1.0.0')!
 const freeze=freezeAssignmentProfile({entry,baseConfig:base,profile:selectedProfile}),frozenReport=readFrozenReport(freeze.resolvedReportSnapshotEncrypted)!
 const runtime=compileCognitiveRuntime({definition,instrumentVersion:definition.engineVersion})
 const sessionConfig=createSessionConfigSnapshot({definition,configVersion:'native-fixture-1',config:freeze.resolvedConfig,frozenAt:completed,
  runtime:{runtimeGeneration:'UNIFIED_V1',compiledRuntime:runtime,referenceBindings:runtime.referenceBindingDefinition.selections.map(selection=>({...selection,referenceHash:hash}))}})
 const originalMeasurement=prepareRelease(cognitiveMeasurementRelease({localId:'reaction',version:'native-fixture-1',testType:'reaction',
  configVersion:sessionConfig.configVersion,engineVersion:sessionConfig.engineVersion,scoringVersion:sessionConfig.scoringVersion,config:base,scope:{kind:'PLATFORM'}}))
 const nativeDescriptor={provider:'COGNITIVE_CONFIG' as const,sourceId:configId,contentHash:originalMeasurement.contentHash,sourceMeasurementReleaseId:id(49),profile:selectedProfile,
  profileDefinitionVersion:freeze.profileDefinitionVersion,resolvedConfigHash:freeze.resolvedConfigHash,reportHash:canonicalHash(frozenReport)}
 const nativeMeasurement=cognitiveMeasurementRelease({localId:'reaction',version:'education-profile-v1:'+freeze.resolvedConfigHash,testType:'reaction',
  configVersion:sessionConfig.configVersion,engineVersion:sessionConfig.engineVersion,scoringVersion:sessionConfig.scoringVersion,
  config:freeze.resolvedConfig,scope:{kind:'PRIVATE',product:'TEACHER',ownerId,resourceId:assignmentId}})
 nativeMeasurement.provenance={educationNative:nativeDescriptor,configId,assignmentId}
 const cMeasurement=prepareRelease(nativeMeasurement),cSource={kind:'COGNITIVE_CONFIG' as const,id:configId,ownerId,assignmentId,educationNative:nativeDescriptor}
 const isStatic=!options.online&&!options.narrative
 const pkg=isStatic?installedPackage:compileSjtAuthorDocument(options.online?{...onlineExample,display:{...onlineExample.display,respondentType:'teacher_self_report'}}:teacherExample).package
 const situation=freezeSituationalRuntimeAtAttemptStart({instrumentKey:pkg.key,instrumentVersion:pkg.instrumentVersion,
  definition:pkg.definition,...(pkg.online?{online:pkg.online}:{}),...(options.frozenScientificContext?{scientificContext:options.frozenScientificContext}:{}),frozenAt:completed})
 const sInput=sjtMeasurementRelease({localId:pkg.key,version:isStatic?'registry-v1':pkg.instrumentVersion,instrumentVersion:pkg.instrumentVersion,
  definition:pkg.definition,...(pkg.online?{onlineProtocol:pkg.online}:{}),scope:isStatic?{kind:'PLATFORM'}:{kind:'PLATFORM',ownerId},
  provenance:isStatic?{sourceKind:'STATIC_SJT_REGISTRY',mappingId:authorId,contentDigest:publicationContentDigest(installed.content),instrumentKey:pkg.key,instrumentVersion:pkg.instrumentVersion}:{authorReleaseId:authorId,adaptationSource:null}})
 if(isStatic&&sInput.layer==='MEASUREMENT')sInput.version='registry-v1:'+sInput.content.measurementHash
 const sMeasurement=prepareRelease(sInput)
 if(cMeasurement.layer!=='MEASUREMENT'||sMeasurement.layer!=='MEASUREMENT')throw new Error('Native fixture must retain measurement layers')
 const sDescriptor={provider:'SJT_RELEASE' as const,sourceId:authorId,contentHash:sMeasurement.contentHash}
 const sSource={kind:isStatic?'STATIC_SJT_REGISTRY' as const:'SJT_AUTHOR_RELEASE' as const,id:authorId,...(isStatic?{}:{ownerId}),instrumentKey:pkg.key,instrumentVersion:pkg.instrumentVersion,educationNative:sDescriptor}
 const units:TrainingContentSnapshot['units']=[{itemId:cognitiveId,family:'COGNITIVE',source:cSource,measurement:{releaseId:id(50),contentHash:cMeasurement.contentHash,measurementHash:(cMeasurement as any).content.measurementHash}},
  {itemId:sjtId,family:'SJT',source:sSource,measurement:{releaseId:id(51),contentHash:sMeasurement.contentHash,measurementHash:(sMeasurement as any).content.measurementHash}}]
 const origin={schemaVersion:1 as const,adapterVersion:'1.0.0' as const,mode:'COMPOSITION' as const,entry:'TEACHER' as const,organizationId:id(5),ownerUserId:ownerId,
  toolId:id(6),versionId:id(7),contentHash:hash,variantKey:'TEACHER:SELF' as const}
 const manifest=[{blockId:cognitiveBlock,instruction:'',kind:'COGNITIVE' as const,versionId:configId,contentHash:originalMeasurement.contentHash,sourceProvider:'COGNITIVE_CONFIG' as const,toolId:configId,itemIds:[cognitiveId],sectionIds:[]},
  {blockId:sjtBlock,instruction:'',kind:'SJT' as const,versionId:authorId,contentHash:sMeasurement.contentHash,sourceProvider:'SJT_RELEASE' as const,toolId:authorId,itemIds:[sjtId],sectionIds:[]}]
 const publication={schemaVersion:1 as const,compositeId,units,educationBinding:{schemaVersion:1 as const,origin,sealed:true as const,manifest}},manifestHash=canonicalHash(publication)
 const binding={schemaVersion:1 as const,compositeId,units,attemptId:parentId,epoch:1,publicationHash:manifestHash,educationComposition:{origin,manifestHash}}
 const slotKeys=[compositeItemSlotKey(cognitiveId,'COGNITIVE'),compositeItemSlotKey(sjtId,'SITUATIONAL')]
 const slots=createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:[
  {slotKey:slotKeys[0],unitType:'COGNITIVE',required:true,sourceDefinitionIdentity:{key:'reaction',version:runtime.instrumentVersion,hash:runtime.sourceDefinitionHash},
   sourceBinding:{compositeItemId:cognitiveId,compiledRuntimeHash:runtime.compiledRuntimeHash,educationBlockId:cognitiveBlock}},
  {slotKey:slotKeys[1],unitType:'SITUATIONAL',required:true,sourceDefinitionIdentity:{key:pkg.key,version:pkg.instrumentVersion,hash:situation.definitionHash},
   sourceBinding:{compositeItemId:sjtId,compiledRuntimeHash:situation.compiledRuntimeHash,educationBlockId:sjtBlock},runtimeIdentity:{instrumentKey:pkg.key,instrumentVersion:pkg.instrumentVersion,
    definitionHash:situation.definitionHash,compiledRuntimeHash:situation.compiledRuntimeHash,scorerKey:situation.scorerKey,scoringVersion:situation.scoringVersion,
    deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',frozenAt:completed.toISOString()}},
 ]})
 const admission=createFrozenUnitAdmission({attemptEpoch:1,cognitive:{testType:'reaction',engineVersion:sessionConfig.engineVersion,scoringVersion:sessionConfig.scoringVersion,configHash:sessionConfig.configHash},
  principal:{userId:actorId},parent:{kind:'composite',parentId,slotKey:slotKeys[0],sourceDefinitionHash:runtime.sourceDefinitionHash,compiledRuntimeHash:runtime.compiledRuntimeHash},frozenAt:completed})
 const metrics=Object.fromEntries(Object.entries(definition.metrics).map(([key,metric])=>[key,metric.valueType==='object'?{'1':2}:metric.valueType==='array'?[2,3]:metric.unit==='ratio'?0.9:350]))
 const score={metrics,quality:{state:qualityState,flags:{},reasons:[]}}
 const report=projectThreeLayerReport({testType:'reaction',configVersion:sessionConfig.configVersion,protocolSignature:sessionConfig.protocolSignature,
  engineVersion:sessionConfig.engineVersion,scoringVersion:sessionConfig.scoringVersion,profile:selectedProfile,definition:frozenReport.v2ReportDefinition!,
  metrics,score:score as any,metricDefinitions:frozenReport.v2MetricDefinitions!,qualityDefinitions:frozenReport.v2QualityDefinitions!,
  participantPresentation:frozenReport.participantPresentation,reportCaveats:frozenReport.reportCaveats,config:freeze.resolvedConfig as Record<string,unknown>})
 const cognitiveResult:CognitiveResultSnapshot={schemaVersion:1,completedAt:completed.toISOString(),testType:'reaction',configVersion:sessionConfig.configVersion,
  engineVersion:sessionConfig.engineVersion,scoringVersion:sessionConfig.scoringVersion,protocolSignature:sessionConfig.protocolSignature,profile:selectedProfile,
  metrics,quality:score.quality,references:[],report:report as unknown as Record<string,unknown>,assessmentContext:null}
 const situationalResult:SituationalResultV1={metrics:pkg.definition.scoring.publishedMetrics.map(metric=>({...metric,value:qualityState==='invalid'?null:1,range:null,
  expectedResponses:['INTERNAL_EXPECTED_RESPONSE'],answeredResponses:['INTERNAL_ANSWERED_RESPONSE'],status:qualityState==='invalid'?'not_calculable':qualityState==='limited'?'limited':'calculated',
  contributions:[{responseKey:'INTERNAL_SCORING_KEY',contribution:1}]})),quality:{status:qualityState,flags:qualityState==='interpretable'?[]:['missing_responses']},
  ...(pkg.definition.report.narrative?{narrative:{version:'sjt-narrative-v1' as const,paragraphs:['Saved native participant narrative.']}}:{})}
 const cognitive:any={id:id(60),userId:actorId,compositeAttemptId:parentId,compositeItemId:cognitiveId,status:'COMPLETED',deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',
  assignmentId,configId,submissionId:id(70),submissionPayloadHash:hash,submittedAt:completed,finishedAt:completed,testType:'reaction',configVersion:sessionConfig.configVersion,
  engineVersion:sessionConfig.engineVersion,scoringVersion:sessionConfig.scoringVersion,compiledRuntimeHash:runtime.compiledRuntimeHash,
  configSnapshotEncrypted:encryptCognitivePayload(sessionConfig),frozenAdmissionSnapshotEncrypted:encryptFrozenUnitAdmission(admission),frozenAdmissionSnapshotHash:admission.snapshotHash,
  assignment:{id:assignmentId,configId,...freezeDataForWrite(freeze),measurementReleaseId:id(50)}}
 const situational:any={id:id(61),userId:actorId,participantKey:getParticipantKey(actorId),surveyAttemptId:null,compositeAttemptId:parentId,compositeItemId:sjtId,compositeSlotKey:slotKeys[1],status:'COMPLETED',deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',
  attemptEpoch:1,submissionId:id(71),submissionPayloadHash:hash,submittedAt:completed,completedAt:completed,totalTime:1200,instrumentKey:pkg.key,instrumentVersion:pkg.instrumentVersion,
  definitionHash:situation.definitionHash,compiledRuntimeHash:situation.compiledRuntimeHash,scorerKey:situation.scorerKey,scoringVersion:situation.scoringVersion,
  frozenAt:completed,runtimeSnapshotEncrypted:encryptFrozenSituationalRuntimeSnapshot(situation)}
 const identity={kind:'COMPOSITION',origin,compositeId,title:'Mixed native SELF',policy:{},binding:{origin,manifestHash,unitReports:manifest.map((block,index)=>({blockId:block.blockId,
  versionId:block.versionId,contentHash:block.contentHash,respondent:{mode:'INDIVIDUAL_SUMMARY',metricKeys:(index===0?cMeasurement:sMeasurement).content.metrics.map((metric:any)=>metric.metricKey),longitudinalMetricKeys:[]}}))},
  manifest:manifest.map(block=>({...block,title:block.kind})),units:units.map((unit,index)=>({itemId:unit.itemId,family:unit.family,scaleId:null,versionId:manifest[index].versionId,contentHash:unit.measurement.contentHash,
   releaseId:unit.measurement.releaseId,definitionHash:index===0?runtime.sourceDefinitionHash:situation.definitionHash,measurementHash:unit.measurement.measurementHash,native:unit.source.educationNative})),identityOnly:true} as unknown as FrozenCompositionIdentity
 const parent:any={id:parentId,attemptEpoch:1,contextSnapshotHash:null,trainingContentBinding:binding,trainingContentBindingHash:canonicalHash(binding),aggregateInputHash:hash,
  trainingReferenceBinding:null,trainingReferenceBindingHash:null}
 const rows:any[]=[],envelopes:any[]=[]
 const measures=[stored(id(49),originalMeasurement),stored(id(50),cMeasurement),stored(id(51),sMeasurement)]
 async function saveFinals(){
  cognitive.resultSnapshotEncrypted=encryptCognitivePayload(cognitiveResult);situational.resultEncrypted=encryptUnifiedRuntimePayload(situationalResult)
  const cCore=projectCognitiveCanonicalUnitResult({snapshot:cognitiveResult,runtime,contextHash:null,referenceBindings:sessionConfig.referenceBindings??[],resolvedConfigHash:freeze.resolvedConfigHash})
  const sCore=projectSituationCanonicalUnitResult({result:situationalResult,runtime:situation.compiledRuntime,contextHash:null})
  if(pkg.online)sCore.quality.flags.push(SJT_ONLINE_PROTOCOL_FLAG)
  envelopes.splice(0,envelopes.length,...[cognitive,situational].map((child,index)=>createCanonicalUnitResultEnvelope({core:index===0?cCore:sCore,completedAt:completed,
   persistenceProvenance:{sourceType:index===0?'COGNITIVE_SESSION':'SITUATIONAL_ATTEMPT',sourceAttemptId:child.id,sourceSubmissionId:child.submissionId},
   bundleBridge:index===0?buildCognitiveBundleBridge(cognitiveResult):{sourceResultHash:canonicalHash(situationalResult),metrics:Object.fromEntries(situationalResult.metrics.map(metric=>[metric.key,metric.value]))}})))
  situational.canonicalResultEncrypted=encryptUnifiedRuntimePayload(envelopes[1])
  rows.splice(0,rows.length,...envelopes.map((envelope,index)=>({id:id(80+index),compositeAttemptId:parentId,attemptEpoch:1,slotKey:slotKeys[index],unitType:envelope.core.unitType,
   terminalState:'COMPLETED',payloadKind:'UNIT_RESULT',...envelope.persistenceProvenance,sourceDefinitionHash:envelope.core.sourceDefinitionHash,
   compiledRuntimeHash:envelope.core.compiledRuntimeHash,completedAt:completed,canonicalResultEncrypted:encryptUnifiedRuntimePayload(envelope)})))
  const interpretation=await interpretContentBinding({binding:{units:units.map(unit=>({...unit,instrumentKey:unit.itemId,references:[]})),populationContext:{}},contentBindingHash:parent.trainingContentBindingHash,
   readRelease:async releaseId=>{const measure=releaseId===id(50)?cMeasurement:sMeasurement;return {...measure,releaseId,status:'PUBLISHED',publishedBy:ownerId,publishedAt:completed}},
   readFacts:unit=>{const envelope=envelopes[units.findIndex(selected=>selected.itemId===unit.itemId)];return {notExecuted:false,quality:envelope.core.quality.status,
    metrics:envelope.core.metrics.map((metric:any)=>({key:metric.key,value:typeof metric.value==='number'?metric.value:null,status:'OK'}))}}})
  const receipt={schemaVersion:1,attemptId:parentId,epoch:1,aggregateInputHash:hash,contentBindingHash:parent.trainingContentBindingHash,generatedAt:completed.toISOString(),
   sources:units.map((unit,index)=>({itemId:unit.itemId,resultHash:envelopes[index].resultHash})),interpretation}
  parent.trainingContentInterpretationEncrypted=encryptUnifiedRuntimePayload(receipt);parent.trainingContentInterpretationHash=canonicalHash(receipt)
  return receipt
 }
 await saveFinals()
 const seal:any={creationKey:educationCompositionKey(origin),creationHash:canonicalHash(origin),manifestHash,origin,units}
 const db={assessmentUnitSnapshot:{findMany:vi.fn(async(args:any)=>rows.filter(row=>args.where.slotKey.in.includes(row.slotKey)))},
  cognitiveSession:{findMany:vi.fn(async(args:any)=>args.where.id.in.includes(cognitive.id)?[cognitive]:[])},situationalAttempt:{findMany:vi.fn(async(args:any)=>args.where.id.in.includes(situational.id)?[situational]:[])},$queryRaw:vi.fn(async(query:any)=>{
   const sql=(query.strings??query).join(' ')
   if(sql.includes('FROM composite_assessments'))return [seal]
   if(sql.includes('FROM measurement_content_releases'))return measures.filter(measure=>(query.values as string[]).includes(measure.id))
   throw new Error('Unexpected source, raw-result or authority query: '+sql)
  })}
 const input={identity,parent,slots,actorUserId:actorId,blockIds:new Set([cognitiveBlock,sjtBlock])}
 return {db,tx:db as unknown as Prisma.TransactionClient,input,identity,parent,slots,seal,units,rows,envelopes,cognitive,situational,
  cognitiveResult,situationalResult,admission,sessionConfig,freeze,measures,saveFinals}
}

describe('ordinary education native stored SELF feedback',()=>{
 it('returns only the saved participant reports and safe SJT fields from exact frozen FINALs',async()=>{
  const f=await fixture();(f.cognitiveResult.report as any).rawTrials=['DO_NOT_EXPORT'];(f.cognitiveResult.report.method as any).exportPermissions=['DO_NOT_EXPORT'];await f.saveFinals()
  const result=await readOrdinaryNativeFeedback(f.tx,f.input),cognitive=result.get(cognitiveId)?.nativeCognitiveReport,sjt=result.get(sjtId)?.nativeSituationalReport
  expect(result.size).toBe(2);expect(cognitive?.method.profile).toBe('experience');expect(cognitive?.profileLabel).toBe((f.cognitiveResult.report as any).profileLabel)
  expect(cognitive?.headline).toEqual((f.cognitiveResult.report as any).headline)
  expect(sjt).toMatchObject({itemId:sjtId,type:'SITUATIONAL',kind:'situational',qualityState:'interpretable'})
  expect(sjt?.metrics.length).toBeGreaterThan(0)
  expect(JSON.stringify([...result.values()])).not.toMatch(/DO_NOT_EXPORT|expectedResponses|answeredResponses|contributions|INTERNAL_|sourceResultHash|rawTrials|exportPermissions/)
  expect(cognitive).not.toHaveProperty('provenance');expect(sjt).not.toHaveProperty('provenance')
  expect(f.db.assessmentUnitSnapshot.findMany).toHaveBeenCalledTimes(1);expect(f.db.cognitiveSession.findMany).toHaveBeenCalledTimes(1);expect(f.db.situationalAttempt.findMany).toHaveBeenCalledTimes(1)
 })
 it('preserves the saved native narrative without returning internal author sums or contribution metadata',async()=>{
  const f=await fixture({narrative:true}),report=(await readOrdinaryNativeFeedback(f.tx,f.input)).get(sjtId)?.nativeSituationalReport
  expect(report?.narrative).toEqual({version:'sjt-narrative-v1',paragraphs:['Saved native participant narrative.']})
  expect(report?.metrics).toEqual([]);expect(report?.metricOrder).toEqual([]);expect(report?.interpretations).toEqual([])
  expect(JSON.stringify(report)).not.toMatch(/contributions|INTERNAL_|modelKey|expertKey|expectedResponses|answeredResponses/)
 })
 it('preserves research as its exact saved participant profile without creating research export rights',async()=>{
  const f=await fixture({profile:'research'}),report=(await readOrdinaryNativeFeedback(f.tx,f.input)).get(cognitiveId)?.nativeCognitiveReport
  expect(report?.method.profile).toBe('research');expect(report?.profileLabel).toBe((f.cognitiveResult.report as any).profileLabel)
  expect(JSON.stringify(report)).not.toMatch(/rawTrials|exportPermissions|resolvedConfig|reportHash|sourceId/)
 })
 it('does not read or decrypt any native child for NONE and reads only allowed blocks',async()=>{
  const empty=await fixture();await expect(readOrdinaryNativeFeedback(empty.tx,{...empty.input,blockIds:new Set()})).resolves.toEqual(new Map())
  expect(empty.db.$queryRaw).not.toHaveBeenCalled();expect(empty.db.cognitiveSession.findMany).not.toHaveBeenCalled();expect(empty.db.situationalAttempt.findMany).not.toHaveBeenCalled()
  const one=await fixture();one.situational.resultEncrypted='BROKEN_BUT_NOT_ALLOWED'
  const result=await readOrdinaryNativeFeedback(one.tx,{...one.input,blockIds:new Set([cognitiveBlock])})
  expect([...result.keys()]).toEqual([cognitiveId]);expect(one.db.situationalAttempt.findMany).not.toHaveBeenCalled()
 })
 it('honors narrower frozen per-unit metric ceilings, including prose and graphics',async()=>{
  const f=await fixture({profile:'standard'})
  f.identity.binding.unitReports[0].respondent.metricKeys=[];f.identity.binding.unitReports[1].respondent.metricKeys=[]
  const result=await readOrdinaryNativeFeedback(f.tx,f.input),cognitive=result.get(cognitiveId)?.nativeCognitiveReport,sjt=result.get(sjtId)?.nativeSituationalReport
  expect(cognitive?.headline).toEqual([]);expect(cognitive?.user).toEqual([]);expect(cognitive?.detail).toEqual([]);expect(cognitive?.reading).toBeUndefined()
  expect(sjt?.metrics).toEqual([]);expect(sjt?.metricOrder).toEqual([]);expect(sjt?.interpretations).toEqual([])
 })
 it.each(['userId','compositeAttemptId','compositeItemId','submissionId','compiledRuntimeHash'] as const)('rejects a Cognitive child with a different %s instead of trusting childId',async field=>{
  const f=await fixture();f.cognitive[field]=id(999)
  await expect(readOrdinaryNativeFeedback(f.tx,f.input)).rejects.toMatchObject({code:'REPORT_NOT_FOUND'})
 })
 it.each(['profile','profileDefinitionVersion','resolvedConfigHash','resolvedReportSnapshotEncrypted','resolvedConfigSnapshotEncrypted'] as const)('requires original Cognitive %s with no standard fallback',async field=>{
  const f=await fixture();f.cognitive.assignment[field]=null
  await expect(readOrdinaryNativeFeedback(f.tx,f.input)).rejects.toMatchObject({code:'REPORT_NOT_FOUND'})
 })
 it('rejects a previous-epoch Cognitive admission and an unbound saved report',async()=>{
  const stale=await fixture(),admission=createFrozenUnitAdmission({...stale.admission,attemptEpoch:2,frozenAt:completed})
  stale.cognitive.frozenAdmissionSnapshotEncrypted=encryptFrozenUnitAdmission(admission);stale.cognitive.frozenAdmissionSnapshotHash=admission.snapshotHash
  await expect(readOrdinaryNativeFeedback(stale.tx,stale.input)).rejects.toMatchObject({code:'REPORT_NOT_FOUND'})
  const changed=await fixture();changed.cognitiveResult.report.title='different saved report';changed.cognitive.resultSnapshotEncrypted=encryptCognitivePayload(changed.cognitiveResult)
  await expect(readOrdinaryNativeFeedback(changed.tx,changed.input)).rejects.toMatchObject({code:'REPORT_NOT_FOUND'})
 })
 it('rejects parent FINAL receipt/core mismatch and a changed sealed source descriptor',async()=>{
  const missing=await fixture();missing.parent.aggregateInputHash='f'.repeat(64)
  await expect(readOrdinaryNativeFeedback(missing.tx,missing.input)).rejects.toThrow()
  const changed=await fixture();changed.seal.units=JSON.parse(JSON.stringify(changed.units));changed.seal.units[0].source.educationNative.reportHash='f'.repeat(64)
  await expect(readOrdinaryNativeFeedback(changed.tx,changed.input)).rejects.toMatchObject({code:'REPORT_NOT_FOUND'})
  expect(changed.db.cognitiveSession.findMany).not.toHaveBeenCalled()
 })
 it('rejects a SJT child from another epoch and a changed saved SJT result',async()=>{
  const stale=await fixture();stale.situational.attemptEpoch=2
  await expect(readOrdinaryNativeFeedback(stale.tx,stale.input)).rejects.toMatchObject({code:'REPORT_NOT_FOUND'})
  const changed=await fixture();changed.situationalResult.metrics[0].value=999;changed.situational.resultEncrypted=encryptUnifiedRuntimePayload(changed.situationalResult)
  await expect(readOrdinaryNativeFeedback(changed.tx,changed.input)).rejects.toMatchObject({code:'REPORT_NOT_FOUND'})
 })
 it('retains native SJT participant pseudonym, frozen generation and Survey-origin exclusion guards',async()=>{
  const wrongParticipant=await fixture();wrongParticipant.situational.participantKey=getParticipantKey(id(999))
  await expect(readOrdinaryNativeFeedback(wrongParticipant.tx,wrongParticipant.input)).rejects.toMatchObject({code:'REPORT_NOT_FOUND'})
  const survey=await fixture();survey.situational.surveyAttemptId=id(999)
  await expect(readOrdinaryNativeFeedback(survey.tx,survey.input)).rejects.toMatchObject({code:'REPORT_NOT_FOUND'})
  const generation=await fixture();generation.situational.frozenAt=new Date(completed.getTime()+1000)
  await expect(readOrdinaryNativeFeedback(generation.tx,generation.input)).rejects.toMatchObject({code:'REPORT_NOT_FOUND'})
 })
 it.each(['limited','invalid'] as const)('keeps saved %s quality and withholds SJT interpretation text',async state=>{
  const f=await fixture({quality:state}),result=await readOrdinaryNativeFeedback(f.tx,f.input),sjt=result.get(sjtId)?.nativeSituationalReport,cognitive=result.get(cognitiveId)?.nativeCognitiveReport
  expect(cognitive?.qualityState).toBe(state);expect(sjt?.qualityState).toBe(state);expect(sjt?.qualityFlags).toContain('missing_responses');expect(sjt?.interpretations).toEqual([])
  if(state==='invalid')expect(sjt?.metrics.every(metric=>metric.value===null&&metric.status==='not_calculable')).toBe(true)
 })
 it('reads the exact saved online protocol and published measurement after retirement without selecting latest or scoring',async()=>{
  const f=await fixture({online:true});f.measures.forEach(measure=>{measure.status='RETIRED'})
  const report=(await readOrdinaryNativeFeedback(f.tx,f.input)).get(sjtId)?.nativeSituationalReport
  expect(report?.instrumentVersion).toBe(f.situational.instrumentVersion);expect(report?.metrics).toEqual([]);expect(report?.interpretations).toEqual([])
  expect(report?.narrative).toBeUndefined();expect(JSON.stringify(report)).not.toMatch(/contributions|INTERNAL_|modelKey|expertKey/)
  expect(f.db.$queryRaw.mock.calls.every(([query])=>!/(sjt_author_releases|cognitive_test_configs|raw_submissions|trials|courses|grants)/.test((query.strings??query).join(' ')))).toBe(true)
 })
 it('withholds only Cognitive when its frozen original or profile M is revoked, without decrypting its result',async()=>{
  for(const releaseId of [id(49),id(50)]){
   const f=await fixture();f.measures.find(measure=>measure.id===releaseId)!.status='REVOKED';f.cognitive.resultSnapshotEncrypted='WITHDRAWN_NO_DECRYPT'
   const result=await readOrdinaryNativeFeedback(f.tx,f.input)
   expect([...result.keys()]).toEqual([sjtId]);expect(f.db.cognitiveSession.findMany).not.toHaveBeenCalled()
   expect(result.get(sjtId)?.nativeSituationalReport).toBeDefined()
  }
 })
 it('withholds only a revoked SJT M and keeps the exact completed Cognitive participant report',async()=>{
  const f=await fixture();f.measures.find(measure=>measure.id===id(51))!.status='REVOKED';f.situational.resultEncrypted='WITHDRAWN_NO_DECRYPT'
  const result=await readOrdinaryNativeFeedback(f.tx,f.input)
  expect([...result.keys()]).toEqual([cognitiveId]);expect(f.db.situationalAttempt.findMany).not.toHaveBeenCalled()
  expect(result.get(cognitiveId)?.nativeCognitiveReport?.method.profile).toBe('experience')
 })
 it('returns frozen scientific metadata and report limitations without consulting current catalog metadata',async()=>{
  const original=scientificMaturity.resolveSituationalScientificContext(installedPackage)!
  const frozenContext:SituationalScientificContextV1={...original,governanceRevision:1,evidenceDigest:'b'.repeat(64),
   scope:{language:'zh-CN',population:'Frozen SELF population',use:'Frozen descriptive use',claim:'Frozen interpretation boundary'}}
  const f=await fixture({frozenScientificContext:frozenContext})
  const currentScience=vi.spyOn(scientificMaturity,'resolveSituationalScientificContext').mockReturnValue({...original,governanceRevision:99,evidenceDigest:'c'.repeat(64)})
  const currentPackage=vi.spyOn(situationRegistry,'getSituationPackage')
  try{
   const report=(await readOrdinaryNativeFeedback(f.tx,{...f.input,blockIds:new Set([sjtBlock])})).get(sjtId)?.nativeSituationalReport
   expect(report?.scientificContext).toEqual({...frozenContext,provenance:'FROZEN'})
   expect(report?.limitations).toEqual(installedPackage.definition.report.limitations)
   expect(report?.disclaimer).toBe(installedPackage.definition.report.disclaimer)
   expect(report?.limitations).not.toContain('CURRENT_CATALOG_LIMITATION')
   expect(currentScience).not.toHaveBeenCalled();expect(currentPackage).not.toHaveBeenCalled()
   expect(report?.scientificContext).not.toHaveProperty('evidence');expect(report?.scientificContext).not.toHaveProperty('modelEvidence')
  }finally{currentScience.mockRestore();currentPackage.mockRestore()}
 })
})
