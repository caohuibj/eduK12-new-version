import { z } from 'zod'
import { canonicalHash } from '../../assessment-runtime/canonical'
import { sjtDraftV2Schema, SjtDraftError, type SjtDraftV2 } from '../../assessment-core/sjt/definition'
import { compileSjtV2 } from '../../assessment-core/sjt/compiler'
import { validateSjtV2 } from '../../assessment-core/sjt/validation'
import { expandedSjtOptions } from '../../assessment-core/sjt/selection'
import { sjtQuestionEntries } from '../../assessment-core/sjt/structure'
import { normalizeSjtAnswers, scoreSjtAnswers, SjtAnswerError } from '../../assessment-core/sjt/runtime'
import type { SituationRuntimeDefinition } from '../situation-runtime-definition'
import type { SituationPackage } from '../situation-package'
import type { SituationalResponse } from '../situation-scoring'
import { SjtTemplateError, type SjtAuthorIssue } from './template'

export const SJT_ONLINE_COMPILER_VERSION = 'sjt-online-fixed-v1' as const
export const SJT_ONLINE_IMAGE_COMPILER_VERSION = 'sjt-online-static-image-v1' as const
export const SJT_ONLINE_RESPONSE_PROTOCOL = 'sjt-online-response-v1' as const
const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const sjtOnlineMetadataSchema = z.object({
  responseProtocol: z.literal(SJT_ONLINE_RESPONSE_PROTOCOL),
  compilerVersion: z.enum([SJT_ONLINE_COMPILER_VERSION, SJT_ONLINE_IMAGE_COMPILER_VERSION]),
  definitionHash: hash, displayHash: hash, display: sjtDraftV2Schema,
}).strict()
export type SjtOnlineMetadata = z.infer<typeof sjtOnlineMetadataSchema>
export const sjtOnlineResponseSchema = z.object({
  sceneKey: z.string().min(1).max(160), channelKey: z.string().min(1).max(80),
  status: z.enum(['ANSWERED', 'REFUSED', 'BLANK']),
  responseValue: z.union([z.string().max(80), z.array(z.string().max(80)).max(6)]).optional(),
  responseTimeMs: z.number().int().nonnegative().optional(),
  answeredAt: z.string().min(1).optional(),
  responseRevision: z.number().int().positive().max(4096).optional(),
  historyIdentity: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  stageConfirmed: z.boolean().optional(),
}).strict().superRefine((value,ctx)=>{
  if((value.status==='ANSWERED')!==(value.responseValue!==undefined))ctx.addIssue({
    code:z.ZodIssueCode.custom,path:['responseValue'],message:'只有 ANSWERED 必须提供真实答案；BLANK/REFUSED 不得夹带答案',
  })
})
export type SjtOnlineResponse = z.infer<typeof sjtOnlineResponseSchema>
export const sjtOnlineDocumentSchema = z.object({
  templateVersion: z.literal('sjt-online-v1'),
  instrumentKey: z.string().max(80).regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  instrumentVersion: z.string().max(40).regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/),
  title: z.string().trim().min(1).max(200),
  display: sjtDraftV2Schema,
  goldenCases: z.array(z.object({
    name: z.string().trim().min(1).max(200),
    responses: z.array(sjtOnlineResponseSchema).max(100),
    expected: z.record(z.string(), z.number().finite().nullable()),
  }).strict()).max(512),
}).strict()
export type SjtOnlineDocument = z.infer<typeof sjtOnlineDocumentSchema>
function fail(path:string,message:string,code='FIELD'):never {
  throw new SjtTemplateError([{path,message,code}])
}
function parse<T extends z.ZodTypeAny>(schema:T,input:unknown):z.output<T> {
  const result=schema.safeParse(input)
  if(!result.success)throw new SjtTemplateError(result.error.issues.map(i=>({
    path:i.path.join('.'),message:i.message,code:'FIELD',
  })))
  return result.data
}
function validateDisplay(display:SjtDraftV2) {
  const issues:SjtAuthorIssue[]=validateSjtV2(display,true).filter(i=>i.severity==='error'&&!['licenseStatus','redistribution'].includes(i.path))
    .map(i=>({path:'display.'+i.path,message:i.message,code:'FIELD'}))
  if(display.respondentType==='participant_self_report')issues.push({path:'display.respondentType',message:'正式情境工具只支持教师或学生自评',code:'FIELD'})
  if(issues.length)throw new SjtTemplateError(issues)
}
// Text-only documents keep their exact C12 identity and response protocol.
// Images explicitly opt into a new compiler identity without touching scoring.
function onlineCompilerVersion(display:SjtDraftV2) {
  return display.scenes.some(scene=>scene.image)
    ? SJT_ONLINE_IMAGE_COMPILER_VERSION : SJT_ONLINE_COMPILER_VERSION
}
function compileDisplay(display:SjtDraftV2,instrumentKey='online-validation',instrumentVersion='0.1.0') {
  validateDisplay(display)
  try { return compileSjtV2(instrumentKey,display,{
    compilerVersion:onlineCompilerVersion(display),physicalPrefix:'sjt_q_',
    scoringPrefix:'sjt-online-v1-',reportVersion:'sjt-online-descriptive-v1',
    metricChannelKey:'sjt_response',packageKey:instrumentKey,instrumentVersion,
  }) } catch(error) {
    if(error instanceof SjtDraftError)throw new SjtTemplateError(error.issues.map(i=>({path:i.path,message:i.message,code:'RUNTIME'})))
    throw error
  }
}
/** Recompilation binds the protected display and its contribution matrix to the frozen scorer. */
export function validateSjtOnlineMetadata(input:unknown,definition:SituationRuntimeDefinition):SjtOnlineMetadata {
  if(definition.schemaVersion!==2)fail('online','在线题面要求 V2 固定顺序定义','INTEGRITY')
  const metadata=parse(sjtOnlineMetadataSchema,input)
  if(canonicalHash(metadata.display)!==metadata.displayHash)fail('online.displayHash','在线题面摘要不匹配','INTEGRITY')
  const compiled=compileDisplay(metadata.display)
  if(metadata.compilerVersion!==onlineCompilerVersion(metadata.display))
    fail('online.compilerVersion','图片题面编译身份不匹配','INTEGRITY')
  if(metadata.definitionHash!==canonicalHash(definition)||compiled.definitionHash!==metadata.definitionHash)
    fail('online.definitionHash','在线题面与冻结计分定义不一致','INTEGRITY')
  return metadata
}
/** Participant projection must never disclose contribution weights or expert keys. */
export function publicSjtOnlineMetadata(metadata:SjtOnlineMetadata) {
  const d=metadata.display
  return {responseProtocol:metadata.responseProtocol,compilerVersion:metadata.compilerVersion,
    definitionHash:metadata.definitionHash,displayHash:metadata.displayHash,
    display:{schemaVersion:d.schemaVersion,title:d.title,respondentType:d.respondentType,orderPolicy:d.orderPolicy,
      scenes:d.scenes.map(s=>({sceneKey:s.sceneKey,title:s.title,stimulus:s.stimulus,
        ...(s.image?{image:{asset:{assetId:s.image.asset.assetId,contentHash:s.image.asset.contentHash,mimeType:s.image.asset.mimeType},
          altText:s.image.altText,...(s.image.caption!==undefined?{caption:s.image.caption}:{})}}:{}),
        questions:s.questions.map(q=>({questionKey:q.questionKey,prompt:q.prompt,responseType:q.responseType,
          required:q.required,allowRefusal:q.allowRefusal,
          ...(q.minSelections!==undefined?{minSelections:q.minSelections}:{}),
          ...(q.maxSelections!==undefined?{maxSelections:q.maxSelections}:{}),
          ...(q.exclusiveOptionKeys?{exclusiveOptionKeys:q.exclusiveOptionKeys}:{}),
          options:q.options.map(o=>({optionKey:o.optionKey,label:o.label,
            ...(o.nonanswerReason?{nonanswerReason:o.nonanswerReason}:{})})),
        })),
      })),
    },
  }
}
/** Validate display semantics first. Only substantive responses enter the shared scorer. */
export function normalizeSjtOnlineResponses(display:SjtDraftV2,definition:SituationRuntimeDefinition,input:unknown) {
  if(definition.schemaVersion!==2)fail('responses','在线响应要求 V2 定义','RESPONSE')
  const raw=parse(z.array(sjtOnlineResponseSchema).max(100),input)
  const entries=sjtQuestionEntries(display)
  const byQuestion=new Map(entries.map(e=>[e.question.questionKey,e]))
  const incoming=new Map<string,SjtOnlineResponse>()
  const answers:Record<string,unknown>=Object.create(null)
  for(const r of raw){
    if(!byQuestion.has(r.channelKey)||r.sceneKey!=='sjt_q_'+r.channelKey)
      fail('responses','响应引用未知情境或问题','RESPONSE')
    if(incoming.has(r.channelKey))fail('responses','问题响应重复','RESPONSE')
    incoming.set(r.channelKey,r)
    if(r.status==='ANSWERED'){
      if(r.responseValue===undefined)fail('responses','已回答状态必须提供真实选项','RESPONSE')
      // Empty selection is a BLANK, never an ANSWERED disguise.
      if(Array.isArray(r.responseValue)&&!r.responseValue.length)fail('responses','空选择必须明确为 BLANK','RESPONSE')
      answers[r.channelKey]=r.responseValue
    }else{
      if(r.responseValue!==undefined)fail('responses','拒答或空白状态不得夹带答案','RESPONSE')
      answers[r.channelKey]=r.status==='REFUSED'?{_surveyRefusal:true}:null
    }
  }
  let normalized:ReturnType<typeof normalizeSjtAnswers>
  try{normalized=normalizeSjtAnswers(display,definition,answers)}catch(error){
    if(error instanceof SjtAnswerError)fail(error.path,error.message,'RESPONSE')
    throw error
  }
  const rawResponses=raw
  const responses:SituationalResponse[]=normalized.responses.map(r=>({...r,...timing(incoming.get(r.channelKey))}))
  return {...normalized,responses,scorerResponses:responses,rawResponses}
}
function timing(r:SjtOnlineResponse|undefined) {
  if(!r)return {}
  return {
    ...(r.responseTimeMs!==undefined?{responseTimeMs:r.responseTimeMs}:{}),
    ...(r.answeredAt!==undefined?{answeredAt:r.answeredAt}:{}),
    ...(r.responseRevision!==undefined?{responseRevision:r.responseRevision}:{}),
    ...(r.historyIdentity!==undefined?{historyIdentity:r.historyIdentity}:{}),
    ...(r.stageConfirmed!==undefined?{stageConfirmed:r.stageConfirmed}:{}),
  }
}
export function compileSjtOnlineDocument(input:unknown) {
  const template=parse(sjtOnlineDocumentSchema,input)
  if(template.title!==template.display.title)fail('title','标题须与在线题面标题一致')
  const compiled=compileDisplay(template.display,template.instrumentKey,template.instrumentVersion)
  const names=new Set<string>()
  const goldenCases:SituationPackage['goldenCases']=template.goldenCases.map((c,index)=>{
    if(names.has(c.name))fail(`goldenCases.${index}.name`,'验收样例名称重复')
    names.add(c.name)
    const normalized=normalizeSjtOnlineResponses(template.display,compiled.package.definition,c.responses)
    const output=scoreSjtAnswers(template.display,compiled.package.definition,normalized.responses)
    const keys=template.display.metrics.map(m=>m.metricKey)
    if(JSON.stringify(Object.keys(c.expected).sort())!==JSON.stringify([...keys].sort()))
      fail(`goldenCases.${index}.expected`,'必须人工填写全部指标的独立期望值，包括 null','GOLDEN')
    for(const metric of output.metrics)
      if(c.expected[metric.key]!==metric.value)
        fail(`goldenCases.${index}.expected.${metric.key}`,'独立期望值与冻结评分结果不一致','GOLDEN')
    return {name:c.name,responses:normalized.responses,expected:{
      quality:keys.some((key,i)=>i===0&&c.expected[key]===null)?'invalid' as const:'interpretable' as const,
      metricKeys:keys,metrics:c.expected,
    }}
  })
  const online:SjtOnlineMetadata={responseProtocol:SJT_ONLINE_RESPONSE_PROTOCOL,
    compilerVersion:onlineCompilerVersion(template.display),definitionHash:compiled.definitionHash,
    displayHash:canonicalHash(template.display),display:template.display}
  const pkg={...compiled.package,goldenCases,online}
  return {template,package:pkg,definitionHash:compiled.definitionHash,
    contentDigest:canonicalHash({compilerVersion:onlineCompilerVersion(template.display),template,package:pkg})}
}
/** Authors must supply every expected value themselves; this function never manufactures fixtures. */
export function assertSjtOnlineReleaseReady(compiled:ReturnType<typeof compileSjtOnlineDocument>):void {
  // Revalidate the source, including any mutated/tampered expected values.
  const checked=compileSjtOnlineDocument(compiled.template)
  if(checked.contentDigest!==compiled.contentDigest||canonicalHash(checked.package)!==canonicalHash(compiled.package))
    fail('contentDigest','在线编制快照已变化','INTEGRITY')
  const covered=new Set<string>()
  for(const c of checked.template.goldenCases){
    const n=normalizeSjtOnlineResponses(checked.template.display,checked.package.definition,c.responses)
    // Every question has an explicit contribution for every metric. Only a
    // fully answered case with independently supplied numeric expectations can
    // prove a substantive choice: partial/null cases cannot validate SUM/MEAN.
    const completeNumeric=n.questionResults.every(r=>r.status==='ANSWERED'&&r.scorerOptionKey!==null)
      &&checked.template.display.metrics.every(m=>typeof c.expected[m.metricKey]==='number'&&Number.isFinite(c.expected[m.metricKey]))
    for(const r of n.questionResults){
      if(r.scorerOptionKey===null)covered.add(`${r.questionKey}:${r.status}`)
      else if(completeNumeric)covered.add(`${r.questionKey}:${r.scorerOptionKey}`)
      if(r.response&&typeof r.response==='object'&&!Array.isArray(r.response))
        covered.add(`${r.questionKey}:EXPLICIT_REFUSED`)
      if(r.scorerOptionKey===null&&(typeof r.response==='string'||Array.isArray(r.response)))
        covered.add(`${r.questionKey}:nonanswer:${typeof r.response==='string'?r.response:r.response[0]}`)
    }
  }
  const issues:SjtAuthorIssue[]=[]
  for(const {question:q} of sjtQuestionEntries(checked.template.display)){
    const needed=expandedSjtOptions(q).filter(o=>!o.nonanswerReason).map(o=>o.optionKey)
    if(!q.required)needed.push('SHOWN_MISSING')
    if(q.allowRefusal)needed.push('EXPLICIT_REFUSED')
    needed.push(...q.options.filter(o=>o.nonanswerReason).map(o=>'nonanswer:'+o.optionKey))
    for(const value of needed)if(!covered.has(`${q.questionKey}:${value}`))issues.push({
      path:'goldenCases',code:'COVERAGE',message:`独立验收样例未覆盖 ${q.questionKey}/${value}`,
    })
  }
  if(issues.length)throw new SjtTemplateError(issues)
}
