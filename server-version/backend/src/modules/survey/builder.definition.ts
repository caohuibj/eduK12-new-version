import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import { expandedSurveySjtOptions } from './sjt-selection'
import { assessmentStaticImageAssetIdentitySchema } from '../assessment-media/assessment-image'

/** Survey-only research drafts, never platform scientific publication definitions. */
export const surveyKindSchema = z.enum(['FORM','SCALE','SJT'])
export type SurveyKind = z.infer<typeof surveyKindSchema>
export const surveyKeySchema = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/)
const label = z.string().trim().max(2000)
const note = z.string().trim().max(16000)
const key = surveyKeySchema
const option = z.object({
  optionKey: key, label, score: z.number().finite().min(-10000).max(10000).optional(),
}).strict()
export const surveyImageSchema=z.object({
  asset:assessmentStaticImageAssetIdentitySchema,
  altText:z.string().trim().min(1).max(300),
  caption:z.string().trim().max(1000).optional(),
  rightsStatus:z.enum(['self_authored','authorized','unknown']).default('unknown'),
  rightsNote:z.string().trim().max(2000).default(''),
}).strict()
const condition = z.object({
  itemKey:key, operator:z.enum(['EQUALS','INCLUDES']), optionKey:key,
}).strict()
export const formQuestionSchema=z.object({
  itemKey:key,
  type:z.enum(['SINGLE','MULTIPLE','SHORT_TEXT','LONG_TEXT','NUMBER','LIKERT','MATRIX']),
  prompt:note,
  image:surveyImageSchema.optional(),
  required:z.boolean(),
  allowRefusal:z.boolean().optional(),
  options:z.array(option).max(30).default([]),
  rows:z.array(z.object({rowKey:key,label}).strict()).max(40).default([]),
  min:z.number().finite().optional(),max:z.number().finite().optional(),
  maxLength:z.number().int().min(1).max(10000).optional(),
  displayIf:condition.optional(),
}).strict()
export const formDraftSchema=z.object({
  schemaVersion:z.literal(1),
  pages:z.array(z.object({
    pageKey:key,title:label,
    questions:z.array(formQuestionSchema).max(80),
  }).strict()).max(40),
}).strict()
export type FormDraft=z.infer<typeof formDraftSchema>
export const scaleDraftSchema=z.object({
  schemaVersion:z.literal(1),
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
export const sjtDraftSchema=z.object({
  schemaVersion:z.literal(1),
  respondentType:z.enum(['student_self_report','teacher_self_report']),
  scenarioKey:key, title:label,stimulus:note,
  image:surveyImageSchema.optional(),
  author:label,
  sourceNote:label,
  licenseStatus:z.enum(['self_authored','authorized','unknown']).optional(),
  redistribution:z.enum(['allowed','restricted','unknown']),
  metrics:z.array(z.object({
    metricKey:key,label,direction:z.literal('descriptive'),
  }).strict()).max(20),
  questions:z.array(z.object({
    questionKey:key,prompt:note,
    responseType:z.enum(['SINGLE','MULTIPLE']).optional(),
    aggregationPolicy:z.enum(['SUM','MEAN']).optional(),
    minSelections:z.number().int().min(1).max(6).optional(),
    maxSelections:z.number().int().min(1).max(6).optional(),
    options:z.array(z.object({
      optionKey:key,label,
      contributions:z.record(key,z.number().finite().min(-100000).max(100000)),
    }).strict()).max(12),
  }).strict()).max(5),
}).strict()
export type SjtDraft=z.infer<typeof sjtDraftSchema>
export type SurveyDraft=FormDraft|ScaleDraft|SjtDraft
export type Issue={path:string;message:string;severity:'error'|'warning'}
export const initialSurveyDefinition=(kind:SurveyKind):SurveyDraft=>{
  if(kind==='FORM')return {schemaVersion:1,pages:[]}
  if(kind==='SCALE')return {
    schemaVersion:1,respondentType:'participant_self_report',responseOptions:[
      {optionKey:'o1',label:'非常不同意',score:1},
      {optionKey:'o2',label:'不同意',score:2},
      {optionKey:'o3',label:'一般',score:3},
      {optionKey:'o4',label:'同意',score:4},
      {optionKey:'o5',label:'非常同意',score:5},
    ],
    dimensions:[],aggregation:'mean',items:[],
  }
  return {
    schemaVersion:1,respondentType:'student_self_report',scenarioKey:'scene1',title:'',stimulus:'',
    author:'',sourceNote:'',licenseStatus:'unknown',redistribution:'unknown',
    metrics:[],questions:[],
  }
}
export const surveyDraftSchemaFor=(kind:SurveyKind)=>
  kind==='FORM'?formDraftSchema:kind==='SCALE'?scaleDraftSchema:sjtDraftSchema
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
export const validateSurveyDraft=(kind:SurveyKind,input:unknown,forPreview=false):{
  definition?:SurveyDraft;issues:Issue[];digest?:string
}=>{
  const parsed=surveyDraftSchemaFor(kind).safeParse(input)
  if(!parsed.success)return {issues:parsed.error.issues.map(x=>({
    path:x.path.join('.')||'definition',message:x.message,severity:'error' as const,
  }))}
  const definition=parsed.data
  const issues:Issue[]=[]
  if(kind==='FORM'){
    const d=definition as FormDraft
    const items=d.pages.flatMap(p=>p.questions)
    if(items.length>300)err(issues,'pages','单份 Form 最多包含 300 道题目')
    unique(d.pages.map(p=>p.pageKey),'pages',issues)
    unique(items.map(q=>q.itemKey),'items',issues)
    if(forPreview&&!items.length)err(issues,'pages','至少添加一道题目')
    const previously=new Map<string,(typeof items)[number]>()
    d.pages.forEach((page,pi)=>{
      if(forPreview)requireText(page.title,`pages.${pi}.title`,issues)
      page.questions.forEach((q,qi)=>{
        const path=`pages.${pi}.questions.${qi}`
        if(forPreview)requireText(q.prompt,path+'.prompt',issues)
        if(forPreview&&q.image&&(q.image.rightsStatus==='unknown'||!q.image.rightsNote.trim()))
          err(issues,path+'.image','研究图片须明确作者或使用许可来源，才可发布')
        unique(q.options.map(o=>o.optionKey),path+'.options',issues)
        unique(q.rows.map(o=>o.rowKey),path+'.rows',issues)
        if(['SINGLE','MULTIPLE','LIKERT','MATRIX'].includes(q.type)){
          if(forPreview&&q.options.length<2)err(issues,path+'.options','选择题至少需要两项有效选项')
          if(forPreview)q.options.forEach((o,oi)=>requireText(o.label,path+`.options.${oi}`,issues))
        }else if(q.options.length)err(issues,path+'.options','非选项题不应附带选项')
        if(q.type==='MATRIX'){
          if(forPreview&&!q.rows.length)err(issues,path+'.rows','矩阵题至少需要一行')
          if(forPreview)q.rows.forEach((o,oi)=>requireText(o.label,path+`.rows.${oi}`,issues))
        }else if(q.rows.length)err(issues,path+'.rows','只有矩阵题包含行编码')
        if(q.min!==undefined&&q.max!==undefined&&q.min>q.max)
          err(issues,path,'最小数值不能大于最大数值')
        if(q.type!=='NUMBER'&&(q.min!==undefined||q.max!==undefined))
          err(issues,path,'数值范围仅可用于数值题')
        if(q.displayIf){
          const previous=previously.get(q.displayIf.itemKey)
          if(!previous||!['SINGLE','MULTIPLE','LIKERT'].includes(previous.type))
            err(issues,path+'.displayIf','条件只能引用此前的单选、多选或 Likert 题目')
          else {
            if(!previous.options.some(o=>o.optionKey===q.displayIf!.optionKey))
              err(issues,path+'.displayIf.optionKey','引用的选项已不存在')
            if(previous.type==='MULTIPLE'
              ?q.displayIf.operator!=='INCLUDES'
              :q.displayIf.operator!=='EQUALS')
              err(issues,path+'.displayIf.operator','多选条件必须使用 INCLUDES，单选/Likert 条件必须使用 EQUALS')
          }
        }
        previously.set(q.itemKey,q)
      })
    })
  }
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
  if(kind==='SJT'){
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
  return {definition,issues,digest:canonicalHash(canonical)}
}
export const assertSurveyDraft=(kind:SurveyKind,input:unknown,forPreview=false):SurveyDraft=>{
  const result=validateSurveyDraft(kind,input,forPreview)
  if(!result.definition||result.issues.some(i=>i.severity==='error'))
    throw new SurveyDraftError(result.issues)
  return result.definition
}
export class SurveyDraftError extends Error {
  constructor(readonly issues:Issue[]){super('研究工具尚有需修正的字段');this.name='SurveyDraftError'}
}
