import {createHash} from 'node:crypto'
import { z } from 'zod'
import { canonicalHash, canonicalJsonString } from '../assessment-runtime/canonical'
import { validateReferenceSetDefinition, type AssessmentReferenceSetDefinition } from '../assessment-reference/reference'
import { ContentReleaseError, type ReleaseInput } from './release'

export interface ReferenceSampleMember {
  factId: string
  factVersion: string
  measurementReleaseId: string
  metricKeys: string[]
  entryKeys: string[]
}
export interface AuthorizedReferenceFact {
  factVersion:string
  measurementReleaseId:string
  metricKeys:readonly string[]
  eligibleEntryKeys:readonly string[]
}
export function referenceEntryKey(entry:AssessmentReferenceSetDefinition['entries'][number]):string{
  return canonicalHash({scoreKey:entry.scoreKey,referenceKind:entry.referenceKind,population:entry.population,
    instrumentVersion:entry.instrumentVersion,scoringVersion:entry.scoringVersion})
}
export interface ReferenceAnalysisEvidence {
  source: 'INTERNAL_OBSERVED' | 'INTERNAL_OFFLINE_ANALYSIS'
  cutoff: string
  method: string
  softwareVersion: string
  inclusionRule: string
  missingness: string
  repeatResponses: string
  organizationClustering: string
  administrationDifferences: string
  uncertainty: string
  applicability: string
  sampleAdequacy: string
}
export const surveyReferenceSourceBindingSchema=z.object({
  kind:z.literal('SURVEY_VERIFIED_SOURCE_V1'),projectId:z.string().guid(),waveId:z.string().guid(),
  instrumentKey:z.string().trim().min(1).max(240),scoreKey:z.string().trim().min(1).max(240),
  sourceRevision:z.number().int().nonnegative().safe(),sourceFinalCount:z.number().int().nonnegative().safe(),
  cutOff:z.string().max(64).refine(value=>Number.isFinite(Date.parse(value))),
}).strict()
export type SurveyReferenceSourceBinding=z.infer<typeof surveyReferenceSourceBindingSchema>
export const trainingReferenceSourceBindingSchema=z.object({
  kind:z.literal('TRAINING_VERIFIED_SOURCE_V1'),courseId:z.string().guid(),compositeId:z.string().guid(),
  selector:z.object({itemId:z.string().guid(),scoreKey:z.string().trim().min(1).max(200),publication:z.string().datetime(),
    configDigest:z.string().regex(/^[a-f0-9]{64}$/).nullable(),variantKey:z.string().trim().min(1).max(200).nullable(),
    materialGroupKey:z.string().trim().min(1).max(200).optional()}).strict(),
  cutOff:z.string().datetime(),sourceHash:z.string().regex(/^[a-f0-9]{64}$/),
  sourceIds:z.array(z.object({attemptId:z.string().guid(),attemptEpoch:z.number().int().positive()}).strict()).min(1).max(250),
}).strict()
export type TrainingReferenceSourceBinding=z.infer<typeof trainingReferenceSourceBindingSchema>
const matchValues=z.array(z.string().trim().min(1).max(240)).min(1).max(50).refine(values=>new Set(values).size===values.length)
export const formalReferencePopulationMatchSchema=z.object({
  minAgeMonthsInclusive:z.number().int().nonnegative().max(2400).optional(),
  maxAgeMonthsExclusive:z.number().int().positive().max(2401).optional(),
  sexAtBirth:z.array(z.enum(['female','male','intersex'])).min(1).max(3).optional(),
  gradeLevels:matchValues.optional(),primaryLanguages:matchValues.optional(),countriesOrRegions:matchValues.optional(),
}).strict().refine(match=>Object.values(match).some(value=>value!==undefined),'Explicit population constraints are required')
  .refine(match=>match.minAgeMonthsInclusive===undefined||match.maxAgeMonthsExclusive===undefined
    ||match.minAgeMonthsInclusive<match.maxAgeMonthsExclusive,'Invalid population age bounds')
export const formalReferencePromotionSchema=z.object({
  kind:z.literal('FORMAL_CROSS_ENTRY_SUBMISSION_V1'),
  sourceCandidateId:z.string().guid(),sourceCandidateHash:z.string().regex(/^[a-f0-9]{64}$/),
  analyzeGrantId:z.string().guid(),
  statement:z.string().trim().min(1).max(4000),
  populationDescription:z.string().trim().min(1).max(4000),
  applicability:z.string().trim().min(1).max(4000),
  sampleAdequacy:z.string().trim().min(1).max(4000),
  uncertainty:z.string().trim().min(1).max(4000),
  consentUseAssessment:z.string().trim().min(1).max(4000),
  targetPopulation:z.discriminatedUnion('kind',[
    z.object({kind:z.literal('SUPPORTED_MATCH'),match:formalReferencePopulationMatchSchema,basis:z.string().trim().min(1).max(4000)}).strict(),
    z.object({kind:z.literal('GENERAL_POPULATION'),basis:z.string().trim().min(1).max(4000)}).strict(),
  ]),
}).strict()
export type FormalReferencePromotion=z.infer<typeof formalReferencePromotionSchema>
export const referenceConsentBodyHash=(body:string)=>createHash('sha256').update(body,'utf8').digest('hex')
export const formalConsentEvidenceSchema=z.array(z.object({
  version:z.string().min(1).max(240),scopeHash:z.string().regex(/^[a-f0-9]{64}$/),
  body:z.string().min(1).max(20000),bodyHash:z.string().regex(/^[a-f0-9]{64}$/),
  purpose:z.string().min(1).max(20000),dataCategories:z.array(z.string().min(1).max(240)).max(16),
}).strict().refine(value=>referenceConsentBodyHash(value.body)===value.bodyHash,{message:'Accepted consent body hash mismatch'})).min(1).max(250)
export type FormalConsentEvidence=z.infer<typeof formalConsentEvidenceSchema>
export interface ReferenceCandidate {
  schemaVersion: 1
  sourceBinding?:SurveyReferenceSourceBinding|TrainingReferenceSourceBinding
  formalPromotion?:FormalReferencePromotion
  formalConsentEvidence?:FormalConsentEvidence
  analyzerId: string
  measurement: { releaseId: string; contentHash: string; instrumentVersion: string; scoringVersion: string; measurementHash: string }
  scope: ReleaseInput['scope']
  definition: AssessmentReferenceSetDefinition
  sampleManifest: ReferenceSampleMember[]
  evidence: ReferenceAnalysisEvidence
  candidateHash: string
}
const nonblank=(value:unknown):value is string=>typeof value==='string'&&value.trim().length>0
const fail=(code:string):never=>{throw new ContentReleaseError(code)}

/** Internal preparation only. authorizedFacts is supplied by the current
 * scoped source reader, never accepted as an HTTP body or a stored permission.
 * This file creates no account, grant, publication endpoint or external norm import.
 */
export function prepareReferenceCandidate(input:Omit<ReferenceCandidate,'schemaVersion'|'candidateHash'>,
  authorizedFacts:ReadonlyMap<string,AuthorizedReferenceFact>):ReferenceCandidate{
  if(input.formalPromotion!==undefined){
    const promotion=formalReferencePromotionSchema.safeParse(input.formalPromotion)
    if(!promotion.success||!formalConsentEvidenceSchema.safeParse(input.formalConsentEvidence).success||input.sourceBinding!==undefined||input.scope.kind!=='PLATFORM'
      ||input.definition.entries.length!==1||input.definition.entries.some(entry=>entry.referenceKind!=='normative_distribution'))
      fail('REFERENCE_FORMAL_PROMOTION_INVALID')
  }
  if(input.sourceBinding?.kind==='TRAINING_VERIFIED_SOURCE_V1'){
    const source=trainingReferenceSourceBindingSchema.safeParse(input.sourceBinding)
    if(!source.success||source.data.cutOff!==input.evidence.cutoff||input.scope.kind!=='PRIVATE'||input.scope.product!=='TRAINING'
      ||input.scope.resourceId!==source.data.compositeId||input.definition.entries.some(entry=>entry.scoreKey!==source.data.selector.scoreKey)
      ||new Set(source.data.sourceIds.map(row=>row.attemptId)).size!==source.data.sourceIds.length)fail('REFERENCE_SOURCE_BINDING_INVALID')
  }else if(input.sourceBinding!==undefined){
    const source=surveyReferenceSourceBindingSchema.safeParse(input.sourceBinding)
    if(!source.success||source.data.cutOff!==input.evidence.cutoff
      ||input.scope.kind!=='PRIVATE'||input.scope.product!=='SURVEY'||input.scope.resourceId!==source.data.projectId
      ||input.definition.instrumentKey!==source.data.instrumentKey
      ||input.definition.entries.some(entry=>entry.scoreKey!==source.data.scoreKey))fail('REFERENCE_SOURCE_BINDING_INVALID')
  }
  if(!nonblank(input.measurement.releaseId)||!nonblank(input.measurement.instrumentVersion)||!nonblank(input.measurement.scoringVersion)
    ||![input.measurement.contentHash,input.measurement.measurementHash].every(h=>/^[a-f0-9]{64}$/.test(h)))fail('REFERENCE_MEASUREMENT_IDENTITY_REQUIRED')
  if(!nonblank(input.analyzerId))fail('REFERENCE_ANALYZER_REQUIRED')
  if(!['INTERNAL_OBSERVED','INTERNAL_OFFLINE_ANALYSIS'].includes(input.evidence.source))fail('REFERENCE_EXTERNAL_SOURCE_UNSUPPORTED')
  if(!Number.isFinite(Date.parse(input.evidence.cutoff))||Object.values(input.evidence).some(v=>!nonblank(v)))fail('REFERENCE_METHOD_EVIDENCE_REQUIRED')
  if(!input.sampleManifest.length||input.sampleManifest.length>100000)fail('REFERENCE_SAMPLE_BOUND_INVALID')
  const orderedEntryKeys=input.definition.entries.map(referenceEntryKey)
  const entryKeys=new Set(orderedEntryKeys)
  const ids=new Set<string>()
  for(const member of input.sampleManifest){
    if(ids.has(member.factId))fail('REFERENCE_DUPLICATE_FACT')
    ids.add(member.factId)
    const source=authorizedFacts.get(member.factId)
    if(!source)throw new ContentReleaseError('REFERENCE_SAMPLE_NOT_AUTHORIZED')
    if(!nonblank(member.factVersion)||source.factVersion!==member.factVersion)fail('REFERENCE_SAMPLE_NOT_AUTHORIZED')
    if(source.measurementReleaseId!==member.measurementReleaseId||canonicalHash([...source.metricKeys].sort())!==canonicalHash([...member.metricKeys].sort()))fail('REFERENCE_SAMPLE_SOURCE_MISMATCH')
    if(!member.entryKeys.length||new Set(member.entryKeys).size!==member.entryKeys.length||member.entryKeys.some(k=>!entryKeys.has(k)||!source.eligibleEntryKeys.includes(k)))fail('REFERENCE_SAMPLE_ENTRY_NOT_ELIGIBLE')
    if(new Set(member.metricKeys).size!==member.metricKeys.length||member.metricKeys.some(k=>!nonblank(k)))fail('REFERENCE_SAMPLE_METRICS_INVALID')
    if(member.measurementReleaseId!==input.measurement.releaseId||!member.metricKeys.length)fail('REFERENCE_SAMPLE_MEASUREMENT_MISMATCH')
  }
  const checked=validateReferenceSetDefinition(input.definition)
  if(input.definition.status!=='DRAFT'||!checked.definition||checked.issues.some(i=>i.severity==='error'))fail('REFERENCE_CANDIDATE_INVALID')
  for(const [entryIndex,entry] of input.definition.entries.entries()){
    if(entry.provenanceType!=='local_observed')fail('REFERENCE_INTERNAL_OBSERVATIONS_REQUIRED')
    if(entry.instrumentVersion!==input.measurement.instrumentVersion||entry.scoringVersion!==input.measurement.scoringVersion
      ||entry.governance&&entry.governance.measurementHash!==input.measurement.measurementHash)fail('REFERENCE_MEASUREMENT_MISMATCH')
    const entryKey=orderedEntryKeys[entryIndex]
    const eligible=input.sampleManifest.filter(m=>m.entryKeys.includes(entryKey)&&m.metricKeys.includes(entry.scoreKey)).length
    if(!eligible||entry.source.sampleSize!==eligible)fail('REFERENCE_SAMPLE_COUNT_MISMATCH')
    if(eligible<2&&(entry.statistics.sd!==undefined||Boolean(entry.statistics.percentileTable?.length)))fail('REFERENCE_ESTIMATE_NOT_COMPUTABLE')
    if(input.scope.kind!=='PLATFORM'&&['local_norm','validated_norm'].includes(entry.evidenceLevel))fail('REFERENCE_PRIVATE_OFFICIAL_NORM_FORBIDDEN')
  }
  const payload={schemaVersion:1 as const,...input,sampleManifest:[...input.sampleManifest].sort((a,b)=>a.factId<b.factId?-1:a.factId>b.factId?1:0)}
  canonicalJsonString(payload)
  return {...payload,candidateHash:canonicalHash(payload)}
}
export interface ReferenceCandidateReview {
  candidateHash:string
  reviewerId:string
  reviewedAt:string
  statement:string
  decision:'APPROVED'|'REJECTED'
}
/** Capability and current sample access checks are still required by V05's service. */
export function reviewReferenceCandidate(candidate:ReferenceCandidate,review:ReferenceCandidateReview):ReferenceCandidateReview{
  const {candidateHash,...payload}=candidate
  if(canonicalHash(payload)!==candidateHash||review.candidateHash!==candidateHash)fail('REFERENCE_REVIEW_STALE')
  if(!nonblank(review.reviewerId)||!nonblank(review.statement)||!Number.isFinite(Date.parse(review.reviewedAt)))fail('REFERENCE_REVIEW_EVIDENCE_REQUIRED')
  const formalCrossEntry=candidate.scope.kind==='PLATFORM'&&candidate.definition.entries.some(e=>e.referenceKind==='normative_distribution')
  if(formalCrossEntry&&review.reviewerId===candidate.analyzerId)fail('REFERENCE_INDEPENDENT_REVIEW_REQUIRED')
  if(!['APPROVED','REJECTED'].includes(review.decision))fail('REFERENCE_REVIEW_DECISION_INVALID')
  return {...review}
}
export function referenceCandidateRelease(candidate:ReferenceCandidate,review:ReferenceCandidateReview,key:string,version:string):ReleaseInput{
  reviewReferenceCandidate(candidate,review)
  if(review.decision!=='APPROVED')fail('REFERENCE_NOT_APPROVED')
  return {family:candidate.definition.instrumentType==='scale'?'SCALE':candidate.definition.instrumentType==='sjt'?'SJT':'COGNITIVE',layer:'REFERENCE',key,version,
    scope:candidate.scope,sourceReleaseId:null,provenance:{candidateHash:candidate.candidateHash,analyzerId:candidate.analyzerId,review},assetRefs:[],
    content:{projectionVersion:1,measurement:{releaseId:candidate.measurement.releaseId,contentHash:candidate.measurement.contentHash},
      entries:candidate.definition.entries.map(e=>({metricKey:e.scoreKey,referenceKind:e.referenceKind,definition:JSON.parse(JSON.stringify(e))})),
      evidence:{...candidate.evidence,sampleManifestHash:canonicalHash(candidate.sampleManifest),
        sampleCount:candidate.sampleManifest.length,candidateHash:candidate.candidateHash,
        ...(candidate.formalConsentEvidence?{consentScopeHashes:candidate.formalConsentEvidence.map(scope=>scope.scopeHash),
          consentBodyHashes:candidate.formalConsentEvidence.map(scope=>scope.bodyHash)}:{})}}}
}
