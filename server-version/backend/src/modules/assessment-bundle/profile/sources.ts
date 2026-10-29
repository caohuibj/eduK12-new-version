import { parseCanonicalUnitResultEnvelope } from '../../assessment-runtime/unit-result'
import type { CanonicalUnitResultEnvelopeV1 } from '../../assessment-runtime/unit-result'
import { projectBundleScaleSourceFromCanonicalBridge, type BundleFrozenScaleSourceV1 } from '../sources'

/** Additive metadata local to the Profile adapter; existing source/hash contracts stay unchanged. */
export interface ProfileScaleSource extends BundleFrozenScaleSourceV1 {
  profileIdentity:{measurementHash:string;scoringVersion:string;sourceResultId:string;qualityFlags:string[]}
}
export function projectProfileScaleSource(input:{slotKey:string;expectedInstrumentKey:string;expectedInstrumentVersion:string;envelope:CanonicalUnitResultEnvelopeV1}):ProfileScaleSource{
  const envelope=parseCanonicalUnitResultEnvelope(input.envelope)
  if(envelope.core.unitType!=='SCALE')throw new Error('PROFILE_SCALE_SOURCE_REQUIRED')
  return {...projectBundleScaleSourceFromCanonicalBridge({...input,envelope}),profileIdentity:{
    measurementHash:envelope.core.sourceDefinitionHash,scoringVersion:envelope.core.scorerVersion,
    sourceResultId:envelope.persistenceProvenance.sourceAttemptId,qualityFlags:[...envelope.core.quality.flags],
  }}
}

