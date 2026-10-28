import {canonicalHash} from '../../../assessment-runtime/canonical'
import type {NativeDefinitionRecord} from '../native-registry/content-contract'
import {antGuidedDefinition} from './package'
import {ANT_GUIDED_IDENTITY,type AntConfig} from './protocol'
import {antNativeManifest,antNativeEnvelope,antNativePlanFromRecord,type AntNativeRawRecord} from './native-protocol'
import {antNativeRecordSchema,parseAntNativeRecord} from './native-schema'
import {projectNativeAntReport,isNativeAntReport} from './native-report'
export const antGuidedNativeRecord:NativeDefinitionRecord={definition:antGuidedDefinition as NativeDefinitionRecord['definition'],content:{
 configVersion:ANT_GUIDED_IDENTITY.configVersion,
 manifest:(c,s)=>antNativeManifest(antGuidedDefinition.configSchema.parse(c),s),
 manifestHash:(c,s)=>canonicalHash(antNativeManifest(antGuidedDefinition.configSchema.parse(c),s).formal),
 envelope:value=>{const r=antNativeRecordSchema.parse(value) as AntNativeRawRecord;return antNativeEnvelope(r,canonicalHash(r.raw.display))},
 parseRaw:value=>{antNativeRecordSchema.parse(value)},project:projectNativeAntReport,isReport:isNativeAntReport,
 inspectArchiveRecord:value=>{const r=value as AntNativeRawRecord;return {phase:r.phase,round:r.raw.practice?.round??0,index:r.core.trialIndex,plan:antNativePlanFromRecord(r),status:r.core.interruptions.length||[r.core.cueOnsetPerfMs,r.core.cueOffsetPerfMs,r.core.targetOnsetPerfMs,r.core.targetOffsetPerfMs].some(t=>t===null)?'interrupted':'complete'}},
 validateArchiveRecord:(value,authority)=>{const r=parseAntNativeRecord(value,authority.config as AntConfig),display=r.raw.display
  if(r.contextId!==authority.contextKey||r.key!==authority.recordKey||display.configHash!==authority.configHash||display.protocolSignature!==authority.protocolSignature||canonicalHash(display)!==canonicalHash(authority.administration))throw Error('ANT frozen display/raw binding mismatch')},
}}
