import { canonicalHash, canonicalJsonString } from '../assessment-runtime/canonical'
import { getCognitiveV2TaskDefinition } from '../cognitive/v2/registry'
import { evaluateCognitiveProductReadiness } from '../cognitive/library/product-readiness'
import { resolveCognitiveFinalMaxTrials } from '../cognitive/v2/final-submission-budget'
import { assertCognitiveProductEligible } from '../cognitive/product-eligibility'
import { ContentReleaseError, type ReleaseInput } from './release'

export interface CognitiveReleaseSource {
  localId:string;version:string;testType:string;configVersion:string;engineVersion:string;scoringVersion:string;
  config:unknown;scope:ReleaseInput['scope'];protocolContext?:Record<string,unknown>
}
const withoutReport=(value:unknown):Record<string,unknown>=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ContentReleaseError('CONTENT_COGNITIVE_CONFIG_INVALID')
  const {report:_report,...measurement}=value as Record<string,unknown>
  return measurement
}
/** Only installed registry implementations and their existing parameter schemas. */
export function cognitiveMeasurementRelease(input:CognitiveReleaseSource):ReleaseInput{
  assertCognitiveProductEligible(input.testType)
  const d=getCognitiveV2TaskDefinition(input.testType,input.engineVersion,input.scoringVersion)
  if(!d)throw new ContentReleaseError('CONTENT_COGNITIVE_RUNNER_MISSING')
  canonicalJsonString(input.config)
  const readiness=evaluateCognitiveProductReadiness(d,input.config)
  if(!readiness.ready)throw new ContentReleaseError('CONTENT_COGNITIVE_NOT_READY')
  const config=d.configSchema.parse(input.config)
  const raw=input.config as Record<string,unknown>,parsed=config as Record<string,unknown>
  if(Object.keys(raw).some(key=>!Object.prototype.hasOwnProperty.call(parsed,key)))throw new ContentReleaseError('CONTENT_COGNITIVE_PARAMETER_UNSUPPORTED')
  const executable=JSON.parse(JSON.stringify({
    testType:d.testType,engineVersion:d.engineVersion,scoringVersion:d.scoringVersion,
    config:withoutReport(config),protocol:d.protocol,
    presentation:d.presentation??null,
    metrics:Object.values(d.metrics).map(m=>({key:m.key,unit:m.unit,valueType:m.valueType,direction:m.direction,
      role:m.role,construct:m.construct,referenceEligible:m.referenceEligible,requiresQualityFlags:m.requiresQualityFlags??[]})),
    quality:Object.values(d.quality).map(q=>({key:q.key,effect:q.effect})),
    profiles:Object.fromEntries(Object.entries(d.profiles).map(([key,p])=>[key,withoutReport(p!.configPatch)])),
    finalMaxTrials:resolveCognitiveFinalMaxTrials(d,config),protocolContext:input.protocolContext??{},
  })) as Record<string,unknown>
  return {layer:'MEASUREMENT',family:'COGNITIVE',key:`cognitive:${canonicalHash(input.scope)}:${input.localId}`,
    version:input.version,scope:input.scope,sourceReleaseId:null,provenance:{testType:input.testType},assetRefs:[],
    content:{projectionVersion:1,instrumentVersion:input.configVersion,measurementHash:canonicalHash(executable),
      measurementHashScheme:'COGNITIVE_MEASUREMENT_PROJECTION_V1',scoringVersion:d.scoringVersion,
      runnerKey:d.testType,runnerVersion:d.engineVersion,locale:'und',localizationVersion:'unversioned',
      metrics:Object.values(d.metrics).map(m=>({metricKey:m.key,unit:m.unit,direction:m.direction})),executable}}
}
