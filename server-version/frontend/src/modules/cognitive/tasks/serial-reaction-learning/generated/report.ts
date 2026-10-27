import {IDENTITY,SOURCE_VERSION,configFor,type Profile,type Language} from './protocol'
import {mean,difference,type Counts,type Run} from './analysis'
export type {Language} from './protocol'
export interface Report{testType:'serial-reaction-learning';engineVersion:'0.1.0';scoringVersion:'0.1.0';configVersion:'0.1.0';parameterInterpretationVersion:'0.1.0';reportDefinitionVersion:'0.1.0';presentationVersion:'0.1.0';sourceVersion:typeof SOURCE_VERSION;profile:Profile;configHash:string;protocolSignature:string;manifestHash:string;state:'interpretable'|'limited'|'invalid';progress:{planned:number;presented:number;completed:number};summary:{firstCorrect:number;answered:number;rMs:number;sMs:number;deltaMs:number}|null}
export const COPY={zh:{title:'这次连续点选的记录',thanks:'谢谢你认真完成。',explanation:'重复顺序与对照顺序中，下面记录的是首次就点准时的软件反应时间；首答点错后纠正的时间没有混入。',tip:'可以回想什么时候更容易看清、点准；活动后让手休息一下。',limit:'触屏动作距离、姿势、熟悉程度、注意和疲劳都会影响结果。短版重复更少，长短版等值性未验证；这不是隐性学习能力证明，也不是智力、常模、诊断、同龄排名、学业或岗位预测。',limited:'谢谢你已经付出的努力。这次未完整完成、发生中断或有较多首答点错，先不解释表现差别。可以休息后重新看说明，再决定是否完整体验；本次没有表现评分。',invalid:'这次记录不足以可靠解释，所以没有生成表现结果。这不代表你的能力。准备好后可以重新开始。'},en:{title:'This session of serial tapping',thanks:'Thank you for completing the activity.',explanation:'These software response times include only trials on which the first tap was correct. Time spent correcting an incorrect first tap is excluded.',tip:'Think about what helped you see and tap accurately, then give your hand a rest.',limit:'Touch movement, posture, familiarity, attention and fatigue affect performance. The short profile has fewer repetitions and equivalence is unvalidated. This does not establish implicit-learning ability, intelligence, norms, diagnosis, age ranking, school or job predictions.',limited:'Thank you for your effort. This session was incomplete, interrupted or contained many incorrect first taps, so we will not interpret performance differences. Rest and review the instructions before deciding whether to try a complete activity. No performance score is shown.',invalid:'The record cannot support a reliable description, so no performance result was generated. This does not reflect your ability. You may start again when ready.'}} as const
const obj=(v:unknown):v is Record<string,unknown>=>Boolean(v&&typeof v==='object'&&!Array.isArray(v))
const keys=(v:unknown,a:string[])=>obj(v)&&Object.keys(v).sort().join('|')===[...a].sort().join('|')
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)
const time=(v:unknown):v is number=>finite(v)&&v>=0
const hex=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const approximately=(a:number,b:number)=>Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b))
export function isReport(value:unknown,expected?:{configHash:string;protocolSignature:string;manifestHash:string;profile:Profile;received:number}):value is Report{
  if(!keys(value,['testType','engineVersion','scoringVersion','configVersion','parameterInterpretationVersion','reportDefinitionVersion','presentationVersion','sourceVersion','profile','configHash','protocolSignature','manifestHash','state','progress','summary']))return false
  const r=value as Report
  if(r.testType!==IDENTITY.testType||[r.engineVersion,r.scoringVersion,r.configVersion,r.parameterInterpretationVersion,r.reportDefinitionVersion,r.presentationVersion].some(x=>x!=='0.1.0')||r.sourceVersion!==SOURCE_VERSION||!['research','experience'].includes(r.profile)||![r.configHash,r.protocolSignature,r.manifestHash].every(hex)||!['interpretable','limited','invalid'].includes(r.state)||!keys(r.progress,['planned','presented','completed']))return false
  const p=r.progress,planned=configFor(r.profile).totalTrials
  if(![p.planned,p.presented,p.completed].every(integer)||p.planned!==planned||p.presented>planned||p.completed>p.presented)return false
  if(expected&&(r.configHash!==expected.configHash||r.protocolSignature!==expected.protocolSignature||r.manifestHash!==expected.manifestHash||r.profile!==expected.profile||p.presented!==expected.received))return false
  if(r.state!=='interpretable')return r.summary===null&&(r.state!=='invalid'||p.completed===0)
  if(p.completed!==planned||!keys(r.summary,['firstCorrect','answered','rMs','sMs','deltaMs']))return false
  const s=r.summary!;return integer(s.firstCorrect)&&s.firstCorrect<=planned&&s.answered===planned&&s.firstCorrect>0&&time(s.rMs)&&time(s.sMs)&&finite(s.deltaMs)&&approximately(s.deltaMs,s.rMs-s.sMs)
}
/** No generic metric leaks: validate internal facts and project only this explicit surface. */
export function projectReport(score:{metrics:Record<string,unknown>;quality:{state:string;flags:Record<string,boolean>;reasons:string[]};audit:{trialCount:number;scorerVersion:string}}):Report{
  const m=score.metrics,c=m.counts as Counts,runs=m.runs as Run[],b=m.reportBinding as Record<string,unknown>,q=score.quality
  if(!b||!c||!Array.isArray(runs)||!['research','experience'].includes(b.profile as string))throw Error('Missing SRL report facts')
  const config=configFor(b.profile as Profile)
  if(score.audit.scorerVersion!==IDENTITY.scoringVersion||score.audit.trialCount!==c.presented||!Object.values(c).every(integer)||c.planned!==config.totalTrials||c.planned!==c.presented+c.unpresented||c.presented!==c.completed+c.interrupted||c.presented!==c.answered+c.unanswered||c.firstCorrect>c.answered||runs.length!==config.runs)throw Error('SRL report counts differ')
  const totals={planned:0,presented:0,answered:0,firstCorrect:0,completed:0,interrupted:0,unanswered:0}
  let low=false,missing=false
  for(const [i,r] of runs.entries()){
    if(r.run!==i)throw Error('SRL run order differs')
    for(const k of ['R','S','tail'] as const){const a=r[k]
      if(!a||!keys(a,['planned','presented','answered','firstCorrect','completed','interrupted','unanswered','correctRtMs'])||a.planned!==(k==='tail'?4:40)||![a.planned,a.presented,a.answered,a.firstCorrect,a.completed,a.interrupted,a.unanswered].every(integer)||a.presented>a.planned||a.presented!==a.completed+a.interrupted||a.presented!==a.answered+a.unanswered||a.firstCorrect>a.answered||(a.firstCorrect===0?a.correctRtMs!==null:!time(a.correctRtMs)))throw Error('SRL condition facts differ')
      for(const key of Object.keys(totals) as (keyof typeof totals)[])totals[key]+=a[key]
      if(k!=='tail'&&a.answered>0&&a.firstCorrect/a.answered<config.minimumConditionFirstAccuracy)low=true
    }
    const delta=difference(r.R.correctRtMs,r.S.correctRtMs);if(r.deltaMs!==delta)throw Error('SRL signed run difference differs');if(delta===null)missing=true
  }
  for(const k of Object.keys(totals) as (keyof typeof totals)[])if(totals[k]!==c[k])throw Error('SRL aggregate facts differ')
  const f=q.flags
  if(!keys(f,['noFirstResponses','incompletePlan','technicalInterruption','lowConditionFirstAccuracy','missingContrast'])||!Object.values(f).every(v=>typeof v==='boolean')||f.noFirstResponses!==(c.answered===0)||f.incompletePlan!==(c.completed!==c.planned)||f.lowConditionFirstAccuracy!==low||f.missingContrast!==missing||(c.interrupted>0&&!f.technicalInterruption))throw Error('SRL report quality differs')
  const state=f.noFirstResponses?'invalid':Object.values(f).some(Boolean)?'limited':'interpretable',deltaMs=c.completed===c.planned&&!missing?mean(runs.map(r=>r.deltaMs!)):null
  if(q.state!==state||q.reasons.slice().sort().join('|')!==Object.keys(f).filter(k=>f[k]).sort().join('|')||m.deltaMs!==deltaMs)throw Error('SRL report state/difference differs')
  const report:unknown={...b,state,progress:{planned:c.planned,presented:c.presented,completed:c.completed},summary:state==='interpretable'?{firstCorrect:c.firstCorrect,answered:c.answered,rMs:mean(runs.map(r=>r.R.correctRtMs!)),sMs:mean(runs.map(r=>r.S.correctRtMs!)),deltaMs}:null}
  if(!isReport(report))throw Error('SRL public report identity differs');return structuredClone(report)
}
const number=(n:number,language:Language)=>new Intl.NumberFormat(language==='zh'?'zh-CN':'en',{maximumFractionDigits:2}).format(n)
export function reportText(value:unknown,language:Language):string{
  if(!isReport(value)||!['zh','en'].includes(language))throw Error('Unverified SRL report or language')
  const c=COPY[language],s=value.summary,en=language==='en',lines:string[]=[]
  if(!s)return [value.state==='limited'?c.limited:c.invalid,c.limit].join('\n\n')
  lines.push(c.title,c.thanks,en?`First tap correct: ${s.firstCorrect}/${s.answered}.`:`首次点准 ${s.firstCorrect}/${s.answered} 次。`,c.explanation,en?`Repeated order: ${number(s.sMs,language)} ms. Control: ${number(s.rMs,language)} ms. Control minus repeated: ${s.deltaMs>0?'+':''}${number(s.deltaMs,language)} ms.`:`重复顺序 ${number(s.sMs,language)} ms；对照 ${number(s.rMs,language)} ms；差值（对照减重复）${s.deltaMs>0?'+':''}${number(s.deltaMs,language)} ms。`)
  lines.push(s.deltaMs>0?(en?'Repeated-order responses were faster in this session.':'这次重复顺序下稍快。'):s.deltaMs<0?(en?'Repeated-order responses were slower in this session.':'这次重复顺序下稍慢。'):(en?'The two mean times were equal in this session.':'这次两类平均时间相同。'),c.tip,c.limit)
  return lines.join('\n\n')
}
export function takeHomeSvg(value:unknown,language:Language):string|null{
  if(!isReport(value)||!['zh','en'].includes(language))throw Error('Unverified SRL report or language');if(!value.summary)return null
  const en=language==='en',s=value.summary
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="320"><rect width="760" height="320" rx="20" fill="#eef5ff"/><g fill="#132b52" font-family="sans-serif"><text x="24" y="48" font-size="25">${en?'This session of serial tapping':'本次连续点选记录'}</text><text x="24" y="108" font-size="28">${en?'First tap correct':'首次点准'}: ${s.firstCorrect} / ${s.answered}</text><text x="24" y="160" font-size="22">${en?'Control minus repeated':'对照减重复'}: ${s.deltaMs>0?'+':''}${number(s.deltaMs,language)} ms</text><text x="24" y="211" font-size="16">${en?'Touch movement, posture and fatigue also affect this difference.':'触屏动作、姿势和疲劳也会影响这个差值。'}</text><text x="24" y="248" font-size="16">${en?'Not proof of learning ability, intelligence or diagnosis.':'不能据此判断学习能力、智力或诊断。'}</text><text x="24" y="294" font-size="16">EDUK12.TOP</text></g></svg>`
}
