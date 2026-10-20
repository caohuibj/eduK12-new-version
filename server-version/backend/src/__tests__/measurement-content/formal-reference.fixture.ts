import {referenceConsentBodyHash,prepareReferenceCandidate,referenceEntryKey,type ReferenceCandidate,type FormalReferencePromotion} from '../../modules/measurement-content/reference-candidate'
export const ids={source:'11111111-1111-4111-8111-111111111111',candidate:'22222222-2222-4222-8222-222222222222',
  grant:'33333333-3333-4333-8333-333333333333',measurement:'44444444-4444-4444-8444-444444444444',
  project:'55555555-5555-4555-8555-555555555555',wave:'66666666-6666-4666-8666-666666666666'}
export function sourceFixture(){
  const input:Omit<ReferenceCandidate,'schemaVersion'|'candidateHash'>={
    analyzerId:'analyst',scope:{kind:'PRIVATE',product:'SURVEY',ownerId:'analyst',resourceId:ids.project},
    sourceBinding:{kind:'SURVEY_VERIFIED_SOURCE_V1',projectId:ids.project,waveId:ids.wave,instrumentKey:'scale',scoreKey:'total',
      sourceRevision:1,sourceFinalCount:2,cutOff:'2026-10-20T00:00:00.000Z'},
    measurement:{releaseId:ids.measurement,contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64),instrumentVersion:'1',scoringVersion:'1'},
    definition:{schemaVersion:1,instrumentType:'scale',instrumentKey:'scale',referenceVersion:'1',status:'DRAFT',entries:[{
      scoreKey:'total',referenceKind:'descriptive_sample',evidenceLevel:'local_pilot',provenanceType:'local_observed',
      instrumentVersion:'1',scoringVersion:'1',population:{description:'Observed sample'},
      source:{citation:'Verified internal Survey FINAL descriptive sample',sampleSize:2},statistics:{mean:2,sd:1},
    }]},sampleManifest:[],
    evidence:{source:'INTERNAL_OBSERVED',cutoff:'2026-10-20T00:00:00.000Z',method:'Observed arithmetic mean and sample SD',
      softwareVersion:'SURVEY_DESCRIPTIVE_V1',inclusionRule:'Consented FINALs',missingness:'Complete eligible cases',
      repeatResponses:'Distinct participants',organizationClustering:'Single source',administrationDifferences:'Fixed protocol',
      uncertainty:'Needs independent review',applicability:'Observed sample only',sampleAdequacy:'Submitted for assessment'},
  }
  const entryKey=referenceEntryKey(input.definition.entries[0])
  input.sampleManifest=['private-person-1','private-person-2'].map(factId=>({factId,factVersion:'1',
    measurementReleaseId:ids.measurement,metricKeys:['total'],entryKeys:[entryKey]}))
  const facts=new Map(input.sampleManifest.map(member=>[member.factId,{factVersion:member.factVersion,
    measurementReleaseId:member.measurementReleaseId,metricKeys:member.metricKeys,eligibleEntryKeys:member.entryKeys}]))
  const source=prepareReferenceCandidate(input,facts)
  const promotion:FormalReferencePromotion={kind:'FORMAL_CROSS_ENTRY_SUBMISSION_V1',sourceCandidateId:ids.source,
    sourceCandidateHash:source.candidateHash,analyzeGrantId:ids.grant,
    statement:'I submit this aggregate proposal for independent formal review and authorize current-source rechecks.',
    populationDescription:'Specified intended population, subject to independent review',applicability:'Same exact measurement',
    sampleAdequacy:'Human adequacy assessment required',uncertainty:'Sampling uncertainty remains; no automatic validation',
    consentUseAssessment:'The recorded research consent allows this stated aggregate use, subject to independent review',
    targetPopulation:{kind:'SUPPORTED_MATCH',match:{minAgeMonthsInclusive:120,maxAgeMonthsExclusive:144},basis:'Proposed target scope; cohort representativeness requires independent review'}}
  const consentEvidence=[{version:'1',scopeHash:'c'.repeat(64),purpose:'Research aggregate use',dataCategories:['SCALE'],body:'Actual accepted notice with specific limitations',bodyHash:referenceConsentBodyHash('Actual accepted notice with specific limitations')}]
  return {source,facts,promotion,consentEvidence}
}
