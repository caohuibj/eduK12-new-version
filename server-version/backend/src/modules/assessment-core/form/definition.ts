import {materialListSchema} from '../../assessment-media/material'
import { z } from 'zod'
import { canonicalHash } from '../../assessment-runtime/canonical'
import { assessmentKeySchema, assessmentImageSchema } from '../definition-primitives'

const key=assessmentKeySchema
const label=z.string().trim().max(2000)
const note=z.string().trim().max(16000)
const option=z.object({optionKey:key,label,score:z.number().finite().min(-10000).max(10000).optional()}).strict()
export type FormDefinitionIssue={path:string;message:string;severity:'error'|'warning'}
type Issue=FormDefinitionIssue
const condition = z.object({
  itemKey:key, operator:z.enum(['EQUALS','INCLUDES']), optionKey:key,
}).strict()
export const FORM_MAX_ANSWER_FIELDS=500
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
  image:assessmentImageSchema.optional(),
  materials:materialListSchema.optional(),
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
    pageKey:key,title:label,description:z.string().max(8000).optional(),
    questions:z.array(formQuestionSchema).max(80),
  }).strict()).max(40),
}).strict()
export type FormDraft=z.infer<typeof formDraftSchema>
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

/** Shared Form definition validation. Options are supplied by an entry adapter;
 * legacyFrozen preserves historical immutable publications, never new authoring.
 * The digest namespace remains {kind:'FORM',definition} for stored compatibility.
 */
export const validateFormDefinition=(input:unknown,options:{
  forPreview?:boolean;allowLegacyFrozenConditionOperators?:boolean;includeDigest?:boolean
}={}):{definition?:FormDraft;issues:FormDefinitionIssue[];digest?:string}=>{
  const {forPreview=false,allowLegacyFrozenConditionOperators=false,includeDigest=true}=options
  const parsed=formDraftSchema.safeParse(input)
  if(!parsed.success)return {issues:parsed.error.issues.map(x=>({
    path:x.path.join('.')||'definition',message:x.message,severity:'error' as const,
  }))}
  const definition=parsed.data
  const issues:Issue[]=[]
  const d=definition as FormDraft
  const items=d.pages.flatMap(p=>p.questions)
  if(items.length>300)err(issues,'pages','单份 Form 最多包含 300 道题目')
  // A legacy immutable publication may predate this authoring budget.
  // Runtime still checks its actual submitted key count independently.
  if(!allowLegacyFrozenConditionOperators&&formAnswerFieldCount(d)>FORM_MAX_ANSWER_FIELDS)
    err(issues,'pages',`问卷最多允许 ${FORM_MAX_ANSWER_FIELDS} 个作答字段；矩阵每行占一个字段。请删减矩阵行后再保存或发布`)
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
      if(forPreview&&q.materials?.some(item=>item.rightsStatus==='unknown'||!item.rightsNote.trim()))err(issues,path+'.materials','请确认素材使用依据并填写原创或授权说明')
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
  const canonical=JSON.parse(JSON.stringify({kind:'FORM',definition}))
  if(Buffer.byteLength(JSON.stringify(canonical),'utf8')>480000)
    err(issues,'definition','单份研究工具数据体积不能超过 480 KB')
  return includeDigest?{definition,issues,digest:canonicalHash(canonical)}:{definition,issues}
}
