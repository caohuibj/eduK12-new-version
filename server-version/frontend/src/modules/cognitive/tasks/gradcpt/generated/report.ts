// Exact pure content projection. Backend SHA256: 9fdace21d50d71c3b0884ca2133c243b1cce593e915ae6e39ac10651f3bc2e2e
import {GRAD_IDENTITY,type Profile} from './protocol'
export interface GradStatistics {city:number;mountain:number;hits:number;omissions:number;falseAlarms:number;correctRejections:number;rtCount:number;meanMs:number|null;medianMs:number|null;sdMs:number|null;cv:number|null;correctedHitRate:number|null;correctedFalseAlarmRate:number|null;dPrime:number|null;criterion:number|null}
export interface GradReport {testType:'gradcpt';engineVersion:'0.1.0';scoringVersion:'0.1.0';reportDefinitionVersion:'0.1.0';presentationVersion:'0.1.0';configHash:string;protocolSignature:string;profile:Profile;state:'interpretable'|'limited'|'invalid';planned:number;presented:number;statistics:GradStatistics;inputResponses:Record<string,number>}
const int=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0
export function isGradReport(value:unknown,expected?:{configHash:string;protocolSignature:string;profile:Profile;presented?:number}):value is GradReport{
 if(!value||typeof value!=='object')return false;const r=value as GradReport,s=r.statistics,hex=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),finite=(v:unknown)=>typeof v==='number'&&Number.isFinite(v),nonnegative=(v:unknown)=>finite(v)&&(v as number)>=0
 if(r.testType!==GRAD_IDENTITY.testType||r.engineVersion!==GRAD_IDENTITY.engineVersion||r.scoringVersion!==GRAD_IDENTITY.scoringVersion||r.reportDefinitionVersion!=='0.1.0'||r.presentationVersion!=='0.1.0'||!hex(r.configHash)||!hex(r.protocolSignature)
  ||!['research','experience'].includes(r.profile)||r.planned!==(r.profile==='research'?300:100)||!['interpretable','limited','invalid'].includes(r.state)||!int(r.presented)||r.presented>r.planned||!s)return false
 if(expected&&(r.configHash!==expected.configHash||r.protocolSignature!==expected.protocolSignature||r.profile!==expected.profile||(expected.presented!==undefined&&r.presented!==expected.presented)))return false
 if(![s.city,s.mountain,s.hits,s.omissions,s.falseAlarms,s.correctRejections,s.rtCount].every(int)||s.hits+s.omissions!==s.city||s.falseAlarms+s.correctRejections!==s.mountain||s.rtCount!==s.hits||s.city+s.mountain>r.presented||s.city>(r.profile==='research'?268:90)||s.mountain>(r.profile==='research'?32:10))return false
 if(s.rtCount===0?(s.meanMs!==null||s.medianMs!==null):( !nonnegative(s.meanMs)||!nonnegative(s.medianMs)))return false
 if(s.rtCount<2?s.sdMs!==null:!nonnegative(s.sdMs))return false
 if(s.sdMs===null||s.meanMs===null||s.meanMs===0){if(s.cv!==null)return false}else if(!nonnegative(s.cv)||Math.abs(s.cv!-s.sdMs/s.meanMs)>1e-6)return false
 const rate=(x:number,n:number)=>n?(x===0?.5/n:x===n?1-.5/n:x/n):null
 if(s.correctedHitRate!==rate(s.hits,s.city)||s.correctedFalseAlarmRate!==rate(s.falseAlarms,s.mountain))return false
 if(s.city===0||s.mountain===0?(s.dPrime!==null||s.criterion!==null):(!finite(s.dPrime)||!finite(s.criterion)))return false
 if(!r.inputResponses||typeof r.inputResponses!=='object'||Object.entries(r.inputResponses).some(([k,v])=>!['touch','mouse','pen','keyboard'].includes(k)||!int(v)))return false
 return r.state==='invalid'?s.city+s.mountain===0:r.state==='interpretable'?s.city+s.mountain===r.planned&&r.presented===r.planned:s.city+s.mountain>0
}
export function projectGradReport(score:{metrics:Record<string,unknown>;quality:{state:string};audit:{scorerVersion:string}}):GradReport{const m=score.metrics,b=m.reportBinding as Record<string,unknown>|undefined
 if(!b||b.testType!==GRAD_IDENTITY.testType||b.engineVersion!==GRAD_IDENTITY.engineVersion||b.scoringVersion!==GRAD_IDENTITY.scoringVersion||b.reportDefinitionVersion!=='0.1.0'||score.audit.scorerVersion!==GRAD_IDENTITY.scoringVersion)throw Error('Unknown gradCPT report binding')
 const report:unknown={...GRAD_IDENTITY,reportDefinitionVersion:'0.1.0',presentationVersion:'0.1.0',configHash:b.configHash,protocolSignature:b.protocolSignature,profile:b.profile,state:score.quality.state,planned:m.expectedImageCount,presented:m.presentedImageCount,statistics:m.statistics,inputResponses:m.inputResponses}
 if(!isGradReport(report))throw Error('Inconsistent gradCPT public report');return report}
export const GRAD_COPY={zh:{title:'这次，你怎样跟上连续图片？',explanation:'这描述了本次“该按时回应”和“该等时停住”的记录。速度与误按需要一起看，不能只靠快慢判断表现。',tip:'做连续单调的工作时，可以先说清哪些信号需要行动、哪些需要等待，再安排合适的短休息。',limit:'本次记录受设备、理解和当时状态影响；不提供同龄排名、脑年龄、ADHD诊断或现实工作预测。'},
 en:{title:'How did you follow the continuous pictures?',explanation:'This describes responding when needed and waiting when needed in this session. Speed and errors should be considered together.',tip:'For repetitive work, clarify which signals call for action and which call for waiting, and plan suitable short breaks.',limit:'Device, understanding and current state affect this record. It provides no age ranking, brain age, ADHD diagnosis or work prediction.'}}
