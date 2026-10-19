import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import { expandedSurveySjtOptions } from './sjt-selection'
import { validateSurveySjtV2 } from './sjt-v2.validation'
import { cognitiveDraftSchema, initialCognitiveDefinition, validateCognitiveDraft, type CognitiveDraft } from './cognitive.definition'
import { assessmentKeySchema as surveyKeySchema, assessmentImageSchema as surveyImageSchema } from '../assessment-core/definition-primitives'
import { formDraftSchema, validateFormDefinition, type FormDraft } from '../assessment-core/form/definition'
export { assessmentKeySchema as surveyKeySchema, assessmentImageSchema as surveyImageSchema } from '../assessment-core/definition-primitives'
export { formDraftSchema, formQuestionSchema, formQuestionRegistry, formAnswerFieldCount,
  formWorstCaseAnswerBytes, FORM_MAX_ANSWER_FIELDS as SURVEY_FORM_MAX_ANSWER_FIELDS } from '../assessment-core/form/definition'
export type { FormDraft, FormQuestion, FormQuestionType } from '../assessment-core/form/definition'

/** Survey-only research drafts, never platform scientific publication definitions. */
export const surveyKindSchema = z.enum(['FORM','SCALE','SJT','COGNITIVE'])
export type SurveyKind = z.infer<typeof surveyKindSchema>
const label = z.string().trim().max(2000)
const note = z.string().trim().max(16000)
const key = surveyKeySchema
const option = z.object({
  optionKey: key, label, score: z.number().finite().min(-10000).max(10000).optional(),
}).strict()
export const scaleDraftSchema=z.object({
  schemaVersion:z.literal(1),
  /** Missing on historical immutable Scale publications means ALL_AT_ONCE. */
  presentationMode:z.enum(['ONE_BY_ONE','ALL_AT_ONCE']).optional(),
  respondentType:z.enum(['participant_self_report','teacher_self_report','student_self_report']),
  responseOptions:z.array(option.extend({score:z.number().finite().min(-10000).max(10000)})).max(15),
  dimensions:z.array(z.object({
    dimensionKey:key,label,
    direction:z.enum(['descriptive','higher_is_more','higher_is_better','higher_is_worse','bipolar']),
  }).strict()).max(20),
  aggregation:z.enum(['sum','mean']),
  items:z.array(z.object({
    itemKey:key,prompt:note,required:z.boolean(),
    reverse:z.boolean(),dimensionKeys:z.array(key).max(20),
  }).strict()).max(240),
}).strict()
export type ScaleDraft=z.infer<typeof scaleDraftSchema>
export { sjtDraftV1Schema, sjtDraftV2Schema, sjtQuestionV2Schema, sjtDraftSchema, SJT_V2_LIMITS as SURVEY_SJT_V2_LIMITS } from '../assessment-core/sjt/definition'
export type { SjtDraft, SjtDraftV2, SjtQuestionV2, AnySjtDraft } from '../assessment-core/sjt/definition'
import { sjtDraftSchema, type SjtDraft, type SjtDraftV2, type AnySjtDraft } from '../assessment-core/sjt/definition'
export type SurveyDraft=FormDraft|ScaleDraft|AnySjtDraft|CognitiveDraft
export type Issue={path:string;message:string;severity:'error'|'warning'}
export const initialSurveyDefinition=(kind:SurveyKind):SurveyDraft=>{
  if(kind==='FORM')return {schemaVersion:1,pages:[]}
  if(kind==='SCALE')return {
    schemaVersion:1,presentationMode:'ONE_BY_ONE',
    respondentType:'participant_self_report',responseOptions:[
      {optionKey:'o1',label:'非常不同意',score:1},
      {optionKey:'o2',label:'不同意',score:2},
      {optionKey:'o3',label:'一般',score:3},
      {optionKey:'o4',label:'同意',score:4},
      {optionKey:'o5',label:'非常同意',score:5},
    ],
    dimensions:[],aggregation:'mean',items:[],
  }
  if(kind==='COGNITIVE')return initialCognitiveDefinition()
  return {
    schemaVersion:2,respondentType:'participant_self_report',title:'',
    author:'',sourceNote:'',licenseStatus:'unknown',redistribution:'unknown',orderPolicy:'FIXED',
    metrics:[],scoring:{modelKey:'AUTHOR_KEY_SUM',modelVersion:'1',sourceNote:''},scenes:[],
  }
}
export const surveyDraftSchemaFor=(kind:SurveyKind)=>
  kind==='FORM'?formDraftSchema:kind==='SCALE'?scaleDraftSchema:kind==='COGNITIVE'?cognitiveDraftSchema:sjtDraftSchema
const unique=(values:string[],path:string,issues:Issue[])=>{
  const seen=new Set<string>()
  values.forEach((value,index)=>{
    if(seen.has(value))issues.push({path:path+'.'+index,message:'标识重复，请使用新的稳定编码',severity:'error'})
    seen.add(value)
  })
}
const requireText=(value:string,path:string,issues:Issue[])=>{
  if(!value.trim())issues.push({path,message:'请填写内容',severity:'error'})
}
const err=(issues:Issue[],path:string,message:string)=>issues.push({path,message,severity:'error'})
const validateSurveyDraftCore=(
  kind:SurveyKind,input:unknown,forPreview:boolean,
  allowLegacyFrozenConditionOperators:boolean,includeDigest:boolean,
):{
  definition?:SurveyDraft;issues:Issue[];digest?:string
}=>{
  if(kind==='FORM')return validateFormDefinition(input,{forPreview,allowLegacyFrozenConditionOperators,includeDigest})
  const parsed=surveyDraftSchemaFor(kind).safeParse(input)
  if(!parsed.success)return {issues:parsed.error.issues.map(x=>({
    path:x.path.join('.')||'definition',message:x.message,severity:'error' as const,
  }))}
  const definition=parsed.data
  const issues:Issue[]=[]
  if(kind==='SCALE'){
    const d=definition as ScaleDraft
    unique(d.responseOptions.map(o=>o.optionKey),'responseOptions',issues)
    unique(d.dimensions.map(o=>o.dimensionKey),'dimensions',issues)
    unique(d.items.map(o=>o.itemKey),'items',issues)
    if(forPreview){
      if(d.responseOptions.length<2)err(issues,'responseOptions','至少两种响应选项')
      if(!d.dimensions.length)err(issues,'dimensions','至少一个维度')
      if(!d.items.length)err(issues,'items','至少一道题目')
      d.responseOptions.forEach((o,i)=>requireText(o.label,`responseOptions.${i}.label`,issues))
    }
    const dimSet=new Set(d.dimensions.map(x=>x.dimensionKey))
    d.items.forEach((q,i)=>{
      if(forPreview)requireText(q.prompt,`items.${i}.prompt`,issues)
      if(forPreview&&!q.dimensionKeys.length)err(issues,`items.${i}.dimensionKeys`,'至少归属一个维度')
      unique(q.dimensionKeys,`items.${i}.dimensionKeys`,issues)
      q.dimensionKeys.forEach(k=>{if(!dimSet.has(k))err(issues,`items.${i}.dimensionKeys`,'引用了不存在的维度')})
      if(forPreview&&!q.required)err(issues,`items.${i}.required`,'首版研究描述性量表要求完整作答')
    })
    if(forPreview)d.dimensions.forEach((dim,i)=>{
      requireText(dim.label,`dimensions.${i}.label`,issues)
      if(!d.items.some(q=>q.dimensionKeys.includes(dim.dimensionKey)))
        err(issues,`dimensions.${i}`,'维度至少包含一道题目')
    })
  }
  if(kind==='COGNITIVE')issues.push(...validateCognitiveDraft(definition as CognitiveDraft,forPreview))
  if(kind==='SJT'&&definition.schemaVersion===2)issues.push(...validateSurveySjtV2(definition as SjtDraftV2,forPreview))
  if(kind==='SJT'&&definition.schemaVersion===1){
    const d=definition as SjtDraft
    unique(d.metrics.map(m=>m.metricKey),'metrics',issues)
    unique(d.questions.map(q=>q.questionKey),'questions',issues)
    if(forPreview){
      requireText(d.title,'title',issues)
      requireText(d.stimulus,'stimulus',issues)
      if(d.image&&(d.image.rightsStatus==='unknown'||!d.image.rightsNote.trim()))
        err(issues,'image','共享场景图片须明确版权或使用许可依据')
      if(!d.metrics.length)err(issues,'metrics','至少一个测量构念')
      if(d.questions.length<2)err(issues,'questions','共享场景至少两道题目')
      requireText(d.author,'author',issues)
      requireText(d.sourceNote,'sourceNote',issues)
      if(!d.licenseStatus||d.licenseStatus==='unknown')
        err(issues,'licenseStatus','必须明确内容为研究者原创或取得合法授权')
      if(d.redistribution!=='allowed')
        err(issues,'redistribution','研究公开呈现前必须确认素材允许此用途的展示与分发')
    }
    const dims=new Set(d.metrics.map(m=>m.metricKey))
    d.questions.forEach((q,i)=>{
      const path=`questions.${i}`
      unique(q.options.map(o=>o.optionKey),path+'.options',issues)
      if(q.responseType==='MULTIPLE'){
        if(forPreview&&!q.aggregationPolicy)
          err(issues,path+'.aggregationPolicy','多选必须明确选择 SUM 总贡献或 MEAN 平均贡献')
        const min=q.minSelections??1,max=q.maxSelections??q.options.length
        if(min>max||max>q.options.length||q.options.length>6)
          err(issues,path+'.maxSelections','多选限 2–6 个选项，最少/最多选择必须有效')
        // Reuse official SINGLE_CHOICE scorer with a bounded deterministic
        // enumeration of legal combinations; never add ad-hoc score logic.
        try{expandedSurveySjtOptions(q)}
        catch(e){err(issues,path+'.options',e instanceof Error?e.message:'多选组合无效')}
      }else if(q.minSelections!==undefined||q.maxSelections!==undefined||
        q.aggregationPolicy!==undefined)
        err(issues,path,'单选题不得配置多选次数或计分汇总策略')
      if(forPreview)requireText(q.prompt,path+'.prompt',issues)
      if(forPreview&&q.options.length<2)err(issues,path+'.options','至少两个选项')
      q.options.forEach((o,j)=>{
        if(forPreview)requireText(o.label,`questions.${i}.options.${j}.label`,issues)
        Object.keys(o.contributions).forEach(k=>{if(!dims.has(k))err(issues,path+'.contributions','贡献权重引用了不存在的构念')})
        if(forPreview)d.metrics.forEach(m=>{
          if(o.contributions[m.metricKey]===undefined)err(issues,path+'.contributions','每个选项需显式填写所有构念的权重（可以为 0）')
        })
      })
    })
  }
  const canonical=JSON.parse(JSON.stringify({kind,definition}))
  if(Buffer.byteLength(JSON.stringify(canonical),'utf8')>480000)
    err(issues,'definition','单份研究工具数据体积不能超过 480 KB')
  return includeDigest?{definition,issues,digest:canonicalHash(canonical)}:{definition,issues}
}
export const validateSurveyDraft=(
  kind:SurveyKind,input:unknown,forPreview=false,
  // Historical immutable Publications could contain operator pairs accepted
  // before the v1.1 authoring check. Only their runtime projection opts in.
  allowLegacyFrozenConditionOperators=false,
):{
  definition?:SurveyDraft;issues:Issue[];digest?:string
}=>validateSurveyDraftCore(kind,input,forPreview,allowLegacyFrozenConditionOperators,true)
export const assertSurveyDraft=(
  kind:SurveyKind,input:unknown,forPreview=false,
  allowLegacyFrozenConditionOperators=false,
):SurveyDraft=>{
  // Keep normalization and every validation, including the serialized size
  // budget; assertions do not consume the authoring API's draft digest.
  const result=validateSurveyDraftCore(
    kind,input,forPreview,allowLegacyFrozenConditionOperators,false,
  )
  if(!result.definition||result.issues.some(i=>i.severity==='error'))
    throw new SurveyDraftError(result.issues)
  return result.definition
}
export class SurveyDraftError extends Error {
  constructor(readonly issues:Issue[]){super('研究工具尚有需修正的字段');this.name='SurveyDraftError'}
}
