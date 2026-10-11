import { canonicalHash } from '../assessment-runtime/canonical'
import { scoreScale } from '../scale/scale-scoring'
import { scoreSituationalModel } from '../situational/situation-model-resolver'
import { deriveAuthoritativeSituationalTrajectory } from '../situational/situation-trajectory'
import { asLinearSituationDefinition } from '../situational/situation-runtime-definition'
import { resolveSurveySjtAnswer } from './sjt-selection'
import { assertSurveyDraft, type FormDraft, type ScaleDraft, type SjtDraft } from './builder.definition'
import type { ResearchFrozenPublication, ResearchFrozenUnit } from './publication.service'
import type { ScaleDefinitionV2 } from '../scale/scale-definition'
import type { SituationDefinitionV2 } from '../situational/situation-branching'
import type { SituationalResponse } from '../situational/situation-scoring'

export class SurveyFinalValidationError extends Error {
  constructor(readonly path:string,message:string){super(message)}
}
function invalid(path:string,message:string): never {throw new SurveyFinalValidationError(path,message)}
/** Explicit refusal must not collide with participant-provided free text. */
export type ExplicitSurveyRefusal={_surveyRefusal:true}
export type AnswerPrimitive=string|number|string[]|Record<string,string|number|string[]>|ExplicitSurveyRefusal|null
const isRefusal=(value:unknown):value is ExplicitSurveyRefusal=>
  !!value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===1&&(value as ExplicitSurveyRefusal)._surveyRefusal===true
export type AnswerMap=Record<string,AnswerPrimitive>
export interface MissingItem {itemKey:string;reason:'NOT_SHOWN'|'SHOWN_MISSING'|'REFUSED'}
export interface FrozenUnitResult {
  instrumentKey:string
  kind:'FORM'|'SCALE'|'SJT'
  sourceDigest:string
  scoringDigest:string|null
  rawAnswers:AnswerMap
  missing:MissingItem[]
  privateScoring:unknown|null
}
export interface SurveyComputedFinal {
  schemaVersion:1
  definitionDigest:string
  units:FrozenUnitResult[]
}
const safeObject=(value:unknown,path:string):AnswerMap=>{
  if(!value||typeof value!=='object'||Array.isArray(value))invalid(path,'回答必须是题目到值的对象')
  const o=value as Record<string,unknown>
  if(Object.keys(o).length>500)invalid(path,'本轮提交的题目数量超限')
  if(Buffer.byteLength(JSON.stringify(o),'utf8')>512000)
    invalid(path,'单份工具提交不能超过 500 KB，请缩短答案')
  return o as AnswerMap
}
const optionValue=(value:unknown,choices:string[],path:string,required:boolean):string|null=>{
  if(value===null||value===undefined||value===''){
    if(required)invalid(path,'必答题目未完成')
    return null
  }
  if(typeof value!=='string'||!choices.includes(value))invalid(path,'回答不是此题允许的选项')
  return value as string
}
const formResult=(unit:ResearchFrozenUnit,answers:AnswerMap):FrozenUnitResult=>{
  // Preserve legacy frozen Form branching semantics; current Builder and
  // newly frozen Publications still reject incompatible condition operators.
  const d=assertSurveyDraft('FORM',unit.displayDefinition,true,true) as FormDraft
  const valid=new Set(d.pages.flatMap(p=>p.questions.map(q=>q.itemKey)))
  const matrixSubkeys=new Set(d.pages.flatMap(p=>p.questions
    .filter(q=>q.type==='MATRIX'||q.type==='MATRIX_MULTIPLE')
    .flatMap(q=>q.rows.map(r=>q.itemKey+':'+r.rowKey))))
  const permitted=new Set([...valid,...matrixSubkeys])
  for(const answerKey of Object.keys(answers))if(!permitted.has(answerKey))
    invalid('answers.'+answerKey,'提交包含不存在的或未授权题目')
  const normalized:AnswerMap={},missing:MissingItem[]=[]
  const previous:AnswerMap={}
  for(const p of d.pages)for(const q of p.questions){
    const path='answers.'+q.itemKey
    let shown=true
    if(q.displayIf){
      const source=previous[q.displayIf.itemKey]
      shown=q.displayIf.operator==='INCLUDES'
        ?Array.isArray(source)&&source.includes(q.displayIf.optionKey)
        :source===q.displayIf.optionKey
    }
    if(!shown){
      if(Object.prototype.hasOwnProperty.call(answers,q.itemKey)||
        q.rows.some(row=>Object.prototype.hasOwnProperty.call(answers,q.itemKey+':'+row.rowKey)))
        invalid(path,'隐藏的题目不能提交回答')
      missing.push({itemKey:q.itemKey,reason:'NOT_SHOWN'})
      continue
    }
    const value=answers[q.itemKey]
    if(q.type!=='MATRIX'&&q.type!=='MATRIX_MULTIPLE'&&isRefusal(value)){
      if(!q.allowRefusal)invalid(path,'此题未声明允许明确拒答')
      missing.push({itemKey:q.itemKey,reason:'REFUSED'})
      previous[q.itemKey]=null
      continue
    }
    if(q.type==='SINGLE'||q.type==='LIKERT'){
      const v=optionValue(value,q.options.map(x=>x.optionKey),path,q.required)
      if(v===null)missing.push({itemKey:q.itemKey,reason:'SHOWN_MISSING'})
      else normalized[q.itemKey]=v
    }else if(q.type==='MULTIPLE'){
      if(value===undefined||value===null){
        if(q.required)invalid(path,'必答多选题未完成')
        missing.push({itemKey:q.itemKey,reason:'SHOWN_MISSING'})
      }else{
        if(!Array.isArray(value)||value.some(x=>typeof x!=='string')||
          new Set(value).size!==value.length||value.some(x=>!q.options.some(o=>o.optionKey===x)))
          invalid(path,'多选内容必须为无重复的有效选项')
        if(q.required&&!value.length)invalid(path,'必答多选题没有选择')
        if(value.length&&((q.minSelections!==undefined&&value.length<q.minSelections)||
          (q.maxSelections!==undefined&&value.length>q.maxSelections)))
          invalid(path,'多选题选择数量不在规定范围内')
        normalized[q.itemKey]=value
      }
    }else if(q.type==='RANK_ORDER'){
      if(value===undefined||value===null){
        if(q.required)invalid(path,'必答排序题未完成')
        missing.push({itemKey:q.itemKey,reason:'SHOWN_MISSING'})
      }else{
        const codes=q.options.map(o=>o.optionKey)
        if(!Array.isArray(value)||value.length!==codes.length||
          value.some(x=>typeof x!=='string'||!codes.includes(x))||
          new Set(value).size!==value.length)
          invalid(path,'排序必须包含每个选项且不可重复')
        normalized[q.itemKey]=value
      }
    }else if(q.type==='CONSTANT_SUM'){
      if(value===undefined||value===null){
        if(q.required)invalid(path,'必答恒定总和题未完成')
        missing.push({itemKey:q.itemKey,reason:'SHOWN_MISSING'})
      }else{
        if(typeof value!=='object'||Array.isArray(value)||isRefusal(value))
          invalid(path,'恒定总和题必须提交选项到数值的对象')
        const numbers=value as Record<string,unknown>
        const codes=q.options.map(o=>o.optionKey)
        if(Object.keys(numbers).length!==codes.length||
          Object.keys(numbers).some(k=>!codes.includes(k)))
          invalid(path,'恒定总和题必须为每个选项提交一个数值')
        const values=codes.map(k=>numbers[k])
        if(values.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||
          (q.integerOnly&&!Number.isSafeInteger(v))))
          invalid(path,'恒定总和题必须是非负的有效数值')
        const sum=(values as number[]).reduce((a,b)=>a+b,0)
        if(!Number.isFinite(sum)||Math.abs(sum-(q.total??NaN))>1e-7)
          invalid(path,'各选项之和必须等于规定总值')
        normalized[q.itemKey]=Object.fromEntries(codes.map(k=>[k,numbers[k] as number]))
      }
    }else if(q.type==='MATRIX'||q.type==='MATRIX_MULTIPLE'){
      if(value!==undefined)invalid(path,'矩阵题请按独立行提交，不能提交未经验证的汇总字段')
      const rows:Record<string,string|string[]>={}
      for(const row of q.rows){
        const rowKey=q.itemKey+':'+row.rowKey
        if(isRefusal(answers[rowKey])){
          if(!q.allowRefusal)invalid(path+'.'+row.rowKey,'此矩阵行未声明允许明确拒答')
          missing.push({itemKey:rowKey,reason:'REFUSED'})
          continue
        }
        if(q.type==='MATRIX_MULTIPLE'){
          const selected=answers[rowKey]
          if(selected===undefined||selected===null){
            if(q.required)invalid(path+'.'+row.rowKey,'必答矩阵多选行未完成')
            missing.push({itemKey:rowKey,reason:'SHOWN_MISSING'})
          }else{
            const codes=q.options.map(o=>o.optionKey)
            if(!Array.isArray(selected)||selected.some(x=>typeof x!=='string'||!codes.includes(x))||
              new Set(selected).size!==selected.length||selected.length>codes.length)
              invalid(path+'.'+row.rowKey,'矩阵多选行包含无效或重复选项')
            if(q.required&&!selected.length)invalid(path+'.'+row.rowKey,'必答矩阵行不能空选')
            if(selected.length&&((q.minSelections!==undefined&&selected.length<q.minSelections)||
               (q.maxSelections!==undefined&&selected.length>q.maxSelections)))
              invalid(path+'.'+row.rowKey,'矩阵行选择数量不在规定范围内')
            rows[row.rowKey]=selected
          }
        }else{
          const v=optionValue(answers[rowKey],q.options.map(x=>x.optionKey),path+'.'+row.rowKey,q.required)
          if(v!==null)rows[row.rowKey]=v
          else missing.push({itemKey:rowKey,reason:'SHOWN_MISSING'})
        }
      }
      normalized[q.itemKey]=rows
    }else if(q.type==='NUMBER'||q.type==='SLIDER'){
      if(value===undefined||value===null||value===''){
        if(q.required)invalid(path,'必答数值题未完成')
        missing.push({itemKey:q.itemKey,reason:'SHOWN_MISSING'})
      }else{
        if(typeof value!=='number'||!Number.isFinite(value)
          ||(q.min!==undefined&&value<q.min)||(q.max!==undefined&&value>q.max))
          invalid(path,'数值超出允许范围或格式错误')
        if(q.integerOnly&&!Number.isSafeInteger(value))
          invalid(path,'请填写有效整数')
        if(q.precision!==undefined){
          const factor=10**q.precision
          if(Math.abs(Math.round(value*factor)-value*factor)>1e-7)
            invalid(path,`此题最多允许 ${q.precision} 位小数`)
        }
        if(q.step!==undefined){
          // The HTML number input anchors step to min when it is configured.
          const steps=(value-(q.min??0))/q.step
          if(!Number.isFinite(steps)||Math.abs(steps-Math.round(steps))>1e-7)
            invalid(path,`数值必须以 ${q.step} 为步长`)
        }
        normalized[q.itemKey]=value
      }
    }else if(q.type==='DATE'||q.type==='TIME'){
      if(value===undefined||value===null||value===''){
        if(q.required)invalid(path,'必答日期/时间题未完成')
        missing.push({itemKey:q.itemKey,reason:'SHOWN_MISSING'})
      }else{
        if(typeof value!=='string')invalid(path,'日期/时间回答必须是 ISO 格式字符串')
        if(q.type==='DATE'){
          if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)||value.startsWith('0000-')||
            Number.isNaN(Date.parse(value+'T00:00:00.000Z'))||
            !new Date(value+'T00:00:00.000Z').toISOString().startsWith(value+'T'))
            invalid(path,'日期必须是有效的 YYYY-MM-DD')
        }else if(!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(value))
          invalid(path,'时间必须是 24 小时 HH:mm 格式')
        normalized[q.itemKey]=value
      }
    }else{
      if(value===undefined||value===null||value===''){
        if(q.required)invalid(path,'必答文本题未完成')
        missing.push({itemKey:q.itemKey,reason:'SHOWN_MISSING'})
      }else{
        if(typeof value!=='string'||value.length>(q.maxLength??(q.type==='SHORT_TEXT'?300:10000)))
          invalid(path,'文本回答格式或长度不合法')
        if(q.textValidation==='EMAIL'&&!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value))
          invalid(path,'请填写有效电子邮箱格式')
        if(q.textValidation==='DIGITS'&&!/^\\d+$/.test(value))
          invalid(path,'文本只能包含数字')
        if(q.textValidation==='ALPHANUMERIC'&&!/^[a-z0-9]+$/i.test(value))
          invalid(path,'文本只能包含英文字母及数字')
        normalized[q.itemKey]=value
      }
    }
    // Display conditions must be evaluated from previously verified answers,
    // never from attacker-provided hidden/off-page state.
    previous[q.itemKey]=normalized[q.itemKey]??null
  }
  return {instrumentKey:unit.instrumentKey,kind:'FORM',sourceDigest:unit.sourceDigest,
    scoringDigest:null,rawAnswers:normalized,missing,privateScoring:null}
}
/** No Attempt, participant, FINAL or quota writes. Shares the exact frozen Form validator. */
export function dryRunSurveyForm(definition:unknown,answers:unknown){
  const normalized=assertSurveyDraft('FORM',definition,true) as FormDraft
  const unit={kind:'FORM',instrumentKey:'preview',sourceDigest:'dry-run',
    displayDefinition:normalized} as ResearchFrozenUnit
  const result=formResult(unit,safeObject(answers,'answers'))
  return {rawAnswers:result.rawAnswers,missing:result.missing}
}
const scaleResult=(unit:ResearchFrozenUnit,answers:AnswerMap):FrozenUnitResult=>{
  const display=assertSurveyDraft('SCALE',unit.displayDefinition,true) as ScaleDraft
  const allowed=new Set(display.items.map(q=>q.itemKey))
  for(const k of Object.keys(answers))if(!allowed.has(k))invalid('answers.'+k,'无效量表题目')
  const raw:Record<string,string>={}
  for(const item of display.items){
    const value=answers[item.itemKey]
    if(typeof value!=='string'||!display.responseOptions.some(o=>o.optionKey===value))
      invalid('answers.'+item.itemKey,'研究量表必须完整选择有效的响应选项')
    raw[item.itemKey]=value as string
  }
  const result=scoreScale(unit.compiledDefinition as ScaleDefinitionV2,raw)
  if(result.quality.status==='invalid')invalid('scoring','量表数据不足以计算研究得分')
  return {instrumentKey:unit.instrumentKey,kind:'SCALE',sourceDigest:unit.sourceDigest,
    scoringDigest:unit.scoringDigest,rawAnswers:raw,missing:[],privateScoring:result}
}
const sjtResult=(unit:ResearchFrozenUnit,answers:AnswerMap):FrozenUnitResult=>{
  const display=assertSurveyDraft('SJT',unit.displayDefinition,true) as SjtDraft
  const allowed=new Set(display.questions.map(q=>q.questionKey))
  for(const k of Object.keys(answers))if(!allowed.has(k))invalid('answers.'+k,'无效 SJT 题目')
  const definition=unit.compiledDefinition as SituationDefinitionV2
  const responses:SituationalResponse[]=[]
  const raw:Record<string,string|string[]>={}
  for(const q of display.questions){
    let chosen:{scorerOptionKey:string;frozenResponse:string|string[]}
    try{chosen=resolveSurveySjtAnswer(q,answers[q.questionKey])}
    catch(e){invalid('answers.'+q.questionKey,e instanceof Error?e.message:'不合法的情境选择')}
    const choice=chosen.scorerOptionKey
    const channels=definition.scenes.flatMap(scene=>scene.channels
      .filter(channel=>channel.channelKey===q.questionKey)
      .map(channel=>({scene,channel})))
    if(choice===null||channels.length!==1)invalid('answers.'+q.questionKey,'冻结 SJT 问题定义不明确')
    responses.push({sceneKey:channels[0].scene.sceneKey,channelKey:q.questionKey,responseValue:choice})
    raw[q.questionKey]=chosen.frozenResponse
  }
  const journey=deriveAuthoritativeSituationalTrajectory(definition,responses)
  if(!journey.reachedTerminal)invalid('answers','未完成情境要求的所有合法步骤')
  const scores=scoreSituationalModel(asLinearSituationDefinition(definition),responses)
  if(scores.quality.status==='invalid')invalid('scoring','情境数据无法生成受控研究结果')
  return {instrumentKey:unit.instrumentKey,kind:'SJT',sourceDigest:unit.sourceDigest,
    scoringDigest:unit.scoringDigest,rawAnswers:raw,missing:[],privateScoring:scores}
}
export function computeSurveyFinal(snapshot:ResearchFrozenPublication,input:Record<string,unknown>):SurveyComputedFinal{
  if(snapshot.schemaVersion!==1||snapshot.purpose!=='RESEARCH_ONLY'||
     snapshot.runtimeStatus!=='SURVEY_FINAL_V1'||!snapshot.units.length)
    invalid('publication','尚未提供可执行的 Survey 专用冻结定义')
  if(Object.keys(input).length!==snapshot.units.length)
    invalid('answers','提交的研究工具数量与发布定义不一致')
  const units=snapshot.units.map(unit=>{
    if(!Object.prototype.hasOwnProperty.call(input,unit.instrumentKey))
      invalid('answers.'+unit.instrumentKey,'缺少研究工具作答')
    const raw=safeObject(input[unit.instrumentKey],'answers.'+unit.instrumentKey)
    if(unit.kind==='FORM')return formResult(unit,raw)
    if(unit.kind==='SCALE')return scaleResult(unit,raw)
    if(unit.kind==='SJT')return sjtResult(unit,raw)
    return invalid('publication','未知研究内容类型')
  })
  const definitionDigest=canonicalHash(JSON.parse(JSON.stringify(snapshot)))
  return {schemaVersion:1,definitionDigest,units}
}
