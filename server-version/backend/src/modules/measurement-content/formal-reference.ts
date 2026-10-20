import {canonicalHash} from '../assessment-runtime/canonical'
import {ContentReleaseError} from './release'
import {
  formalReferencePromotionSchema,prepareReferenceCandidate,referenceEntryKey,
  type AuthorizedReferenceFact,type FormalReferencePromotion,type ReferenceCandidate,type FormalConsentEvidence,
} from './reference-candidate'

/** Pure server projection, not a norm-table import. Values, metric, source
 * membership and scoring identity always come from the verified private producer.
 * The proposal remains DRAFT. Software does not certify scientific validity.
 */
export function prepareFormalReferenceCandidate(source:ReferenceCandidate,promotion:FormalReferencePromotion,
  sourceFacts:ReadonlyMap<string,AuthorizedReferenceFact>,consentEvidence:FormalConsentEvidence){
  formalReferencePromotionSchema.parse(promotion)
  const {schemaVersion:_schema,candidateHash,...original}=source
  if(source.scope.kind!=='PRIVATE'||!source.sourceBinding||source.formalPromotion
    ||candidateHash!==promotion.sourceCandidateHash
    ||prepareReferenceCandidate(original,sourceFacts).candidateHash!==candidateHash
    ||source.definition.entries.length!==1)throw new ContentReleaseError('REFERENCE_FORMAL_SOURCE_REQUIRED')
  const entry=source.definition.entries[0]
  if(entry.referenceKind!=='descriptive_sample'||entry.evidenceLevel!=='local_pilot'||entry.provenanceType!=='local_observed'
    ||entry.population.match||!Number.isFinite(entry.statistics.mean)||!Number.isFinite(entry.statistics.sd)
    ||entry.statistics.sd!<=0||source.sampleManifest.length<2)
    throw new ContentReleaseError('REFERENCE_FORMAL_ESTIMATE_NOT_SUPPORTED')
  const promotedEntry={...entry,referenceKind:'normative_distribution' as const,evidenceLevel:'local_norm' as const,
    population:{description:promotion.populationDescription,...(promotion.targetPopulation.kind==='SUPPORTED_MATCH'
      ?{match:promotion.targetPopulation.match}:{})},
    // Do not infer normality or estimated percentiles from a mean and SD.
    derivation:{method:'Observed mean and sample SD; no distribution assumption',distributionAssumption:'unknown' as const,allowEstimatedPercentile:false},
    limitations:[...(entry.limitations??[]),'正式用途须独立科学复核；软件流程不证明样本代表性或科学有效性。',
      '统计仍来自完整已核验来源样本；目标适用范围不是按人口属性重新抽样的证明。'],
  }
  const entryKey=referenceEntryKey(promotedEntry)
  const facts=new Map<string,AuthorizedReferenceFact>()
  for(const member of source.sampleManifest){
    const fact=sourceFacts.get(member.factId)
    if(!fact)throw new ContentReleaseError('REFERENCE_SAMPLE_NOT_AUTHORIZED')
    facts.set(member.factId,{...fact,eligibleEntryKeys:[entryKey]})
  }
  const input:Omit<ReferenceCandidate,'schemaVersion'|'candidateHash'>={
    analyzerId:source.analyzerId,scope:{kind:'PLATFORM'},measurement:source.measurement,
    formalPromotion:promotion,formalConsentEvidence:consentEvidence,
    definition:{...source.definition,status:'DRAFT',entries:[promotedEntry]},
    sampleManifest:source.sampleManifest.map(member=>({...member,entryKeys:[entryKey]})),
    evidence:{...source.evidence,applicability:promotion.applicability,sampleAdequacy:promotion.sampleAdequacy,uncertainty:promotion.uncertainty},
  }
  return {candidate:prepareReferenceCandidate(input,facts),input,facts}
}

/** Explicit projection: neither sourceBinding.sourceIds nor sampleManifest may
 * cross the platform review boundary, including for Training candidates. */
export function formalReferenceCandidateView(candidate:ReferenceCandidate){
  if(!candidate.formalPromotion||candidate.scope.kind!=='PLATFORM')throw new ContentReleaseError('REFERENCE_FORMAL_CANDIDATE_REQUIRED')
  return {candidateHash:candidate.candidateHash,analyzerId:candidate.analyzerId,measurement:candidate.measurement,
    definition:candidate.definition,evidence:candidate.evidence,
    submissionStatement:candidate.formalPromotion.statement,
    targetPopulation:candidate.formalPromotion.targetPopulation,
    consentUseAssessment:candidate.formalPromotion.consentUseAssessment,
    consentEvidence:candidate.formalConsentEvidence,
    sampleCount:candidate.sampleManifest.length,sampleManifestHash:canonicalHash(candidate.sampleManifest)}
}
