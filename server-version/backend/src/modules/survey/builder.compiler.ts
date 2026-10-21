import { canonicalHash } from '../assessment-runtime/canonical'
import {
  validateScaleDefinition, isScaleContentItem, type ScaleDefinitionV2,
} from '../scale/scale-definition'
import { scoreScale } from '../scale/scale-scoring'
import { compileSjtTemplate, SjtTemplateError } from '../situational/authoring/template'
import type { SituationalResponse } from '../situational/situation-scoring'
import { scoreSituationalModel } from '../situational/situation-model-resolver'
import { asLinearSituationDefinition } from '../situational/situation-runtime-definition'
import { expandedSurveySjtOptions,resolveSurveySjtAnswer } from './sjt-selection'
import { compileSurveySjtV2 } from './sjt-v2.compiler'
import { normalizeSurveySjtAnswers, scoreResearchSjtAnswers, SurveySjtAnswerError } from './sjt-runtime'
import { previewCognitiveDraft } from './cognitive.definition'
import {
  assertSurveyDraft, validateSurveyDraft, SurveyDraftError,
  type SurveyKind, type ScaleDraft, type SjtDraft, type SjtDraftV2, type AnySjtDraft, type FormDraft,
  type Issue,
} from './builder.definition'

const disclaimer='研究者自编探索性工具。结果用于本项目科研记录，无常模或诊断效力；被试只接收获准的通用反馈。'

/** The canonical score engine is the same ScaleDefinitionV2 and scoreScale used by production. */
export function compileResearchScale(title:string,input:unknown):ScaleDefinitionV2 {
  const d=assertSurveyDraft('SCALE',input,true) as ScaleDraft
  const scores:ScaleDefinitionV2['scoring']['scores']=d.dimensions.map((dimension,i)=>({
    key:dimension.dimensionKey,
    type:'dimension' as const,
    label:dimension.label,
    direction:dimension.direction,
    canonical:i===0,
    displayPrecision:2,
    source:{
      type:'items' as const,
      items:d.items.filter(q=>isScaleContentItem(q)&&q.dimensionKeys.includes(dimension.dimensionKey))
        .map(q=>({itemCode:q.itemKey,weight:1})),
      aggregation:d.aggregation,
    },
  }))
  if(d.totalScore)scores.push({key:d.totalScore.key,type:'total',label:d.totalScore.label,direction:'descriptive',canonical:false,displayPrecision:2,
    source:{type:'items',items:d.totalScore.itemKeys.map(itemCode=>({itemCode,weight:1})),aggregation:d.totalScore.aggregation}})
  const definition:ScaleDefinitionV2={
    schemaVersion:2,respondentType:d.respondentType,
    source:{title},license:{status:'self_authored',redistribution:'allowed'},
    display:{randomizeItems:false},
    responseSets:[{key:'research_options',options:d.responseOptions.map(x=>({
      value:x.optionKey,label:x.label,score:x.score,
    }))}],
    items:d.items.map((q,i)=>({
      itemCode:q.itemKey,content:q.prompt,type:'single',required:q.required,
      ...(q.purpose?{purpose:q.purpose}:{}),...(q.attentionTarget!==undefined?{attentionTarget:q.attentionTarget}:{}),
      sortOrder:i,responseSetKey:'research_options',randomizeOptions:false,
    })),
    scoring:{
      scoringVersion:'survey-research-v1',
      itemRules:d.items.filter(isScaleContentItem).map(q=>({itemCode:q.itemKey,transform:{type:q.reverse?'reverse' as const:'identity' as const}})),
      defaultMissingPolicy:{type:'complete_required'},
      scores,
    },
    report:{
      reportVersion:'survey-private-score-v1',
      ...(d.rawScoreFeedback?{rawScoreFeedback:d.rawScoreFeedback}:{}),
      primaryScoreKeys:d.dimensions.slice(0,1).map(x=>x.dimensionKey),
      scoreOrder:scores.map(x=>x.key),
      interpretations:scores.map(x=>({
        scoreKey:x.key,headline:x.label,
        source:{type:'score_only' as const},summary:'研究探索性得分，不对被试作诊断或常模解释。',
        bands:[],guidance:[],
      })),
      limitations:['未经研究样本验证的描述性分数；不提供常模和诊断解释。'],
      disclaimer,
    },
    referencePolicy:{type:'none'},
  }
  const result=validateScaleDefinition(definition,{instrumentClass:'CUSTOM_DESCRIPTIVE'})
  const errors=result.issues.filter(issue=>issue.severity==='error')
  if(errors.length)throw new SurveyDraftError(errors)
  return result.definition!
}

export function compileResearchSjt(instrumentKey:string,input:unknown) {
  const d=assertSurveyDraft('SJT',input,true) as AnySjtDraft
  if(d.schemaVersion===2)return compileSurveySjtV2(instrumentKey,d)
  const optionsByQuestion=new Map(d.questions.map(q=>[q.questionKey,expandedSurveySjtOptions(q)]))
  const scorerOptions=(q:SjtDraft['questions'][number])=>optionsByQuestion.get(q.questionKey)!
  const template={
    templateVersion:'sjt-upload-v1' as const,
    instrumentKey:'research-'+canonicalHash(instrumentKey).slice(0,24),
    instrumentVersion:'0.1.0',
    title:d.title,
    respondentType:d.respondentType,
    entryNodeKey:d.questions[0].questionKey,
    author:d.author||'研究者自编',
    sourceNote:d.sourceNote||'探索性自编研究情境',
    disclaimer,
    licenseStatus:d.licenseStatus??'unknown',
    redistribution:d.redistribution,
    nodes:d.questions.map(q=>({
      nodeKey:q.questionKey,motherSceneKey:d.scenarioKey,title:d.title,stimulus:d.stimulus,
    })),
    questions:d.questions.map(q=>({
      nodeKey:q.questionKey,questionKey:q.questionKey,prompt:q.prompt,
      kind:'CORE' as const,purpose:'BEHAVIOR_TENDENCY' as const,
      required:true,order:0,
    })),
    options:d.questions.flatMap(q=>scorerOptions(q).map(o=>({
      questionKey:q.questionKey,optionKey:o.optionKey,label:o.label,
    }))),
    transitions:d.questions.flatMap((q,index)=>scorerOptions(q).map(o=>({
      nodeKey:q.questionKey,optionKey:o.optionKey,
      nextNodeKey:d.questions[index+1]?.questionKey||'END',bridgeText:'',
    }))),
    metrics:d.metrics.map((metric,i)=>({
      metricKey:metric.metricKey,label:metric.label,
      construct:metric.metricKey,role:i===0?'primary' as const:'secondary' as const,
    })),
    opportunities:d.questions.flatMap(q=>d.metrics.map(m=>({
      nodeKey:q.questionKey,metricKey:m.metricKey,
      applicability:'OPPORTUNITY' as const,
    }))),
    scores:d.questions.flatMap(q=>scorerOptions(q).flatMap(o=>d.metrics.map(m=>({
      nodeKey:q.questionKey,optionKey:o.optionKey,metricKey:m.metricKey,
      contribution:o.contributions[m.metricKey],
    })))),
    // The scientific report is not exposed to participants. PR3 enforces a
    // separate, General-only participant response projection.
    feedback:d.questions.flatMap(q=>scorerOptions(q).map(o=>({
      questionKey:q.questionKey,optionKey:o.optionKey,
      kind:'ACTION' as const,text:'仅记录研究选择，不构成正确或错误的个人评价。',
    }))),
    comparisons:[],
    cases:[],
  }
  try{
    return compileSjtTemplate(template)
  }catch(error){
    if(error instanceof SjtTemplateError)throw new SurveyDraftError(error.issues.map(x=>({
      path:x.path,message:x.message,severity:'error' as const,
    })))
    throw error
  }
}
export type PreviewAnswers=Record<string,string|number|string[]|{_surveyRefusal:true}|null>
export function previewResearchInstrument(input:{
  kind:SurveyKind;instrumentKey:string;title:string;definition:unknown;answers?:PreviewAnswers
}){
  const validation=validateSurveyDraft(input.kind,input.definition,true)
  if(!validation.definition||validation.issues.some(x=>x.severity==='error'))
    return {ok:false,issues:validation.issues,score:null}
  const hash=canonicalHash(JSON.parse(JSON.stringify({kind:input.kind,definition:validation.definition})))
  try{
    if(input.kind==='FORM'){
      const data=validation.definition as FormDraft
      return {ok:true,issues:[],kind:'FORM',definitionDigest:hash,
        pageCount:data.pages.length,questionCount:data.pages.flatMap(x=>x.questions).length,
        score:null,participantReport:'GENERAL_ONLY'}
    }
    if(input.kind==='SCALE'){
      const compiled=compileResearchScale(input.title,input.definition)
      const scoreAnswers:Record<string,string|number>={}
      for(const [key,answer] of Object.entries(input.answers||{})){
        if(typeof answer!=='string'&&typeof answer!=='number')
          throw new SurveyDraftError([{path:'answers.'+key,
            message:'量表预览只接受合法单选编码',severity:'error'}])
        scoreAnswers[key]=answer
      }
      const score=input.answers?scoreScale(compiled,scoreAnswers):null
      return {ok:true,issues:[],kind:'SCALE',definitionDigest:hash,
        scoringDigest:canonicalHash(compiled.scoring),compiledDefinition:compiled,
        score,participantReport:'GENERAL_ONLY'}
    }
    if(input.kind==='COGNITIVE')return previewCognitiveDraft(validation.definition as import('./cognitive.definition').CognitiveDraft)
    const compiled=compileResearchSjt(input.instrumentKey,input.definition)
    if(validation.definition.schemaVersion===2){
      const authored=validation.definition as SjtDraftV2
      const normalized=normalizeSurveySjtAnswers(authored,compiled.package.definition as import('../situational/situation-branching').SituationDefinitionV2,
        input.answers||{},{requireComplete:false})
      const score=input.answers?scoreResearchSjtAnswers(authored,compiled.package.definition as import('../situational/situation-branching').SituationDefinitionV2,normalized.responses):null
      return {ok:true,issues:[],kind:'SJT',definitionDigest:hash,
        scoringDigest:canonicalHash(compiled.package.definition.scoring),compilerDigest:compiled.contentDigest,
        compiledDefinition:compiled.package.definition,score,missing:normalized.missing,
        questionResults:normalized.questionResults,participantReport:'GENERAL_ONLY'}
    }
    const answers=input.answers||{}
    const authored=input.definition as SjtDraft
    const normalizedResponses=Object.fromEntries(authored.questions
      .filter(q=>Object.prototype.hasOwnProperty.call(answers,q.questionKey))
      .map(q=>[q.questionKey,resolveSurveySjtAnswer(q,answers[q.questionKey]).scorerOptionKey]))
    const values:SituationalResponse[]=compiled.package.definition.scenes
      .flatMap(scene=>scene.channels
        .filter(channel=>Object.prototype.hasOwnProperty.call(normalizedResponses,channel.channelKey))
        .map(channel=>({
          sceneKey:scene.sceneKey,channelKey:channel.channelKey,
          responseValue:normalizedResponses[channel.channelKey],
        })))
    const score=Object.keys(answers).length?scoreSituationalModel(asLinearSituationDefinition(compiled.package.definition),values):null
    return {ok:true,issues:[],kind:'SJT',definitionDigest:hash,
      scoringDigest:canonicalHash(compiled.package.definition.scoring),
      compilerDigest:compiled.contentDigest,
      compiledDefinition:compiled.package.definition,
      score,participantReport:'GENERAL_ONLY'}
  }catch(error){
    if(error instanceof SurveySjtAnswerError)return {ok:false,issues:[{path:error.path,message:error.message,severity:'error' as const}],score:null}
    if(error instanceof SurveyDraftError)return {ok:false,issues:error.issues,score:null}
    const issues:Issue[]=[{path:'definition',message:'研究工具未能通过编译，请核对完整题目与计分定义',severity:'error'}]
    return {ok:false,issues,score:null}
  }
}
