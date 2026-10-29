import type {Prisma} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {compositeItemSlotKey,parseFrozenActiveSlotSet,type loadFrozenActiveSlotSet} from '../assessment-runtime/slot-set'
import {loadStoredCanonicalUnitResults} from '../assessment-runtime/compact-assessment-storage'
import {loadSharedCognitiveRuntime} from '../assessment-runtime/shared-cognitive-runtime'
import {loadStoredUnitAdmission} from '../assessment-runtime/unit-admission'
import {decryptUnifiedRuntimePayload} from '../assessment-runtime/security'
import {getParticipantKey} from '../assessment-runtime/participant-key'
import {decryptFrozenSituationalRuntimeSnapshot} from '../assessment-runtime/situational-runtime-snapshot'
import {projectCognitiveCanonicalUnitResult,projectSituationCanonicalUnitResult} from '../assessment-runtime/unit-result'
import {decryptCognitivePayload} from '../cognitive/cognitive.security'
import {hashResolvedConfig,readFrozenReport,type FrozenReportSnapshot} from '../cognitive/profile-freeze'
import {parseCognitiveResultSnapshot} from '../cognitive/v2/result-snapshot'
import type {ThreeLayerReport} from '../cognitive/v2/report'
import type {CognitiveResultSnapshot} from '../cognitive/v2/types'
import {trainingBoundContent} from '../composite/training-reference-binding'
import {decodeTrainingFinalReceipt} from '../composite/training-content-final'
import {getContentReleaseBatch} from '../measurement-content/repository'
import {prepareRelease} from '../measurement-content/release'
import {sjtMeasurementRelease} from '../measurement-content/sjt'
import {readSealedCompositionContent} from '../education-tools/private-tool.composition-content'
import {educationNativeDescriptorSchema} from '../education-tools/native-source.contracts'
import {SJT_ONLINE_PROTOCOL_FLAG,SJT_ONLINE_UNSATISFIED_FLAG} from '../situational/situational-task-satisfaction'
import {frozenSituationalScientificProjection} from '../situational/onboarding/scientific-schema'
import type {SituationalResultV1} from '../situational/situation-scoring'
import type {FrozenCompositionIdentity} from '../assessment-run/educationCompositionExecution'
import type {OrdinaryStoredContent} from './education-ordinary-declared-feedback'
import {reportingFail} from './types'

const text=z.string(),strings=z.array(text),number=z.number().finite(),quality=z.enum(['interpretable','limited','invalid'])
const profile=z.enum(['experience','standard','research'])
const metricValue=z.union([number,z.boolean(),text,z.null(),z.array(number.nullable()),z.record(text,number.nullable())])
const metric=z.object({key:text,label:text,category:text,direction:z.enum(['higher_is_better','lower_is_better','target_range','descriptive','signed']),
 unit:z.enum(['ms','ratio','count','d-prime','level','score','map']),value:metricValue,formatted:text,
 presentationVersion:text.optional(),participantLabel:text.optional(),explanation:text.optional()})
const readingSchema=z.object({schemaVersion:z.literal(2),reportVersion:text,presentationVersion:text,title:text,introduction:text,
 illustration:z.enum(['signal','sequence','stop','rules']).optional(),
 interpretation:z.object({state:z.enum(['available','qualified','withheld']),reasons:strings,withheldMetricKeys:strings}),
 feedback:z.object({summary:text,evidenceMetricKeys:strings,nextStep:text}),caveats:strings,methodCaveats:strings.optional(),
 visuals:z.array(z.object({kind:z.enum(['reaction_trials','memory_lengths','metrics']),title:text,unit:text,
  points:z.array(z.object({label:text,value:number.nullable(),status:z.enum(['recorded','missing']).optional()})),caption:text})),
 popular:z.object({conceptTitle:text,concept:text,takeaway:text,exampleTitle:text,example:text,scene:z.enum(['signal','sequence','stop','rules']),
  frames:z.array(z.object({title:text,text})),boundary:text,metricHelp:z.record(text,z.object({label:text,explanation:text}))}).optional(),
 professional:z.object({construct:text,procedure:text,interpretation:text,confounders:strings,parameters:z.array(z.object({label:text,value:text})),
  metrics:z.array(z.object({key:text,label:text,formatted:text,unit:text,definition:text,readingHint:text})),
  quality:z.array(z.object({key:text,label:text,active:z.boolean(),description:text,effect:text})),
  withheld:z.array(z.object({key:text,label:text,reasons:strings}))}).optional()})
const cognitiveReportSchema=z.object({schemaVersion:z.literal(2).optional(),reading:readingSchema.optional(),title:text,profileLabel:text.nullable(),
 qualityState:quality,conclusion:text,headline:z.array(metric),user:z.array(metric),detail:z.array(metric),
 quality:z.array(z.object({key:text,label:text,active:z.boolean(),effect:z.enum(['none','limited','invalid'])})),
 method:z.object({testType:text,engineVersion:text,scoringVersion:text,configVersion:text,protocolSignature:text,profile:profile.nullable()}),
 disclaimer:text,practicalTips:strings})
const precision=z.object({status:z.enum(['NOT_ESTIMATED','ESTIMATED']),standardError:number.nullable(),
 interval:z.object({lower:number,upper:number,level:number,kind:z.enum(['CONFIDENCE','CREDIBLE'])}).nullable()})
const situationalMetric=z.object({key:text,value:number.nullable(),label:text,construct:text,channelKey:text,displayPrecision:z.number().int().nonnegative(),
 range:z.object({min:number,max:number}).nullable(),status:z.enum(['calculated','limited','not_calculable']),precision:precision.optional(),
 coverage:z.object({numberOfOpportunities:number,numberOfAnsweredOpportunities:number,numberOfIndependentScenes:number}).optional(),
 maturity:z.enum(['PROVISIONAL','CALIBRATED']).optional()})
/** Mirrors the participant card's display fields. No definition, scene/response
 * identity, per-answer contribution, answer key or research export material. */
export type OrdinaryNativeSituationalReport={itemId:string;type:'SITUATIONAL';kind:'situational';label:string;
 instrumentKey:string;instrumentVersion:string;scoringVersion:string;metrics:Array<z.infer<typeof situationalMetric>>;
 metricOrder:string[];interpretations:Array<{metricKey:string;headline:string;summary:string}>;disclaimer:string;
 scientificContext:ReturnType<typeof frozenSituationalScientificProjection>;limitations:string[];
 qualityState:'interpretable'|'limited'|'invalid';qualityFlags:string[];completedAt:string;totalTime:number|null;
 narrative?:{version:'sjt-narrative-v1';paragraphs:string[]}}
export type OrdinaryNativeFeedback={nativeCognitiveReport?:ThreeLayerReport;nativeSituationalReport?:OrdinaryNativeSituationalReport}
type Input={identity:FrozenCompositionIdentity;parent:OrdinaryStoredContent&{id:string;attemptEpoch:number;contextSnapshotHash:string|null};
 slots:Awaited<ReturnType<typeof loadFrozenActiveSlotSet>>;actorUserId:string;blockIds:ReadonlySet<string>}
function hidden():never{return reportingFail('REPORT_NOT_FOUND','reporting resource not found',404)}
function decode<T>(read:()=>T):T{try{return read()}catch{return hidden()}}
const equal=(a:unknown,b:unknown)=>a===undefined||b===undefined?a===b:canonicalHash(a)===canonicalHash(b)
const iso=(value:Date|string|null|undefined)=>value?new Date(value).toISOString():null

/** Consume the saved participant report, never generate one from raw metrics or
 * substitute the current registry/profile. The native FINAL bridge binds the
 * complete saved snapshot, including its quality-limited report. */
function cognitiveReport(snapshot:CognitiveResultSnapshot,frozen:FrozenReportSnapshot,allowed:ReadonlySet<string>):ThreeLayerReport{
 const report=decode(()=>cognitiveReportSchema.parse(snapshot.report))
 if(report.qualityState!==snapshot.quality.state||!equal(report.method,{testType:snapshot.testType,engineVersion:snapshot.engineVersion,
  scoringVersion:snapshot.scoringVersion,configVersion:snapshot.configVersion,protocolSignature:snapshot.protocolSignature,profile:snapshot.profile}))hidden()
 const shown=[...report.headline,...report.user,...report.detail],definitions=frozen.v2MetricDefinitions
 if(!definitions)hidden()
 for(const item of shown){
  const definition=definitions[item.key]
  if(!definition||!snapshot.profile||!definition.availableProfiles.includes(snapshot.profile)||definition.role==='research_only'
   ||['research_only','hidden'].includes(definition.visibility)||frozen.participantPresentation?.hiddenMetrics.includes(item.key)
   ||definition.requiresQualityFlags?.some(flag=>snapshot.quality.flags[flag])
   ||!Object.prototype.hasOwnProperty.call(snapshot.metrics,item.key)||!equal(item.value,snapshot.metrics[item.key]))hidden()
 }
 const readingKeys=report.reading?.feedback.evidenceMetricKeys??[]
 const narrowed=shown.some(item=>!allowed.has(item.key))||readingKeys.some(key=>!allowed.has(key))
 report.headline=report.headline.filter(item=>allowed.has(item.key))
 report.user=report.user.filter(item=>allowed.has(item.key));report.detail=report.detail.filter(item=>allowed.has(item.key))
 if(narrowed){
  // Saved prose/graphs have no independent per-metric identity. Do not expose a
  // removed metric through its summary while retaining the allowed rows.
  delete report.reading;report.conclusion='仅展示本次获准开放的指标，请结合数据质量提示阅读。';report.practicalTips=[]
 }else if(report.reading){
  report.reading.interpretation.withheldMetricKeys=report.reading.interpretation.withheldMetricKeys.filter(key=>allowed.has(key))
  if(report.reading.popular)report.reading.popular.metricHelp=Object.fromEntries(Object.entries(report.reading.popular.metricHelp).filter(([key])=>allowed.has(key)))
  if(report.reading.professional){
   report.reading.professional.metrics=report.reading.professional.metrics.filter(item=>allowed.has(item.key))
   report.reading.professional.withheld=report.reading.professional.withheld.filter(item=>allowed.has(item.key))
  }
 }
 return report
}

/** Already authorized SELF + frozen per-block INDIVIDUAL_SUMMARY only. The
 * caller owns current organization/Run/report-deny checks and their final fence.
 * This helper verifies immutable source/attempt/FINAL correspondence afresh. */
export async function readOrdinaryNativeFeedback(tx:Prisma.TransactionClient,input:Input):Promise<Map<string,OrdinaryNativeFeedback>>{
 const output=new Map<string,OrdinaryNativeFeedback>()
 if(!input.blockIds.size)return output
 const {identity}=input,parent={...input.parent,compositeAssessmentId:identity.compositeId}
 if(!['STUDENT:SELF','TEACHER:SELF'].includes(identity.origin.variantKey)||!input.actorUserId)hidden()
 const slots=decode(()=>parseFrozenActiveSlotSet(input.slots)),binding=trainingBoundContent(parent),receipt=decodeTrainingFinalReceipt(parent)
 if(!binding||!receipt||!binding.educationComposition||slots.attemptEpoch!==parent.attemptEpoch
  ||binding.publicationHash!==identity.binding.manifestHash||!equal(binding.educationComposition,{origin:identity.origin,manifestHash:identity.binding.manifestHash}))hidden()
 const sealed=await readSealedCompositionContent(tx,{compositeId:identity.compositeId,ownerId:identity.origin.ownerUserId,anchor:binding.educationComposition})
 const blocks=identity.manifest.filter(block=>input.blockIds.has(block.blockId))
 if(blocks.length!==input.blockIds.size)hidden()
 const selected=blocks.map(block=>{
  const unit=binding.units.find(unit=>unit.itemId===block.itemIds[0]),actual=unit&&sealed.units.get(unit.itemId)
  const ceiling=identity.binding.unitReports.find(rule=>rule.blockId===block.blockId),header=identity.units.find(unit=>unit.itemId===block.itemIds[0])
  if(!['COGNITIVE','SJT'].includes(block.kind)||block.itemIds.length!==1||block.sectionIds.length||!unit||!actual||!equal(unit,actual)
   ||!ceiling||ceiling.versionId!==block.versionId||ceiling.contentHash!==block.contentHash||ceiling.respondent.mode!=='INDIVIDUAL_SUMMARY'
   ||!header||header.family!==block.kind||header.releaseId!==unit.measurement.releaseId||header.contentHash!==unit.measurement.contentHash
   ||header.measurementHash!==unit.measurement.measurementHash||header.versionId!==block.versionId)hidden()
  const descriptor=decode(()=>educationNativeDescriptorSchema.parse(unit.source.educationNative))
  if(descriptor.provider!==block.sourceProvider||descriptor.sourceId!==block.versionId||descriptor.contentHash!==block.contentHash
   ||!header.native||!equal(descriptor,header.native)||unit.family!==block.kind||unit.source.id!==block.versionId)hidden()
  const unitType=unit.family==='SJT'?'SITUATIONAL' as const:'COGNITIVE' as const,slotKey=compositeItemSlotKey(unit.itemId,unitType)
  const slot=slots.slots.find(slot=>slot.slotKey===slotKey)
  if(!slot||slot.unitType!==unitType||slot.sourceBinding.compositeItemId!==unit.itemId||slot.sourceBinding.educationBlockId!==block.blockId)hidden()
  return {block,unit,descriptor,ceiling,slot,slotKey,unitType}
 })
 // The profile M and its original config M are separate frozen identities.
 // Historical reads retain both; a revoked original cannot be laundered through
 // an otherwise intact private profile M. Withhold just that unit before any
 // child result decryption, without rechecking current U or publication state.
 const releases=await getContentReleaseBatch(tx,selected.flatMap(item=>[item.unit.measurement.releaseId,
  ...(item.descriptor.provider==='COGNITIVE_CONFIG'?[item.descriptor.sourceMeasurementReleaseId]:[])]))
 const expected=selected.filter(item=>{
  const measurement=releases.get(item.unit.measurement.releaseId)
  if(!measurement||measurement.layer!=='MEASUREMENT'||measurement.family!==item.unit.family
   ||measurement.contentHash!==item.unit.measurement.contentHash||measurement.content.measurementHash!==item.unit.measurement.measurementHash)hidden()
  if(item.descriptor.provider==='COGNITIVE_CONFIG'){
   const original=releases.get(item.descriptor.sourceMeasurementReleaseId)
   if(!original||original.layer!=='MEASUREMENT'||original.family!=='COGNITIVE'||original.scope.kind!=='PLATFORM'
    ||original.contentHash!==item.descriptor.contentHash)hidden()
   if(original.status==='REVOKED')return false
  }
  return measurement.status!=='REVOKED'
 })
 if(!expected.length)return output
 const finals=await tx.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:parent.id,attemptEpoch:parent.attemptEpoch,
  slotKey:{in:expected.map(item=>item.slotKey)}}})
 if(finals.length!==expected.length||new Set(finals.map(row=>row.slotKey)).size!==expected.length)hidden()
 for(const row of finals){
  const item=expected.find(item=>item.slotKey===row.slotKey)
  if(!item||row.compositeAttemptId!==parent.id||row.attemptEpoch!==parent.attemptEpoch||row.terminalState!=='COMPLETED'
   ||row.payloadKind!=='UNIT_RESULT'||!row.canonicalResultEncrypted||!row.sourceSubmissionId||!row.compiledRuntimeHash
   ||row.unitType!==item.unitType||row.sourceDefinitionHash!==item.slot.sourceDefinitionIdentity.hash
   ||row.compiledRuntimeHash!==item.slot.sourceBinding.compiledRuntimeHash
   ||row.sourceType!==(item.unitType==='COGNITIVE'?'COGNITIVE_SESSION':'SITUATIONAL_ATTEMPT'))hidden()
 }
 const cognitiveIds=finals.filter(row=>row.unitType==='COGNITIVE').map(row=>row.sourceAttemptId),sjtIds=finals.filter(row=>row.unitType==='SITUATIONAL').map(row=>row.sourceAttemptId)
 const children=cognitiveIds.length?await tx.cognitiveSession.findMany({where:{id:{in:cognitiveIds},compositeAttemptId:parent.id,userId:input.actorUserId,status:'COMPLETED'},select:{
  id:true,userId:true,compositeAttemptId:true,compositeItemId:true,assignmentId:true,configId:true,status:true,deliveryMode:true,runtimeGeneration:true,
  submissionId:true,submissionPayloadHash:true,submittedAt:true,finishedAt:true,testType:true,configVersion:true,engineVersion:true,scoringVersion:true,
  compiledRuntimeHash:true,resultSnapshotEncrypted:true,configSnapshotEncrypted:true,frozenAdmissionSnapshotEncrypted:true,frozenAdmissionSnapshotHash:true,
  assignment:{select:{id:true,configId:true,profile:true,profileDefinitionVersion:true,resolvedConfigHash:true,resolvedConfigSnapshotEncrypted:true,
   resolvedReportSnapshotEncrypted:true,measurementReleaseId:true}}}}):[]
 const situations=sjtIds.length?await tx.situationalAttempt.findMany({where:{id:{in:sjtIds},compositeAttemptId:parent.id,userId:input.actorUserId,status:'COMPLETED'},select:{
  id:true,userId:true,participantKey:true,surveyAttemptId:true,compositeAttemptId:true,compositeItemId:true,compositeSlotKey:true,status:true,deliveryMode:true,runtimeGeneration:true,attemptEpoch:true,
  submissionId:true,submissionPayloadHash:true,submittedAt:true,completedAt:true,totalTime:true,instrumentKey:true,instrumentVersion:true,definitionHash:true,
  compiledRuntimeHash:true,scorerKey:true,scoringVersion:true,frozenAt:true,runtimeSnapshotEncrypted:true,resultEncrypted:true,canonicalResultEncrypted:true}}):[]
 if(children.length!==cognitiveIds.length||situations.length!==sjtIds.length||new Set(children.map(child=>child.id)).size!==children.length
  ||new Set(situations.map(child=>child.id)).size!==situations.length||situations.some(child=>!child.canonicalResultEncrypted))hidden()
 const envelopes=await loadStoredCanonicalUnitResults([...finals.map(row=>row.canonicalResultEncrypted!),...situations.map(child=>child.canonicalResultEncrypted!)],tx)
 for(const item of expected){
  const index=finals.findIndex(row=>row.slotKey===item.slotKey),row=finals[index],envelope=envelopes[index],core=envelope?.core
  const source=receipt.sources.find(source=>source.itemId===item.unit.itemId),measurement=releases.get(item.unit.measurement.releaseId)
  if(!core||core.unitType!==item.unitType||core.sourceDefinitionHash!==row.sourceDefinitionHash||core.compiledRuntimeHash!==row.compiledRuntimeHash
   ||core.instrumentKey!==item.slot.sourceDefinitionIdentity.key||core.instrumentVersion!==item.slot.sourceDefinitionIdentity.version
   ||core.contextHash!==parent.contextSnapshotHash||envelope.persistenceProvenance.sourceType!==row.sourceType
   ||envelope.persistenceProvenance.sourceAttemptId!==row.sourceAttemptId||envelope.persistenceProvenance.sourceSubmissionId!==row.sourceSubmissionId
   ||iso(row.completedAt)!==iso(envelope.completedAt)||!source||source.resultHash!==envelope.resultHash||!envelope.bundleBridge
   ||!measurement||measurement.layer!=='MEASUREMENT'||measurement.family!==item.unit.family
   ||measurement.contentHash!==item.unit.measurement.contentHash||measurement.content.measurementHash!==item.unit.measurement.measurementHash)hidden()
  const allowed=new Set(item.ceiling.respondent.metricKeys)
  if(item.descriptor.provider==='COGNITIVE_CONFIG'){
   const descriptor=item.descriptor,child=children.find(child=>child.id===row.sourceAttemptId),assignment=child?.assignment
   if(!child||child.userId!==input.actorUserId||child.compositeAttemptId!==parent.id||child.compositeItemId!==item.unit.itemId||child.status!=='COMPLETED'
    ||child.deliveryMode!=='FINAL_ONLY'||child.runtimeGeneration!=='UNIFIED_V1'||child.submissionId!==row.sourceSubmissionId||!child.submissionPayloadHash||!child.submittedAt
    ||child.compiledRuntimeHash!==row.compiledRuntimeHash||!child.resultSnapshotEncrypted||!child.configSnapshotEncrypted
    ||!assignment||child.assignmentId!==item.unit.source.assignmentId||assignment.id!==child.assignmentId||assignment.configId!==descriptor.sourceId||child.configId!==descriptor.sourceId
    ||assignment.measurementReleaseId!==measurement.releaseId||assignment.profile!==descriptor.profile||assignment.profileDefinitionVersion!==descriptor.profileDefinitionVersion
    ||assignment.resolvedConfigHash!==descriptor.resolvedConfigHash||!assignment.resolvedConfigSnapshotEncrypted||!assignment.resolvedReportSnapshotEncrypted)hidden()
   const frozen=decode(()=>readFrozenReport(assignment.resolvedReportSnapshotEncrypted))
   const frozenConfig=decode(()=>decryptCognitivePayload(assignment.resolvedConfigSnapshotEncrypted!))
   if(!frozen||!frozen.v2ReportDefinition||!frozen.v2MetricDefinitions||!frozen.v2QualityDefinitions||!frozen.participantPresentation
    ||frozen.profile!==descriptor.profile||frozen.profileDefinitionVersion!==descriptor.profileDefinitionVersion||!equalHash(frozen,descriptor.reportHash)
    ||hashResolvedConfig(frozenConfig)!==descriptor.resolvedConfigHash||measurement.scope.kind!=='PRIVATE'||measurement.scope.product!==identity.origin.entry
    ||measurement.scope.ownerId!==identity.origin.ownerUserId||measurement.scope.resourceId!==assignment.id
    ||!equal(measurement.provenance.educationNative,descriptor)||measurement.provenance.configId!==descriptor.sourceId||measurement.provenance.assignmentId!==assignment.id)hidden()
   const stored=await loadSharedCognitiveRuntime(child.configSnapshotEncrypted,tx),snapshot=decode(()=>parseCognitiveResultSnapshot(decryptCognitivePayload(child.resultSnapshotEncrypted!)))
   const config=stored.snapshot,runtime=stored.compiledRuntime,admission=await loadStoredUnitAdmission(child,'Report admission unavailable',tx)
   if(!config||!runtime||config.runtimeGeneration!=='UNIFIED_V1'||config.configHash!==descriptor.resolvedConfigHash||!equal(config.config,frozenConfig)
    ||runtime.compiledRuntimeHash!==row.compiledRuntimeHash||runtime.sourceDefinitionHash!==row.sourceDefinitionHash
    ||config.testType!==child.testType||config.engineVersion!==child.engineVersion||config.scoringVersion!==child.scoringVersion||config.configVersion!==child.configVersion
    ||snapshot.testType!==config.testType||snapshot.engineVersion!==config.engineVersion||snapshot.scoringVersion!==config.scoringVersion||snapshot.configVersion!==config.configVersion
    ||snapshot.protocolSignature!==config.protocolSignature||snapshot.profile!==descriptor.profile||iso(snapshot.completedAt)!==iso(child.finishedAt)
    ||iso(snapshot.completedAt)!==iso(envelope.completedAt)||(snapshot.assessmentContext?.snapshotHash??null)!==parent.contextSnapshotHash
    ||!admission||admission.attemptEpoch!==parent.attemptEpoch||admission.principal.userId!==input.actorUserId||admission.contextSnapshotHash!==parent.contextSnapshotHash
    ||admission.parent?.kind!=='composite'||admission.parent.parentId!==parent.id||admission.parent.slotKey!==item.slotKey
    ||admission.parent.sourceDefinitionHash!==row.sourceDefinitionHash||admission.parent.compiledRuntimeHash!==row.compiledRuntimeHash
    ||admission.cognitive?.configHash!==config.configHash||admission.cognitive.testType!==config.testType||admission.cognitive.engineVersion!==config.engineVersion||admission.cognitive.scoringVersion!==config.scoringVersion
    ||!equalHash(snapshot,envelope.bundleBridge.sourceResultHash))hidden()
   const {report:_report,...measurementConfig}=config.config as Record<string,unknown>,executable=measurement.content.executable
   if(executable.testType!==config.testType||executable.engineVersion!==config.engineVersion||executable.scoringVersion!==config.scoringVersion
    ||measurement.content.instrumentVersion!==config.configVersion||measurement.content.scoringVersion!==config.scoringVersion
    ||!equal(executable.config,measurementConfig))hidden()
   const projected=projectCognitiveCanonicalUnitResult({snapshot,runtime,contextHash:parent.contextSnapshotHash,
    referenceBindings:config.referenceBindings??[],resolvedConfigHash:descriptor.resolvedConfigHash})
   if(!equal(projected,core))hidden()
   output.set(item.unit.itemId,{nativeCognitiveReport:cognitiveReport(snapshot,frozen,allowed)})
  }else{
   const child=situations.find(child=>child.id===row.sourceAttemptId),childIndex=situations.findIndex(child=>child.id===row.sourceAttemptId)
   if(!child||child.userId!==input.actorUserId||child.participantKey!==getParticipantKey(input.actorUserId)||child.surveyAttemptId!==null
    ||child.compositeAttemptId!==parent.id||child.compositeItemId!==item.unit.itemId||child.compositeSlotKey!==item.slotKey
    ||child.status!=='COMPLETED'||child.deliveryMode!=='FINAL_ONLY'||child.runtimeGeneration!=='UNIFIED_V1'||child.attemptEpoch!==parent.attemptEpoch
    ||child.submissionId!==row.sourceSubmissionId||!child.submissionPayloadHash||!child.submittedAt||!child.completedAt||!child.resultEncrypted
    ||child.definitionHash!==row.sourceDefinitionHash||child.compiledRuntimeHash!==row.compiledRuntimeHash||iso(child.completedAt)!==iso(envelope.completedAt)
    ||!equal(envelopes[finals.length+childIndex],envelope)||measurement.contentHash!==item.descriptor.contentHash)hidden()
   const frozen=decode(()=>decryptFrozenSituationalRuntimeSnapshot(child.runtimeSnapshotEncrypted)),result=decode(()=>decryptUnifiedRuntimePayload<SituationalResultV1>(child.resultEncrypted!))
   if(iso(child.frozenAt)!==frozen.frozenAt||item.slot.runtimeIdentity?.frozenAt!==frozen.frozenAt
    ||frozen.definitionHash!==child.definitionHash||frozen.compiledRuntimeHash!==child.compiledRuntimeHash||frozen.instrumentKey!==child.instrumentKey
    ||frozen.instrumentVersion!==child.instrumentVersion||frozen.scorerKey!==child.scorerKey||frozen.scoringVersion!==child.scoringVersion
    ||item.unit.source.instrumentKey!==child.instrumentKey||item.unit.source.instrumentVersion!==child.instrumentVersion
    ||!equalHash(result,envelope.bundleBridge.sourceResultHash))hidden()
   if(!['participant_self_report',identity.origin.entry==='TEACHER'?'teacher_self_report':'student_self_report'].includes(frozen.definition.respondentType))hidden()
   const expected=prepareRelease(sjtMeasurementRelease({localId:child.instrumentKey,version:measurement.version,instrumentVersion:child.instrumentVersion,
    definition:frozen.definition,...(frozen.online?{onlineProtocol:frozen.online}:{}),scope:measurement.scope,provenance:measurement.provenance}))
   if(expected.contentHash!==measurement.contentHash)hidden()
   const projected=projectSituationCanonicalUnitResult({result,runtime:frozen.compiledRuntime,contextHash:parent.contextSnapshotHash})
   if(frozen.online){
    if(!core.quality.flags.includes(SJT_ONLINE_PROTOCOL_FLAG))hidden()
    projected.quality.flags.push(...core.quality.flags.filter(flag=>[SJT_ONLINE_PROTOCOL_FLAG,SJT_ONLINE_UNSATISFIED_FLAG].includes(flag)))
    projected.quality.flags.sort()
   }
   if(!equal(projected,core))hidden()
   // Narrative participant reports never turn the internal author sums into a
   // score report. Online AUTHOR_KEY_SUM without a saved participant narrative
   // likewise has no individual numeric-report contract in this entry.
   const narrativeOnly=Boolean(frozen.definition.report.narrative||result.narrative
    ||frozen.online&&frozen.definition.scoring.model?.modelKey==='AUTHOR_KEY_SUM')
   const metrics=decode(()=>z.array(situationalMetric).parse(result.metrics)).filter(metric=>!narrativeOnly&&allowed.has(metric.key))
   const interpretations=frozen.definition.report.interpretations.filter(interpretation=>result.quality.status==='interpretable'
    &&metrics.some(metric=>metric.key===interpretation.metricKey&&metric.status==='calculated'&&metric.value!==null))
    .map(({metricKey,headline,summary})=>({metricKey,headline,summary}))
   const report:OrdinaryNativeSituationalReport={itemId:item.unit.itemId,type:'SITUATIONAL',kind:'situational',label:item.block.title,
    instrumentKey:child.instrumentKey,instrumentVersion:child.instrumentVersion,scoringVersion:child.scoringVersion,metrics,
    metricOrder:frozen.definition.report.metricOrder.filter(key=>!narrativeOnly&&allowed.has(key)),interpretations,disclaimer:frozen.definition.report.disclaimer,
    scientificContext:frozenSituationalScientificProjection(frozen.scientificContext),limitations:[...frozen.definition.report.limitations],
    qualityState:result.quality.status,qualityFlags:[...result.quality.flags],completedAt:child.completedAt.toISOString(),totalTime:child.totalTime}
   if(frozen.definition.report.narrative&&!result.narrative)hidden()
   if(result.narrative){
    if(!frozen.definition.report.narrative)hidden()
    report.narrative=decode(()=>z.object({version:z.literal('sjt-narrative-v1'),paragraphs:strings}).parse(result.narrative))
   }
   output.set(item.unit.itemId,{nativeSituationalReport:report})
  }
 }
 return output
}
function equalHash(value:unknown,hash:string){return canonicalHash(value)===hash}
