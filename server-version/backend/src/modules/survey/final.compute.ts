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
export type AnswerPrimitive=string|number|string[]|Record<string,string>|null
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
  const d=assertSurveyDraft('FORM',unit.displayDefinition,true) as FormDraft
  const valid=new Set(d.pages.flatMap(p=>p.questions.map(q=>q.itemKey)))
  const matrixSubkeys=new Set(d.pages.flatMap(p=>p.questions
    .filter(q=>q.type==='MATRIX')
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
    if(q.type!=='MATRIX'&&value==='REFUSED'){
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
        normalized[q.itemKey]=value
      }
    }else if(q.type==='MATRIX'){
      if(value!==undefined)invalid(path,'矩阵题请按独立行提交，不能提交未经验证的汇总字段')
      const rows:Record<string,string>={}
      for(const row of q.rows){
        const rowKey=q.itemKey+':'+row.rowKey
        if(answers[rowKey]==='REFUSED'){
          if(!q.allowRefusal)invalid(path+'.'+row.rowKey,'此矩阵行未声明允许明确拒答')
          missing.push({itemKey:rowKey,reason:'REFUSED'})
          continue
        }
        const v=optionValue(answers[rowKey],q.options.map(x=>x.optionKey),path+'.'+row.rowKey,q.required)
        if(v!==null)rows[row.rowKey]=v
        else missing.push({itemKey:rowKey,reason:'SHOWN_MISSING'})
      }
      normalized[q.itemKey]=rows
    }else if(q.type==='NUMBER'){
      if(value===undefined||value===null||value===''){
        if(q.required)invalid(path,'必答数值题未完成')
        missing.push({itemKey:q.itemKey,reason:'SHOWN_MISSING'})
      }else{
        if(typeof value!=='number'||!Number.isFinite(value)
          ||(q.min!==undefined&&value<q.min)||(q.max!==undefined&&value>q.max))
          invalid(path,'数值超出允许范围或格式错误')
        normalized[q.itemKey]=value
      }
    }else{
      if(value===undefined||value===null||value===''){
        if(q.required)invalid(path,'必答文本题未完成')
        missing.push({itemKey:q.itemKey,reason:'SHOWN_MISSING'})
      }else{
        if(typeof value!=='string'||value.length>(q.maxLength??(q.type==='SHORT_TEXT'?300:10000)))
          invalid(path,'文本回答格式或长度不合法')
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
