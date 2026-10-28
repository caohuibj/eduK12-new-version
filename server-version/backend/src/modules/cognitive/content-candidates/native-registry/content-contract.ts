import {canonicalHash} from '../../../assessment-runtime/canonical'
import type {CognitiveScoreResult,TaskDefinition,TrialEnvelope} from '../../v2/types'

export interface NativeContentAdapter {
 configVersion:string
 manifest(config:unknown,seed:string):unknown
 manifestHash(config:unknown,seed:string):string
 envelope(raw:unknown):TrialEnvelope<unknown>
 parseRaw(raw:unknown):void
 project(score:CognitiveScoreResult,binding?:Record<string,unknown>):unknown
 validateArchiveRecord?(raw:unknown,authority:{config:unknown;contextKey:string;recordKey:string;configHash:string;protocolSignature:string;administration:unknown}):void
 inspectArchiveRecord?(raw:unknown):{phase:string;round:number;index:number;plan:unknown;status:string}
 isReport(value:unknown):boolean
}
export interface NativeDefinitionRecord {definition:TaskDefinition<unknown,unknown>;content?:NativeContentAdapter}
/** Adapt only task-owned functions. Config, raw and public projection remain owned by the existing exact package. */
export function contentDefinition<C,R,P>(definition:TaskDefinition<C,R>,configVersion:string,
 manifest:(config:C,seed:string)=>unknown,envelope:(raw:R)=>TrialEnvelope<R>,
 project:(score:CognitiveScoreResult)=>P,isReport:(value:unknown)=>boolean,contextManifest:'formal'|'all'='formal'):NativeDefinitionRecord {
 return {definition:definition as unknown as TaskDefinition<unknown,unknown>,content:{configVersion,
  manifest:(config,seed)=>manifest(definition.configSchema.parse(config),seed),
  manifestHash:(config,seed)=>{const m=manifest(definition.configSchema.parse(config),seed) as {formal:unknown};return canonicalHash(contextManifest==='all'?m:Array.isArray(m)?m.filter(p=>(p as {phase?:string}).phase==='test'):m.formal)},
  envelope:raw=>envelope(definition.trialSchema.parse(raw)),
  parseRaw:raw=>{definition.trialSchema.parse(raw)},project,isReport}}
}
