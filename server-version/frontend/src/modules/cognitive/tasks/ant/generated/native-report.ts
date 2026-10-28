// Frozen ANT public projection/guard; source SHA256: 935b21175fcada3e476645b899f18440395909f4c3608bf966cbabb07f26c8d6
import type {AntScoreResult as CognitiveScoreResult} from './report'
import {projectAntReport} from './report'
import {ANT_GUIDED_IDENTITY,CUES,FLANKERS,INPUTS} from './protocol'
export function projectNativeAntReport(score:CognitiveScoreResult,binding:Record<string,unknown>={}):NativeAntReport{
 return {...binding,projection:projectAntReport(score),qualityFlags:{...score.quality.flags}}
}
export type NativeAntReport=Record<string,unknown>&{projection:ReturnType<typeof projectAntReport>;qualityFlags:Record<string,boolean>}
/** Public shape only; research maps never enter this payload. Signed condition differences remain signed. */
export function isNativeAntReport(value:unknown):value is NativeAntReport {
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Record<string,any>,p=v.projection,f=v.qualityFlags,num=(x:unknown)=>typeof x==='number'&&Number.isFinite(x),count=(x:unknown)=>num(x)&&Number.isInteger(x)&&Number(x)>=0
 if(Object.keys(v).some(k=>!['testType','engineVersion','scoringVersion','configHash','protocolSignature','reportDefinitionVersion','profile','state','projection','qualityFlags','contextId'].includes(k))
  ||typeof v.contextId!=='string'||!v.contextId||v.testType!=='ant'||v.engineVersion!==ANT_GUIDED_IDENTITY.engineVersion||v.scoringVersion!==ANT_GUIDED_IDENTITY.scoringVersion||v.reportDefinitionVersion!==ANT_GUIDED_IDENTITY.reportDefinitionVersion
  ||!['research','experience'].includes(v.profile)||!['interpretable','limited','invalid'].includes(v.state)||!p||p.state!==v.state||!f||Array.isArray(f)||Object.values(f).some(x=>typeof x!=='boolean'))return false
 if(![v.configHash,v.protocolSignature].every(h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h))||!(p.accuracy===null||(num(p.accuracy)&&p.accuracy>=0&&p.accuracy<=1))||!Array.isArray(p.reasons)||p.reasons.some((x:unknown)=>typeof x!=='string')||typeof p.description!=='string'||typeof p.practicalTip!=='string')return false
 const rows=(list:any,kind:'cue'|'flanker',keys:readonly string[])=>Array.isArray(list)&&list.every((r:any)=>r&&keys.includes(r[kind])&&count(r.correct)&&count(r.total)&&r.total>0&&r.correct<=r.total&&r.accuracy===r.correct/r.total
  &&(r.correctMeanRtMs===null||(num(r.correctMeanRtMs)&&r.correctMeanRtMs>=0))&&(r.correctRtCount===null||count(r.correctRtCount))&&(r.input===null||INPUTS.includes(r.input)))
 return rows(p.cueRows,'cue',CUES)&&rows(p.flankerRows,'flanker',FLANKERS)&&Array.isArray(p.differences)&&p.differences.every((r:any)=>r&&['alerting','orienting','conflict'].includes(r.key)&&num(r.valueMs)&&count(r.firstCorrectCount)&&count(r.secondCorrectCount)&&INPUTS.includes(r.input))
}
