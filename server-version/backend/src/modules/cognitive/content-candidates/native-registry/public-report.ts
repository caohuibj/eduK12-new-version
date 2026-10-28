import {getNativeContentDefinition,getNativeCognitiveTaskDefinition} from './definitions'
import type {CognitiveScoreResult} from '../../v2/types'
export interface NativePublicReportSnapshot {
 schemaVersion:1;testType:string;engineVersion:string;scoringVersion:string;configVersion:string;
 configHash:string;protocolSignature:string;reportDefinitionVersion:string;presentationVersion:string;
 profile:'experience'|'research';state:'interpretable'|'limited'|'invalid';report:unknown
}
/** Called only while committing a new result. Readers return these frozen bytes, never rescore from COS or latest content. */
export function projectNativeContentReport(input:{testType:string;engineVersion:string;scoringVersion:string;configVersion:string;
 configHash:string;protocolSignature:string;reportDefinitionVersion:string;presentationVersion:string;profile:unknown;contextKey?:string;score:CognitiveScoreResult}):NativePublicReportSnapshot|undefined {
 const adapter=getNativeContentDefinition(input.testType,input.engineVersion,input.scoringVersion)
 if(!adapter)return undefined
 const definition=getNativeCognitiveTaskDefinition(input.testType,input.engineVersion,input.scoringVersion)!
 if(!input.presentationVersion||adapter.configVersion!==input.configVersion||definition.report.version!==input.reportDefinitionVersion||!['experience','research'].includes(String(input.profile)))throw Error('Unknown exact native report combination')
 const report=adapter.project(input.score,{testType:input.testType,engineVersion:input.engineVersion,scoringVersion:input.scoringVersion,configHash:input.configHash,protocolSignature:input.protocolSignature,reportDefinitionVersion:input.reportDefinitionVersion,profile:input.profile,state:input.score.quality.state,...(input.contextKey?{contextId:input.contextKey}:{})})
 if(!adapter.isReport(report))throw Error('Native public report projection invalid')
 const r=report as Record<string,unknown>
 if(r.testType!==input.testType||r.engineVersion!==input.engineVersion||r.scoringVersion!==input.scoringVersion||r.configHash!==input.configHash
  ||r.protocolSignature!==input.protocolSignature||r.reportDefinitionVersion!==input.reportDefinitionVersion||r.profile!==input.profile||r.state!==input.score.quality.state)
  throw Error('Native public report frozen binding mismatch')
 return {schemaVersion:1,testType:input.testType,engineVersion:input.engineVersion,scoringVersion:input.scoringVersion,configVersion:input.configVersion,
  configHash:input.configHash,protocolSignature:input.protocolSignature,reportDefinitionVersion:input.reportDefinitionVersion,presentationVersion:input.presentationVersion,
  profile:input.profile as 'experience'|'research',state:input.score.quality.state,report:structuredClone(report)}
}
