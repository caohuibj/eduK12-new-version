import {SART_IDENTITY,same,type SartProfile} from './protocol'
import type {SartStats} from './analysis'
export interface SartReport {testType:'sart';engineVersion:'0.1.0';scoringVersion:'0.1.0';reportDefinitionVersion:'0.1.0';presentationVersion:'0.1.0';
  configHash:string;protocolSignature:string;profile:SartProfile;state:'interpretable'|'limited'|'invalid';planned:number;received:number;complete:number;
  stats:SartStats;thirds:SartStats[];differences:{commissionPercentagePoints:number|null;medianMs:number|null};copy:typeof SART_COPY}
const int=(x:unknown):x is number=>typeof x==='number'&&Number.isInteger(x)&&x>=0
function validStats(s:SartStats){return !!s&&[s.go,s.noGo,s.hits,s.omissions,s.commissions,s.correctWithholds,s.rtCount].every(int)&&s.hits+s.omissions===s.go&&s.commissions+s.correctWithholds===s.noGo&&s.rtCount===s.hits&&(s.rtCount===0?s.medianMs===null:typeof s.medianMs==='number'&&Number.isFinite(s.medianMs)&&s.medianMs>=0&&s.medianMs<1150)}
export function sartDifferences(thirds:SartStats[]):SartReport['differences']{const [first,,last]=thirds;return {commissionPercentagePoints:first.noGo&&last.noGo?100*(last.commissions/last.noGo-first.commissions/first.noGo):null,medianMs:first.medianMs===null||last.medianMs===null?null:last.medianMs-first.medianMs}}
export function isSartReport(value:unknown,expected?:{configHash:string;protocolSignature:string;profile:SartProfile;received?:number}):value is SartReport{
  if(!value||typeof value!=='object')return false;const r=value as SartReport,hex=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
  if(r.testType!=='sart'||r.engineVersion!=='0.1.0'||r.scoringVersion!=='0.1.0'||r.reportDefinitionVersion!=='0.1.0'||r.presentationVersion!=='0.1.0'||!hex(r.configHash)||!hex(r.protocolSignature)||!['research','experience'].includes(r.profile)||!['interpretable','limited','invalid'].includes(r.state)||![r.planned,r.received,r.complete].every(int)||r.planned!==(r.profile==='research'?225:90)||r.received>r.planned||r.complete>r.received||!validStats(r.stats)||r.stats.go+r.stats.noGo!==r.complete||r.stats.go>r.planned*8/9||r.stats.noGo>r.planned/9||!Array.isArray(r.thirds)||r.thirds.length!==3||!r.thirds.every(validStats))return false
  if(expected&&(r.configHash!==expected.configHash||r.protocolSignature!==expected.protocolSignature||r.profile!==expected.profile||(expected.received!==undefined&&r.received!==expected.received)))return false
  for(const k of ['go','noGo','hits','omissions','commissions','correctWithholds','rtCount'] as const)if(r.thirds.reduce((n,s)=>n+s[k],0)!==r.stats[k])return false
  if(r.thirds.some(s=>s.go+s.noGo>r.planned/3)||!same(r.differences,sartDifferences(r.thirds))||!same(r.copy,SART_COPY))return false
  return r.state==='invalid'?r.complete===0:r.state==='interpretable'?r.complete===r.planned:r.complete>0&&r.complete<r.planned
}
export function projectSartReport(score:{metrics:Record<string,unknown>;quality:{state:string};audit:{scorerVersion:string}}):SartReport{
  const m=score.metrics,b=m.reportBinding as Record<string,unknown>|undefined
  if(!b||score.audit.scorerVersion!==SART_IDENTITY.scoringVersion)throw Error('Unknown SART report binding')
  const r:unknown={...b,state:score.quality.state,planned:m.expectedTrialCount,received:m.receivedTrialCount,complete:m.completeTrialCount,stats:m.statistics,thirds:m.thirds,differences:m.differences,copy:structuredClone(SART_COPY)}
  if(!isSartReport(r))throw Error('Inconsistent SART report');return r
}
export const SART_COPY={zh:{title:'谢谢你完成这段回应',partial:'本次只描述已经完整记录的部分',invalid:'本次暂时无法形成表现结论',explanation:'这份记录分别描述该按时未按，以及不该按时按下。单次表现不能说明这些情况的原因，也不能只用速度判断注意力。',tip:'下次做持续观察任务，可以先确认规则、减少旁边打断，并在需要时安排休息。速度与准确一起看，无需只追求按得更快。',limit:'本版本没有临床或同龄参照；睡眠、手部操作和设备都可能影响表现。不据此判断 ADHD、记忆障碍、IQ 或工作适任。',empty:'尚无完整正式回应窗口；这不代表表现为零或注意力差。可以先休息或重看说明，再由你决定是否重新开始。'},en:{title:'Thank you for completing this response stream',partial:'Only the fully recorded part is described',invalid:'No performance conclusion is available',explanation:'This record separates missed Go responses from presses on No-Go trials. A single session cannot establish their causes, and speed alone does not determine attention.',tip:'Before another sustained observation task, confirm the rule, reduce nearby interruptions and take a break when needed. Consider accuracy with speed rather than trying only to respond faster.',limit:'There are no clinical or age norms for this version. Sleep, hand movements and devices can affect performance. This does not determine ADHD, memory disorders, IQ or fitness for work.',empty:'No complete formal response window is available. This does not mean zero performance or poor attention. Rest or review the instructions, then decide whether to start another attempt.'}}
/** One projection for body, optional image and download; research-only metrics never enter it. */
export function sartPublic(report:SartReport,language:'zh'|'en'='zh'){
  if(!isSartReport(report))throw Error('Invalid SART report');const copy=report.copy[language],valid=report.state!=='invalid',s=report.stats
  const summary=valid?{noGo:s.noGo?{presses:s.commissions,opportunities:s.noGo}:null,go:s.go?{misses:s.omissions,opportunities:s.go}:null,latency:{medianMs:s.medianMs,responses:s.rtCount}}:null
  return {state:report.state,profile:report.profile,title:valid?copy.title:copy.invalid,notice:report.state==='limited'?copy.partial:null,summary,
    explanation:valid?copy.explanation:copy.empty,suggestion:copy.tip,limitation:copy.limit,
    details:valid?{complete:report.complete,planned:report.planned,thirds:report.thirds.map(x=>({go:x.go,noGo:x.noGo,misses:x.omissions,presses:x.commissions,medianMs:x.medianMs})),differences:report.differences}:null}
}
export const sartDownload=(report:SartReport,language:'zh'|'en'='zh')=>JSON.stringify(sartPublic(report,language))
export const sartImageData=(report:SartReport,language:'zh'|'en'='zh')=>{const p=sartPublic(report,language);return p.summary?{...p,brand:'EDUK12.TOP'}:null}
