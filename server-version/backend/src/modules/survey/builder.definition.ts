import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import { expandedSurveySjtOptions } from './sjt-selection'
import { validateSurveySjtV2 } from './sjt-v2.validation'
import { cognitiveDraftSchema, initialCognitiveDefinition, validateCognitiveDraft, type CognitiveDraft } from './cognitive.definition'
import { assessmentStaticImageAssetIdentitySchema } from '../assessment-media/assessment-image'

/** Survey-only research drafts, never platform scientific publication definitions. */
export const surveyKindSchema = z.enum(['FORM','SCALE','SJT','COGNITIVE'])
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
export const SURVEY_FORM_MAX_ANSWER_FIELDS=500
/** Count wire-level keys; each MATRIX row is one key before FINAL normalization. */
export const formAnswerFieldCount=(form:FormDraft)=>form.pages.reduce((sum,page)=>
  sum+page.questions.reduce((n,q)=>n+(['MATRIX','MATRIX_MULTIPLE'].includes(q.type)?q.rows.length:1)
    +(q.otherOptionKey?1:0),0),0)
/** V2 question registry is fixed application code, never researcher-supplied scripts. */
export const formQuestionRegistry={
  SINGLE:{version:1,shape:'choice'},MULTIPLE:{version:1,shape:'choices'},
  SHORT_TEXT:{version:1,shape:'text'},LONG_TEXT:{version:1,shape:'text'},
  NUMBER:{version:1,shape:'number'},LIKERT:{version:1,shape:'choice'},
  MATRIX:{version:1,shape:'row_choice'},
  DATE:{version:2,shape:'date'},TIME:{version:2,shape:'time'},
  RANK_ORDER:{version:2,shape:'ranking'},SLIDER:{version:2,shape:'number'},
  CONSTANT_SUM:{version:2,shape:'option_numbers'},
  MATRIX_MULTIPLE:{version:2,shape:'row_choices'},
} as const
export type FormQuestionType=keyof typeof formQuestionRegistry
/** Conservative maximum serialized answer bytes before an instrument is published.
 * JSON may expand control characters to 6 ASCII bytes per UTF-16 code unit.
 * This protects both simple large free-text forms and dense matrix multi-select.
 */
export const formWorstCaseAnswerBytes=(form:FormDraft)=>{
  const quote=(value:string)=>Buffer.byteLength(JSON.stringify(value),'utf8')
  let bytes=2 // root JSON object
  for(const page of form.pages)for(const q of page.questions){
    const option= Math.max(4,...q.options.map(o=>quote(o.optionKey)),
      q.allowRefusal?23:0)
    const allOptions=2+q.options.reduce((n,o)=>n+quote(o.optionKey)+1,0)
    const valueBytes=()=>{
      if(q.type==='SHORT_TEXT'||q.type==='LONG_TEXT')
        return 2+6*(q.maxLength??(q.type==='SHORT_TEXT'?300:10000))
      if(q.type==='MULTIPLE'||q.type==='RANK_ORDER')return allOptions
      if(q.type==='CONSTANT_SUM')return 2+q.options.reduce((n,o)=>n+quote(o.optionKey)+32,0)
      if(q.type==='DATE')return 12
      if(q.type==='TIME')return 7
      if(q.type==='NUMBER'||q.type==='SLIDER')return 30
      return option
    }
    if(q.type==='MATRIX'||q.type==='MATRIX_MULTIPLE'){
      for(const row of q.rows)bytes+=quote(q.itemKey+':'+row.rowKey)+
        (q.type==='MATRIX_MULTIPLE'?allOptions:option)+2
    }else bytes+=quote(q.itemKey)+valueBytes()+2
    if(q.otherOptionKey)bytes+=quote(q.itemKey+':other')+2+6*(q.otherMaxLength??300)+2
  }
  return bytes
}
export const formQuestionSchema=z.object({
  itemKey:key,
  type:z.enum(['SINGLE','MULTIPLE','SHORT_TEXT','LONG_TEXT','NUMBER','LIKERT','MATRIX',
    'DATE','TIME','RANK_ORDER','SLIDER','CONSTANT_SUM','MATRIX_MULTIPLE']),
  prompt:note,
  image:surveyImageSchema.optional(),
  required:z.boolean(),
  allowRefusal:z.boolean().optional(),
  options:z.array(option).max(30).default([]),
  rows:z.array(z.object({rowKey:key,label}).strict()).max(40).default([]),
  min:z.number().finite().optional(),max:z.number().finite().optional(),
  integerOnly:z.boolean().optional(),
  step:z.number().finite().positive().max(1000000000).optional(),
  precision:z.number().int().min(0).max(8).optional(),
  total:z.number().finite().min(0).max(1000000).optional(),
  minSelections:z.number().int().min(1).max(30).optional(),
  maxSelections:z.number().int().min(1).max(30).optional(),
  textValidation:z.enum(['EMAIL','DIGITS','ALPHANUMERIC']).optional(),
  otherOptionKey:key.optional(),otherMaxLength:z.number().int().min(1).max(2000).optional(),
  exclusiveOptionKeys:z.array(key).max(30).optional(),
  timeZone:z.enum(['Asia/Shanghai','UTC']).optional(),
  maxLength:z.number().int().min(1).max(10000).optional(),
  displayIf:condition.optional(),
}).strict()
export type FormQuestion=z.infer<typeof formQuestionSchema>
export const formDraftSchema=z.object({
  schemaVersion:z.union([z.literal(1),z.literal(2)]),
  pages:z.array(z.object({
    pageKey:key,title:label,
    questions:z.array(formQuestionSchema).max(80),
  }).strict()).max(40),
}).strict()
export type FormDraft=z.infer<typeof formDraftSchema>
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
export const sjtDraftV1Schema=z.object({
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
/** V1 remains a named historical contract; new work uses AnySjtDraft. */
export type SjtDraft=z.infer<typeof sjtDraftV1Schema>
export const SURVEY_SJT_V2_LIMITS={scenes:20,questionsPerScene:10,questions:100,metrics:20,
  singleOptions:12,multipleOptions:6,derivedChoices:24,scoredCells:16000} as const
export const sjtQuestionV2Schema=z.object({
  questionKey:key,prompt:note,responseType:z.enum(['SINGLE','MULTIPLE']),
  required:z.boolean(),allowRefusal:z.boolean(),
  aggregationPolicy:z.enum(['SUM','MEAN']).optional(),
  minSelections:z.number().int().min(1).max(6).optional(),
  maxSelections:z.number().int().min(1).max(6).optional(),
  exclusiveOptionKeys:z.array(key).max(12).optional(),
  options:z.array(z.object({
    optionKey:key,label,
    contributions:z.record(key,z.number().finite().min(-100000).max(100000)),
    nonanswerReason:z.enum(['DECLINED','UNABLE_TO_JUDGE']).optional(),
  }).strict()).max(SURVEY_SJT_V2_LIMITS.singleOptions),
}).strict()
export const sjtDraftV2Schema=z.object({
  schemaVersion:z.literal(2),
  respondentType:z.enum(['participant_self_report','student_self_report','teacher_self_report']),
  title:label,author:label,sourceNote:label,
  licenseStatus:z.enum(['self_authored','authorized','unknown']),
  redistribution:z.enum(['allowed','restricted','unknown']),orderPolicy:z.literal('FIXED'),
  metrics:z.array(z.object({metricKey:key,label,direction:z.literal('descriptive')}).strict())
    .max(SURVEY_SJT_V2_LIMITS.metrics),
  scoring:z.object({modelKey:z.enum(['AUTHOR_KEY_SUM','EXPERT_KEY']),
    modelVersion:z.literal('1'),sourceNote:note}).strict(),
  scenes:z.array(z.object({sceneKey:key,title:label,stimulus:note,image:surveyImageSchema.optional(),
    questions:z.array(sjtQuestionV2Schema).max(SURVEY_SJT_V2_LIMITS.questionsPerScene),
  }).strict()).max(SURVEY_SJT_V2_LIMITS.scenes),
}).strict()
export type SjtDraftV2=z.infer<typeof sjtDraftV2Schema>
export type SjtQuestionV2=z.infer<typeof sjtQuestionV2Schema>
export const sjtDraftSchema=z.discriminatedUnion('schemaVersion',[sjtDraftV1Schema,sjtDraftV2Schema])
export type AnySjtDraft=SjtDraft|SjtDraftV2
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
    // A legacy immutable publication may predate this authoring budget.
    // Runtime still checks its actual submitted key count independently.
    if(!allowLegacyFrozenConditionOperators&&formAnswerFieldCount(d)>SURVEY_FORM_MAX_ANSWER_FIELDS)
      err(issues,'pages',`问卷最多允许 ${SURVEY_FORM_MAX_ANSWER_FIELDS} 个作答字段；矩阵每行占一个字段。请删减矩阵行后再保存或发布`)
    if(!allowLegacyFrozenConditionOperators&&formWorstCaseAnswerBytes(d)>480000)
      err(issues,'pages','问卷答案的理论最大体积超过 480 KB 提交预算；请减少文本字数或矩阵选项数量')
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
        if(d.schemaVersion===1&&formQuestionRegistry[q.type].version>1)
          err(issues,path+'.type','专业题型必须先升级到 Form V2，旧版 V1 不得改变答案语义')
        if(d.schemaVersion===1&&(q.minSelections!==undefined||q.maxSelections!==undefined||
          q.textValidation!==undefined||q.otherOptionKey!==undefined||
          q.otherMaxLength!==undefined||q.exclusiveOptionKeys!==undefined))
          err(issues,path+'.schemaVersion','新的选项与文本校验规则只允许在 Form V2 中配置')
        unique(q.options.map(o=>o.optionKey),path+'.options',issues)
        unique(q.rows.map(o=>o.rowKey),path+'.rows',issues)
        if(q.otherOptionKey!==undefined){
          if(d.schemaVersion!==2||!['SINGLE','MULTIPLE'].includes(q.type))
            err(issues,path+'.otherOptionKey','其他文本只允许 Form V2 的单选或多选题')
          if(!q.options.some(o=>o.optionKey===q.otherOptionKey))
            err(issues,path+'.otherOptionKey','其他填写选项必须对应已有选项编码')
        }else if(q.otherMaxLength!==undefined)
          err(issues,path+'.otherMaxLength','请先设置其他填写选项')
        if(q.exclusiveOptionKeys!==undefined){
          if(d.schemaVersion!==2||q.type!=='MULTIPLE')
            err(issues,path+'.exclusiveOptionKeys','互斥选项只允许 Form V2 多选题')
          unique(q.exclusiveOptionKeys,path+'.exclusiveOptionKeys',issues)
          for(const exclusive of q.exclusiveOptionKeys)
            if(!q.options.some(o=>o.optionKey===exclusive))
              err(issues,path+'.exclusiveOptionKeys','互斥选项编码不存在于本题')
          if(q.exclusiveOptionKeys.length>0&&(q.minSelections??1)>1)
            err(issues,path+'.minSelections','存在互斥选项时最少选择不能大于 1')
        }
        if(['SINGLE','MULTIPLE','LIKERT','MATRIX','RANK_ORDER','CONSTANT_SUM','MATRIX_MULTIPLE'].includes(q.type)){
          if(forPreview&&q.options.length<2)err(issues,path+'.options','选择题至少需要两项有效选项')
          if(forPreview)q.options.forEach((o,oi)=>requireText(o.label,path+`.options.${oi}`,issues))
        }else if(q.options.length)err(issues,path+'.options','非选项题不应附带选项')
        if(q.type==='MATRIX'||q.type==='MATRIX_MULTIPLE'){
          if(forPreview&&!q.rows.length)err(issues,path+'.rows','矩阵题至少需要一行')
          if(forPreview)q.rows.forEach((o,oi)=>requireText(o.label,path+`.rows.${oi}`,issues))
        }else if(q.rows.length)err(issues,path+'.rows','只有矩阵题包含行编码')
        if(q.type==='CONSTANT_SUM'&&q.total===undefined)
          err(issues,path+'.total','恒定总和题必须设定目标总值（允许 0）')
        if(q.type==='CONSTANT_SUM'&&q.integerOnly&&q.total!==undefined&&
          !Number.isSafeInteger(q.total))
          err(issues,path+'.total','整数恒定总和题必须使用安全整数目标总值')
        if(q.type!=='CONSTANT_SUM'&&q.total!==undefined)
          err(issues,path+'.total','只有恒定总和题可以设定目标总值')
        if(q.type==='TIME'&&!q.timeZone)
          err(issues,path+'.timeZone','时间题必须声明时区')
        if(q.type!=='TIME'&&q.timeZone!==undefined)
          err(issues,path+'.timeZone','时区仅适用于时间题')
        if(!['MULTIPLE','MATRIX_MULTIPLE'].includes(q.type)&&
          (q.minSelections!==undefined||q.maxSelections!==undefined))
          err(issues,path+'.minSelections','选择数量限制仅适用于多选题')
        if(['MULTIPLE','MATRIX_MULTIPLE'].includes(q.type)&&(
          (q.minSelections!==undefined&&q.maxSelections!==undefined&&q.minSelections>q.maxSelections)||
          (q.maxSelections!==undefined&&q.maxSelections>q.options.length)||
          (q.minSelections!==undefined&&q.minSelections>q.options.length)))
          err(issues,path+'.maxSelections','选择数量必须落在有效选项数量内')
        if(!['SHORT_TEXT','LONG_TEXT'].includes(q.type)&&q.textValidation!==undefined)
          err(issues,path+'.textValidation','文本格式限制仅适用于文本题')
        if(q.type==='SLIDER'&&(q.min===undefined||q.max===undefined))
          err(issues,path,'滑块题必须声明上下界')
        if(q.min!==undefined&&q.max!==undefined&&q.min>q.max)
          err(issues,path,'最小数值不能大于最大数值')
        if(!['NUMBER','SLIDER','CONSTANT_SUM'].includes(q.type)&&(
          q.min!==undefined||q.max!==undefined||q.integerOnly!==undefined||
          q.step!==undefined||q.precision!==undefined))
          err(issues,path,'数值约束仅可用于数值题、滑块或恒定总和题')
        if(q.type==='CONSTANT_SUM'&&(q.min!==undefined||q.max!==undefined||q.step!==undefined||q.precision!==undefined))
          err(issues,path,'恒定总和题只允许整数约束和指定总和')
        if(['NUMBER','SLIDER','CONSTANT_SUM'].includes(q.type)){
          if(q.integerOnly&&q.precision!==undefined&&q.precision!==0)
            err(issues,path+'.precision','整数题精度必须为 0')
          if(q.integerOnly&&q.step!==undefined&&!Number.isSafeInteger(q.step))
            err(issues,path+'.step','整数题步长必须是正整数')
          if(q.integerOnly&&[q.min,q.max].some(v=>v!==undefined&&!Number.isSafeInteger(v)))
            err(issues,path,'整数题的上下界必须为安全整数')
        }
        if(q.displayIf){
          const previous=previously.get(q.displayIf.itemKey)
          if(!previous||!['SINGLE','MULTIPLE','LIKERT'].includes(previous.type))
            err(issues,path+'.displayIf','条件只能引用此前的单选、多选或 Likert 题目')
          else {
            if(!previous.options.some(o=>o.optionKey===q.displayIf!.optionKey))
              err(issues,path+'.displayIf.optionKey','引用的选项已不存在')
            if(!allowLegacyFrozenConditionOperators&&(previous.type==='MULTIPLE'
              ?q.displayIf.operator!=='INCLUDES'
              :q.displayIf.operator!=='EQUALS'))
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
