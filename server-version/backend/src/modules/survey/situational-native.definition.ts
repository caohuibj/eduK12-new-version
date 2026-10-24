import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import { parseCompiledInstrumentRuntime } from '../assessment-runtime/compiler'
import { runnerSituationRuntimeDefinition } from '../situational/situation-runtime-definition'
import { freezeSituationalRuntimeAtAttemptStart,parseFrozenSituationalRuntimeSnapshot } from '../assessment-runtime/situational-runtime-snapshot'
import type { SituationPackage } from '../situational/situation-package'
import { validateSituationPackage } from '../situational/situation-package'
import type { SituationRuntimeDefinition } from '../situational/situation-runtime-definition'
import { resolveSituationalScientificContext } from '../situational/scientific-maturity'
import { situationalScientificContextSchema } from '../situational/onboarding/scientific-schema'
import { SURVEY_NATIVE_SJT_PROTOCOL,SurveySituationalProtocolError } from './situational-native.contract'

const text=z.string().min(1).max(240),hash=z.string().regex(/^[a-f0-9]{64}$/)
/** The host adds no second definition or scorer. This header binds the exact
 * shared compiler and science context alongside the original definition. */
export const surveyNativeSituationalHeaderSchema=z.object({
  protocol:z.literal(SURVEY_NATIVE_SJT_PROTOCOL),instrumentKey:text,instrumentVersion:text,
  definitionHash:hash,compiledRuntimeHash:hash,scorerKey:text,scoringVersion:text,
  scientificContext:situationalScientificContextSchema,
  compiledRuntime:z.unknown().transform(value=>parseCompiledInstrumentRuntime(value)),
}).strict()
export type SurveyNativeSituationalHeader=z.infer<typeof surveyNativeSituationalHeaderSchema>
export const frozenSurveyNativeSituationalHeaderSchema=surveyNativeSituationalHeaderSchema.extend({
  attemptEpoch:z.literal(1),frozenAt:z.string().datetime(),
}).strict()
export type FrozenSurveyNativeSituationalHeader=z.infer<typeof frozenSurveyNativeSituationalHeaderSchema>
const fail=():never=>{throw new SurveySituationalProtocolError('SURVEY_SJT_NATIVE_STAGED_PROTOCOL_INVALID')}

/** Initial native vertical slice: actual upload V2 staged, linear paths, no
 * experiment allocation or stimulus variants. Unsupported science stays closed. */
export function assertSurveyStagedSituationalDefinition(definition:SituationRuntimeDefinition):void {
  if(definition.schemaVersion!==2||definition.researchAssignment)fail()
  const d=definition as Extract<SituationRuntimeDefinition,{schemaVersion:2}>
  let staged=false
  for(const node of d.flow.nodes){
    if(node.nodeType==='TERMINAL')continue
    if(node.stimulusVariants?.length)fail()
    if(node.transition.type==='DECISION'&&new Set(node.transition.branches.map(branch=>branch.nextNodeKey)).size!==1)fail()
    if(node.responseStages?.length)staged=true
  }
  if(!staged||d.scenes.some(scene=>scene.stimulus.type!=='TEXT_V1'))fail()
}
export function compileSurveyNativeSituationalHeader(pkg:SituationPackage):SurveyNativeSituationalHeader{
  if(pkg.online||pkg.releaseStatus!=='PUBLISHED'||!validateSituationPackage(pkg).valid)fail()
  assertSurveyStagedSituationalDefinition(pkg.definition)
  const scientificContext=resolveSituationalScientificContext(pkg)
  if(!scientificContext)fail()
  const snapshot=freezeSituationalRuntimeAtAttemptStart({instrumentKey:pkg.key,
    instrumentVersion:pkg.instrumentVersion,definition:pkg.definition,scientificContext})
  return surveyNativeSituationalHeaderSchema.parse({protocol:SURVEY_NATIVE_SJT_PROTOCOL,
    instrumentKey:snapshot.instrumentKey,instrumentVersion:snapshot.instrumentVersion,
    definitionHash:snapshot.definitionHash,compiledRuntimeHash:snapshot.compiledRuntimeHash,
    scorerKey:snapshot.scorerKey,scoringVersion:snapshot.scoringVersion,scientificContext,compiledRuntime:snapshot.compiledRuntime})
}
export function frozenSurveyNativeSituationalRuntime(unit:{kind:string;executionProtocol?:unknown;
  compiledDefinition:unknown;nativeSituational?:unknown}){
  if(unit.kind!=='SJT'||unit.executionProtocol!==SURVEY_NATIVE_SJT_PROTOCOL)fail()
  const header=frozenSurveyNativeSituationalHeaderSchema.parse(unit.nativeSituational)
  const definition=unit.compiledDefinition as SituationRuntimeDefinition
  assertSurveyStagedSituationalDefinition(definition)
  const unsigned={schemaVersion:1 as const,runtimeGeneration:'UNIFIED_V1' as const,
    frozenAt:header.frozenAt,instrumentKey:header.instrumentKey,instrumentVersion:header.instrumentVersion,
    definitionHash:header.definitionHash,compiledRuntimeHash:header.compiledRuntimeHash,
    scorerKey:header.scorerKey,scoringVersion:header.scoringVersion,definition,
    runnerDefinition:runnerSituationRuntimeDefinition(definition),compiledRuntime:header.compiledRuntime,
    scientificContext:header.scientificContext}
  const snapshot=parseFrozenSituationalRuntimeSnapshot({...unsigned,snapshotHash:canonicalHash(unsigned)})
  return {header,snapshot}
}
