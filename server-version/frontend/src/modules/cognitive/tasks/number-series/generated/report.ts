import {BANK_HASH,FAMILIES,NUMBER_SERIES_IDENTITY,type Family,type Profile} from './protocol'
import type {Counts,ConditionCounts} from './analysis'
export type Language='zh'|'en'
export interface NumberSeriesReport {
  testType:'number-series';engineVersion:'0.1.0';scoringVersion:'0.1.0';configVersion:'0.1.0'
  parameterInterpretationVersion:'0.1.0';reportDefinitionVersion:'0.1.0';presentationVersion:'0.1.0'
  configHash:string;protocolSignature:string;manifestHash:string;bankHash:typeof BANK_HASH;profile:Profile
  state:'interpretable'|'limited'|'invalid';progress:{planned:number;received:number;completed:number}
  summary:null|{correct:number;skipped:number;opportunities:number;correctRtMs:number|null;conditions:Record<Family,{correct:number;skipped:number;opportunities:number;correctRtMs:number|null}>}
}
export const NUMBER_SERIES_COPY={
  zh:{title:'谢谢你认真完成这组题',explanation:'先看过三类关系的例子，再把关系用到新的数字组合；下面只描述这次规则应用的记录。',tip:'日常遇到数字规律时，可以先说出每一步怎样变化，再检查下一步。这是一条一般建议，不代表个人学习能力判断。',limit:'题量、练习、学校教学和运算经验都会影响表现；触屏与短版效度尚未验证。这不是韦氏或瑞文的等价版，不给 IQ、常模、同龄排名、诊断或学业与岗位预测。',limited:'这次有题未完成或被打断，先不解读表现。谢谢你已经付出的努力；方便时再完整体验。',invalid:'这次记录不足以生成可解释的反馈。你可以先休息，准备好后重新开始。',noTime:'暂无可用的正确题用时',families:{addition:'等差关系',multiplication:'等比关系','growing-gap':'递增差值'}},
  en:{title:'Thank you for working through these questions',explanation:'You saw examples of three relationships before applying them to new number combinations. This describes this session of rule application only.',tip:'For everyday number patterns, try describing how each step changes before checking the next step. This is general advice, not a judgement of learning ability.',limit:'Item count, practice, schooling and arithmetic experience affect this record. Touch and short-version validity are unverified. This is not equivalent to Wechsler or Raven, and provides no IQ, norms, age ranking, diagnosis, school or job prediction.',limited:'Some questions were unfinished or interrupted, so we will not interpret performance. Thank you for your effort; you can try a complete activity when convenient.',invalid:'There is not enough information for interpretable feedback. Take a break and start again when ready.',noTime:'No correct-answer time is available',families:{addition:'Constant addition',multiplication:'Constant multiplication','growing-gap':'Growing gaps'}},
} as const
const record=(v:unknown):v is Record<string,unknown>=>Boolean(v&&typeof v==='object'&&!Array.isArray(v))
const keys=(v:unknown,expected:string[])=>record(v)&&Object.keys(v).sort().join('|')===[...expected].sort().join('|')
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0
const time=(v:unknown)=>v===null||(typeof v==='number'&&Number.isFinite(v)&&v>=0)
const hex=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
export function isNumberSeriesReport(value:unknown,expected?:{configHash:string;protocolSignature:string;manifestHash:string;profile:Profile;received:number}):value is NumberSeriesReport {
  if(!keys(value,['testType','engineVersion','scoringVersion','configVersion','parameterInterpretationVersion','reportDefinitionVersion','presentationVersion','configHash','protocolSignature','manifestHash','bankHash','profile','state','progress','summary']))return false
  const r=value as NumberSeriesReport
  if(r.testType!=='number-series'||[r.engineVersion,r.scoringVersion,r.configVersion,r.parameterInterpretationVersion,r.reportDefinitionVersion,r.presentationVersion].some(v=>v!=='0.1.0')||r.bankHash!==BANK_HASH||![r.configHash,r.protocolSignature,r.manifestHash].every(hex)||!['research','experience'].includes(r.profile)||!['interpretable','limited','invalid'].includes(r.state)||!keys(r.progress,['planned','received','completed']))return false
  const p=r.progress,planned=r.profile==='research'?24:12
  if(![p.planned,p.received,p.completed].every(integer)||p.planned!==planned||p.received>planned||p.completed>p.received)return false
  if(expected&&(r.configHash!==expected.configHash||r.protocolSignature!==expected.protocolSignature||r.manifestHash!==expected.manifestHash||r.profile!==expected.profile||p.received!==expected.received))return false
  if(r.state!=='interpretable')return r.summary===null&&(r.state==='invalid'?p.completed===0:p.completed>0)
  if(p.completed!==planned||p.received!==planned||!keys(r.summary,['correct','skipped','opportunities','correctRtMs','conditions']))return false
  const s=r.summary!
  if(![s.correct,s.skipped,s.opportunities].every(integer)||s.opportunities!==planned||s.correct+s.skipped>planned||!time(s.correctRtMs)||(s.correct===0?s.correctRtMs!==null:s.correctRtMs===null)||!keys(s.conditions,[...FAMILIES]))return false
  let correct=0,skipped=0
  for(const f of FAMILIES){const c=s.conditions[f]
    if(!keys(c,['correct','skipped','opportunities','correctRtMs'])||![c.correct,c.skipped,c.opportunities].every(integer)||c.opportunities!==planned/3||c.correct+c.skipped>c.opportunities||!time(c.correctRtMs)||(c.correct===0?c.correctRtMs!==null:c.correctRtMs===null))return false
    correct+=c.correct;skipped+=c.skipped
  }
  return correct===s.correct&&skipped===s.skipped
}
/** Only this projection is public. Restricted states contain no performance data, even in downloads. */
export function projectNumberSeriesReport(score:{metrics:Record<string,unknown>;quality:{state:string;flags:Record<string,boolean>;reasons:string[]};audit:{trialCount:number;scorerVersion:string}}):NumberSeriesReport {
  const {metrics:m,quality:q}=score,b=m.reportBinding as Record<string,unknown>,c=m.counts as Counts,g=m.conditions as Record<Family,ConditionCounts>
  if(!b||!c||!g||score.audit.scorerVersion!==NUMBER_SERIES_IDENTITY.scoringVersion||score.audit.trialCount!==c.received||!keys(q.flags,['noCompleteOpportunities','incompletePlan','technicalInterruption'])||typeof q.flags.technicalInterruption!=='boolean'||q.flags.noCompleteOpportunities!==(c.opportunities===0)||q.flags.incompletePlan!==(c.opportunities!==c.planned)||c.received!==c.opportunities+c.interrupted||c.planned!==c.received+c.unpresented||c.opportunities!==c.correct+c.wrong+c.skipped)throw Error('Inconsistent number-series report facts')
  const state=c.opportunities===0?'invalid':q.flags.incompletePlan||q.flags.technicalInterruption?'limited':'interpretable'
  if(q.state!==state||q.reasons.slice().sort().join('|')!==Object.keys(q.flags).filter(k=>q.flags[k]).sort().join('|')||!Object.values(c).every(integer))throw Error('Inconsistent number-series report quality')
  for(const field of ['opportunities','correct','wrong','skipped','interrupted'] as const)if(FAMILIES.reduce((sum,f)=>sum+(g[f]?.[field]??NaN),0)!==c[field])throw Error('Inconsistent number-series condition totals')
  for(const f of FAMILIES){const row=g[f];if(!row||row.planned!==c.planned/3||row.opportunities!==row.correct+row.wrong+row.skipped||row.opportunities+row.interrupted>row.planned||![row.planned,row.opportunities,row.correct,row.wrong,row.skipped,row.interrupted].every(integer)||!time(row.correctRtMs))throw Error('Invalid number-series condition')}
  const r:unknown={...b,state,progress:{planned:c.planned,received:c.received,completed:c.opportunities},summary:state==='interpretable'?{correct:c.correct,skipped:c.skipped,opportunities:c.opportunities,correctRtMs:m.correctRtMs,conditions:Object.fromEntries(FAMILIES.map(f=>[f,{correct:g[f].correct,skipped:g[f].skipped,opportunities:g[f].opportunities,correctRtMs:g[f].correctRtMs}]))}:null}
  if(!isNumberSeriesReport(r))throw Error('Invalid frozen number-series public projection')
  return structuredClone(r)
}
export function numberSeriesReportText(report:unknown,language:Language):string {
  if(!isNumberSeriesReport(report))throw Error('Cannot export an unverified report')
  const copy=NUMBER_SERIES_COPY[language],en=language==='en',lines:string[]=[report.state==='interpretable'?copy.title:report.state==='limited'?copy.limited:copy.invalid]
  if(report.summary){const s=report.summary
    lines.push(copy.explanation,en?`Correct: ${s.correct}/${s.opportunities}. Skipped: ${s.skipped}.`:`答对 ${s.correct}/${s.opportunities} 题；明确跳过 ${s.skipped} 题。`)
    for(const f of FAMILIES)lines.push(`${copy.families[f]}: ${s.conditions[f].correct}/${s.conditions[f].opportunities}`)
    lines.push(s.correctRtMs===null?copy.noTime:(en?'Median correct-answer time: ':'正确题中位用时：')+new Intl.NumberFormat(en?'en':'zh-CN',{maximumFractionDigits:2}).format(s.correctRtMs/1000)+(en?' seconds':'秒'),copy.tip)
  }
  lines.push(copy.limit)
  return lines.join('\n\n')
}
export function numberSeriesTakeHomeSvg(report:unknown,language:Language):string|null {
  if(!isNumberSeriesReport(report))throw Error('Cannot draw an unverified report')
  if(report.state!=='interpretable'||!report.summary)return null
  const en=language==='en',s=report.summary
  // Only known static text and validated counts enter SVG, never raw answers or internal metrics.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="300" viewBox="0 0 720 300"><rect width="720" height="300" rx="20" fill="#f5f7fb"/><g fill="#1f2937" font-family="sans-serif"><text x="32" y="52" font-size="24">${en?'This session of number-pattern practice':'本次数列规则应用记录'}</text><text x="32" y="122" font-size="40">${s.correct} / ${s.opportunities} ${en?'correct':'答对'}</text><text x="32" y="170" font-size="20">${en?'Skipped':'明确跳过'}: ${s.skipped}</text><text x="32" y="218" font-size="16">${en?'Taught rules; not an IQ score or a standardised test.':'先教规则再应用，不是智力分数或标准化测验。'}</text><text x="32" y="268" font-size="16">EDUK12.TOP</text></g></svg>`
}
