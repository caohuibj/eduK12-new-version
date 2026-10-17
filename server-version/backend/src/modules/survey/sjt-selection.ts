import { canonicalHash } from '../assessment-runtime/canonical'
import type { SjtDraft } from './builder.definition'

export type SurveySjtQuestion = Omit<SjtDraft['questions'][number],'options'> & {
  required?:boolean;allowRefusal?:boolean;exclusiveOptionKeys?:string[]
  options:Array<SjtDraft['questions'][number]['options'][number] & {nonanswerReason?:'DECLINED'|'UNABLE_TO_JUDGE'}>
}
type SurveySjtOption = SurveySjtQuestion['options'][number]
export const MAX_DERIVED_CHOICES = 24

/** Survey-only multi-selection adapter. The authoritative Situational engine
 * remains SINGLE_CHOICE: each accepted unordered subset is compiled into one
 * deterministic choice whose metric contributions are the SUM of its members.
 * Both the subset and the frozen compiler output are verified on FINAL.
 */
export function expandedSurveySjtOptions(question:SurveySjtQuestion):SurveySjtOption[] {
  if (question.responseType !== 'MULTIPLE') return question.options
  if(!question.aggregationPolicy)throw new Error('多选构念贡献尚未选择 SUM 或 MEAN 规则')
  const substantive=question.options.filter(o=>!o.nonanswerReason)
  const nonanswers=question.options.filter(o=>o.nonanswerReason)
  const n = substantive.length
  const min = question.minSelections ?? 1
  const max = question.maxSelections ?? n
  if (n < 2 || question.options.length > 6 || min < 1 || max > n || min > max)
    throw new Error('多选范围或选项个数无效')
  const combinations:SurveySjtOption[]=[]
  const ordered=substantive
  const walk=(start:number,selected:SurveySjtOption[])=>{
    if(selected.length>=min&&selected.length<=max&&
      !(selected.length>1&&selected.some(o=>question.exclusiveOptionKeys?.includes(o.optionKey)))){
      const keys=selected.map(o=>o.optionKey)
      const scores:Record<string,number>=Object.create(null)
      for(const o of selected)
        for(const [k,v] of Object.entries(o.contributions)){
          scores[k]=(scores[k]??0)+v
          if(!Number.isFinite(scores[k])||Math.abs(scores[k])>1000000)
            throw new Error('组合计分贡献超出受控范围')
        }
      combinations.push({
        optionKey:'m'+canonicalHash({questionKey:question.questionKey,selectedKeys:keys}).slice(0,22),
        label:selected.map(o=>o.label).join('＋'),
        contributions:Object.fromEntries(Object.entries(scores).map(([key,score])=>[
          key,question.aggregationPolicy==='MEAN'?score/selected.length:score,
        ])),
      })
      if(combinations.length+nonanswers.length>MAX_DERIVED_CHOICES)
        throw new Error('多选合法组合超过 24 种，请收紧最少／最多选项或拆题')
    }
    if(selected.length===max)return
    for(let i=start;i<n;i++)walk(i+1,[...selected,ordered[i]])
  }
  walk(0,[])
  return [...combinations,...nonanswers]
}

export function resolveSurveySjtAnswer(question:SurveySjtQuestion,raw:unknown):
  {scorerOptionKey:string;frozenResponse:string|string[]} {
  if(question.responseType!=='MULTIPLE'){
    if(typeof raw!=='string'||!question.options.some(o=>o.optionKey===raw))
      throw new Error('SJT 单选答案不是冻结的合法选项')
    return {scorerOptionKey:raw,frozenResponse:raw}
  }
  if(!Array.isArray(raw)||raw.some(x=>typeof x!=='string')
    ||new Set(raw).size!==raw.length)
    throw new Error('SJT 多选答案必须为不重复的有效选项编码数组')
  const selected=question.options.filter(o=>raw.includes(o.optionKey))
  if(raw.length===1&&selected.length===1&&selected[0].nonanswerReason)
    return {scorerOptionKey:selected[0].optionKey,frozenResponse:[selected[0].optionKey]}
  if(selected.some(o=>o.nonanswerReason)||
    (selected.length>1&&selected.some(o=>question.exclusiveOptionKeys?.includes(o.optionKey))))
    throw new Error('拒答、不适用或互斥选项不能与其他选项同时选择')
  if(selected.length!==raw.length||
    selected.length<(question.minSelections??1)||
    selected.length>(question.maxSelections??question.options.length))
    throw new Error('SJT 多选答案不在冻结的选择范围内')
  const derived=expandedSurveySjtOptions(question)
  const key='m'+canonicalHash({
    questionKey:question.questionKey,selectedKeys:selected.map(x=>x.optionKey),
  }).slice(0,22)
  if(!derived.some(o=>o.optionKey===key))throw new Error('SJT 多选组合未获准编译')
  return {scorerOptionKey:key,frozenResponse:selected.map(x=>x.optionKey)}
}
