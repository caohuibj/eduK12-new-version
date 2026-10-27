import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { createCanonicalUnitResultEnvelope, type CanonicalUnitResultCoreV1 } from '../../modules/assessment-runtime/unit-result'
import { compositeItemSlotKey, createFrozenActiveSlotSet } from '../../modules/assessment-runtime/slot-set'
import { encryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { resultAudiences, type ResultDisclosureContractV1 } from '../../modules/assessment-policy/result-disclosure'
import { prepareRelease } from '../../modules/measurement-content/release'
import type { StoredRelease } from '../../modules/measurement-content/repository'
import { interpretContentBinding } from '../../modules/measurement-content/final-interpretation'
import type { TrainingFinalReceipt } from '../../modules/composite/training-content-final'
import type { TrainingContentSnapshot } from '../../modules/composite/training-content-binding'
import { educationAssessmentOriginSchema, educationAssessmentResourceKey, type EducationAssessmentOrigin } from '../../modules/education-tools/assessment-resource.contract'
import { draftEducationAssessmentEntry } from '../../modules/education-tools/assessment-resource.contract'

const hash='a'.repeat(64)
const uid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
export async function educationReportFixture(product:'SCHOOL'|'TEACHER'='SCHOOL',families:Array<'SCALE'|'COGNITIVE'|'SJT'>=['COGNITIVE']){
  const candidate={schemaVersion:1,adapterVersion:'1.0.0',resourceId:uid(1),organizationId:uid(2),product,
    family:families.length>1?'BUNDLE':families[0]==='SJT'?'SITUATIONAL':'COGNITIVE',sourceCompositeId:uid(3),runtimeCompositeId:uid(4),
    sourceSnapshotHash:hash,runtimeSnapshotHash:hash,runtimeDefinitionHash:hash,units:[] as EducationAssessmentOrigin['units']}
  // Compatible with root's additive source field without modifying its module.
  if(!('runtimeDefinitionHash' in educationAssessmentOriginSchema.shape))delete (candidate as {runtimeDefinitionHash?:string}).runtimeDefinitionHash
  const origin=candidate as EducationAssessmentOrigin
  const contract:ResultDisclosureContractV1={schemaVersion:1,policyKey:'synthetic-reviewed-self-report',minimumRespondents:null,
    audiences:Object.fromEntries(resultAudiences.map(key=>[key,{mode:key==='RESPONDENT'?'INDIVIDUAL_SUMMARY':'NONE',
      metricKeys:key==='RESPONDENT'?families.map((_,i)=>'score'+i):[],longitudinalMetricKeys:[]}])) as ResultDisclosureContractV1['audiences']}
  const policy={analysisMode:'INDIVIDUAL_ONLY',resultDisclosure:contract}
  const binding:TrainingContentSnapshot&{attemptId:string;epoch:number;publicationHash:string}={schemaVersion:1,compositeId:origin.runtimeCompositeId,
    attemptId:'attempt',epoch:1,publicationHash:hash,units:[]}
  const releases=new Map<string,StoredRelease>(),facts=new Map<string,ReturnType<typeof createCanonicalUnitResultEnvelope>>()
  for(const [i,family] of families.entries()){
    const itemId=uid(10+i),metricKey='score'+i,type=family==='SJT'?'SITUATIONAL':family
    const measurement:StoredRelease={...prepareRelease({layer:'MEASUREMENT',family,key:'synthetic-'+family,version:'1',scope:{kind:'PRIVATE',product,ownerId:'approved-author',resourceId:uid(3)},
      assetRefs:[],sourceReleaseId:null,content:{projectionVersion:1,instrumentVersion:'1',measurementHash:hash,measurementHashScheme:'SYNTHETIC',scoringVersion:'1',runnerKey:'synthetic',runnerVersion:'1',locale:'zh-CN',localizationVersion:'1',metrics:[{metricKey,unit:'points',direction:'descriptive'}],executable:{}}}),
      releaseId:uid(30+i),status:'PUBLISHED',publishedBy:'approved-author',publishedAt:new Date('2026-10-27T00:00:00Z')}
    const report:StoredRelease={...prepareRelease({layer:'REPORT',family,key:'synthetic-report-'+family,version:'1',scope:measurement.scope,assetRefs:[],sourceReleaseId:null,
      content:{projectionVersion:1,measurements:[{releaseId:measurement.releaseId,contentHash:measurement.contentHash}],metricKeys:[metricKey],audience:product==='SCHOOL'?'student':'teacher',language:'zh-CN',generatorVersion:'DECLARATIVE_REPORT_V1',
        template:{title:'合成获准反馈 '+family,blocks:[{type:'TEXT',text:'合成测试，不代表已发布实际工具。'},{type:'METRIC',metricKey,label:'本次记录',display:'RAW'},
          {type:'REFERENCE_BAND',metricKey,referenceKind:'criterion_threshold',bandKey:'high',text:'禁止在没有阈值时出现的解释',guidance:[]}],limitations:['仅作描述，不是诊断。']}}}),
      releaseId:uid(50+i),status:'PUBLISHED',publishedBy:'approved-author',publishedAt:measurement.publishedAt}
    releases.set(measurement.releaseId,measurement);releases.set(report.releaseId,report)
    const measurementPointer={releaseId:measurement.releaseId,contentHash:measurement.contentHash,measurementHash:hash}
    const reportPointer={releaseId:report.releaseId,contentHash:report.contentHash}
    origin.units.push({itemId,family,measurement:measurementPointer,references:[],report:reportPointer})
    binding.units.push({itemId,family,measurement:measurementPointer,report:reportPointer,source:{kind:family==='COGNITIVE'?'COGNITIVE_CONFIG':family==='SCALE'?'SCALE':'SJT_AUTHOR_RELEASE',id:'source'+i,ownerId:'approved-author',...(family==='COGNITIVE'?{assignmentId:'cognitive-assignment'+i}:{})}})
    const core:CanonicalUnitResultCoreV1={schemaVersion:1,unitType:type,instrumentKey:'synthetic'+i,instrumentVersion:'1',sourceDefinitionHash:hash,compilerVersion:'1',compiledRuntimeHash:hash,scorerKey:'synthetic',scorerVersion:'1',quality:{status:'interpretable',flags:[]},metrics:[{key:metricKey,value:10+i,quality:'OK'},{key:'secret'+i,value:999}],facts:[],references:[],contextHash:null,scientificProvenance:{instrumentKey:'synthetic'+i,instrumentVersion:'1'}}
    facts.set(itemId,createCanonicalUnitResultEnvelope({core,completedAt:'2026-10-27T00:00:00Z',persistenceProvenance:{sourceType:family==='COGNITIVE'?'COGNITIVE_SESSION':family==='SCALE'?'ASSESSMENT':'SITUATIONAL_ATTEMPT',sourceAttemptId:'child'+i,sourceSubmissionId:'submission'+i}}))
  }
  origin.runtimeSnapshotHash=canonicalHash({schemaVersion:binding.schemaVersion,compositeId:binding.compositeId,units:binding.units})
  binding.publicationHash=origin.runtimeSnapshotHash
  const bindingHash=canonicalHash(binding)
  const interpretation=await interpretContentBinding({binding:{units:binding.units.map(unit=>({...unit,instrumentKey:unit.itemId,references:[]})),populationContext:{}},contentBindingHash:bindingHash,
    readRelease:async(id,hash)=>{const value=releases.get(id);if(!value||value.contentHash!==hash)throw Error('bad fixture pointer');return value},
    readFacts:unit=>({notExecuted:false,quality:facts.get(unit.itemId)!.core.quality.status,metrics:facts.get(unit.itemId)!.core.metrics.map(metric=>({key:metric.key,value:metric.value as number,status:'OK'}))})})
  const receipt:TrainingFinalReceipt={schemaVersion:1,attemptId:'attempt',epoch:1,aggregateInputHash:hash,contentBindingHash:bindingHash,generatedAt:'2026-10-27T00:00:00Z',
    sources:[...facts].map(([itemId,envelope])=>({itemId,resultHash:envelope.resultHash})),interpretation}
  const rows=[...facts].map(([itemId,envelope])=>({compositeAttemptId:'attempt',attemptEpoch:1,slotKey:compositeItemSlotKey(itemId,envelope.core.unitType),
    unitType:envelope.core.unitType,terminalState:'COMPLETED',payloadKind:'UNIT_RESULT',sourceDefinitionHash:hash,compiledRuntimeHash:hash,
    ...envelope.persistenceProvenance,sourceSubmissionId:envelope.persistenceProvenance.sourceSubmissionId!,canonicalResultEncrypted:encryptUnifiedRuntimePayload(envelope)}))
  const slots=createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:[...facts].map(([itemId,envelope])=>({
    slotKey:compositeItemSlotKey(itemId,envelope.core.unitType),unitType:envelope.core.unitType,required:true,
    sourceDefinitionIdentity:{key:envelope.core.instrumentKey,version:'1',hash},sourceBinding:{},...(envelope.core.unitType==='SITUATIONAL'?{runtimeIdentity:{instrumentKey:envelope.core.instrumentKey,instrumentVersion:'1',definitionHash:hash,compiledRuntimeHash:hash,scorerKey:'synthetic',scoringVersion:'1',runtimeGeneration:'UNIFIED_V1' as const,deliveryMode:'FINAL_ONLY' as const,frozenAt:'2026-10-27T00:00:00Z'}}:{})}))})
  const parent={id:'attempt',attemptEpoch:1,compositeAssessmentId:origin.runtimeCompositeId,userId:'self',respondentUserId:'self',subjectUserId:'self',assignmentRef:'assignment',
    status:'COMPLETED',asyncReportEpoch:null as number|null,contextSnapshotHash:null,aggregateInputHash:hash,trainingContentBinding:binding,trainingContentBindingHash:bindingHash,
    trainingContentInterpretationEncrypted:encryptUnifiedRuntimePayload(receipt),trainingContentInterpretationHash:canonicalHash(receipt),
    frozenActiveSlotSetEncrypted:encryptUnifiedRuntimePayload(slots),frozenActiveSlotSetHash:slots.snapshotHash,
    compositeAssessment:{id:origin.runtimeCompositeId,trainingFeedbackPolicy:null,trainingFeedbackPolicyHash:null}}
  const entry={...draftEducationAssessmentEntry({origin,title:'合成教育资源',disclosure:contract}),releaseStatus:'PUBLISHED' as const}
  const source={identityOnly:true as const,origin,entry,runtime:{id:origin.runtimeCompositeId},releases,authority:[{kind:'PRODUCT_ADMIN',actorId:uid(80),membershipId:uid(81),grantId:uid(82)}]}
  const own={organizationId:origin.organizationId,resourceKey:educationAssessmentResourceKey(origin),resourceVersion:'1.0.0',attemptId:parent.id,assignmentId:'assignment',policy,policyHash:canonicalHash(policy)}
  return {source,origin,contract,binding,receipt,facts,releases,rows,slots,parent,own,product,references:null,metricKeys:new Set(contract.audiences.RESPONDENT.metricKeys)}
}
