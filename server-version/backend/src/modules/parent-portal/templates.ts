import { reviewedParentTemplates } from './reviewed-templates'
import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import { fail,parentProjectionSchema,parentToolRefSchema,type ParentProjection } from './contracts'
import type { ReportingArtifactRecord } from '../reporting/types'
export type ParentToolRef=NonNullable<ParentProjection['toolRef']>
export interface ParentTemplate {
 key:string; version:string; status:'PUBLISHED'; title:string; mode:'COMPLETION_ONLY'|'EDUCATIONAL_SUMMARY';
 toolRef?:ParentToolRef;
 metrics:Array<{metricId:string;sourceMetricKey:string;label:string;aggregation?:'MEAN'|'MEDIAN'|'SD_POPULATION'|'SD_SAMPLE';longitudinal?:boolean}>;
 disclaimer:string;
}
const completion:ParentTemplate={key:'parent-report-availability',version:'1.0.0',status:'PUBLISHED',title:'测评报告已生成',mode:'COMPLETION_ONLY',metrics:[],disclaimer:''}
export function createParentTemplateRegistry(templates:ParentTemplate[]=[completion]){
 const entries=new Map<string,ParentTemplate>()
 const templateSchema=z.object({key:z.string().min(1).max(128),version:z.string().min(1).max(128),status:z.literal('PUBLISHED'),title:z.string().min(1).max(200),mode:z.enum(['COMPLETION_ONLY','EDUCATIONAL_SUMMARY']),toolRef:parentToolRefSchema.optional(),metrics:z.array(z.object({metricId:z.string().min(1).max(128),sourceMetricKey:z.string().min(1).max(128),label:z.string().min(1).max(200),aggregation:z.enum(['MEAN','MEDIAN','SD_POPULATION','SD_SAMPLE']).optional(),longitudinal:z.boolean().optional()}).strict()).max(10),disclaimer:z.string().max(10000)}).strict()
 for(const input of templates){
  const parsed=templateSchema.safeParse(input)
  const template=parsed.success?parsed.data:fail('PARENT_TEMPLATE_INVALID',409)
  if(entries.has(template.key+':'+template.version)||
    (template.mode==='COMPLETION_ONLY'&&(template.metrics.length||template.disclaimer))||
    (template.mode==='EDUCATIONAL_SUMMARY'&&(!template.toolRef||!template.metrics.length||!template.disclaimer))||
    new Set(template.metrics.map(m=>m.metricId)).size!==template.metrics.length)fail('PARENT_TEMPLATE_INVALID',409)
  entries.set(template.key+':'+template.version,structuredClone(template))
 }
 return {list(ref:ParentToolRef){return [...entries.values()].filter(t=>!t.toolRef||canonicalHash(t.toolRef)===canonicalHash(ref)).map(t=>({key:t.key,version:t.version,title:t.title,mode:t.mode}))},resolve(key:string,version:string,toolRef:ParentToolRef){const original=entries.get(key+':'+version)??fail('PARENT_TEMPLATE_NOT_PUBLISHED');if(original.toolRef&&canonicalHash(original.toolRef)!==canonicalHash(toolRef))fail('PARENT_TEMPLATE_TOOL_MISMATCH');return {...structuredClone(original),toolRef}}}
}
// Completion is a reviewed generic PARENT availability template, bound to the exact tool at production.
// Educational content is registered per tool only through a separate reviewed content change.
export const parentTemplateRegistry=createParentTemplateRegistry([completion,...reviewedParentTemplates])
export function buildParentProjection(record:ReportingArtifactRecord,subjectUserId:string,template:ParentTemplate):ParentProjection{
 const policy={key:template.key,version:template.version,audience:'PARENT' as const,mode:template.mode,rawAnswers:false as const,itemLevel:false as const,researchExport:false as const}
 const blocks:Array<{title:string;text:string}>=[],disclosedMetricKeys:string[]=[],disclosedLongitudinalMetricKeys:string[]=[]
 if(template.mode==='EDUCATIONAL_SUMMARY'){
  if(record.analysisKind==='PROTECTED_FEEDBACK'){
   if(!record.artifactPayload.fixedPopulationDisclosure?.complete)fail('PARENT_PRIVACY_PROOF_UNAVAILABLE')
   const projection=record.artifactPayload.projection
   for(const m of template.metrics){const value=projection.state==='present'&&projection.metrics?.[m.metricId];const number=value&&value.state==='present'&&m.aggregation?value.aggregations?.[{MEAN:'mean',MEDIAN:'median',SD_POPULATION:'sdPopulation',SD_SAMPLE:'sdSample'}[m.aggregation]]:undefined
    if(typeof number!=='number'||!Number.isFinite(number))continue
    blocks.push({title:m.label,text:String(number)});disclosedMetricKeys.push(m.sourceMetricKey)
   }
  }else if(record.analysisKind==='INDIVIDUAL_LONGITUDINAL'){
   const projection=record.artifactPayload.projection,ordinals=new Map(projection.waves.map(w=>[w.waveId,w.ordinal]))
   for(const m of template.metrics){if(!m.longitudinal)fail('PARENT_LONGITUDINAL_TEMPLATE_REQUIRED');const lines:string[]=[]
    for(const wave of projection.waves){const point=wave.metrics[m.metricId];lines.push('第 '+wave.ordinal+' 次：'+(point?.state==='present'&&Number.isFinite(point.value)?String(point.value):'未提供可披露值'))}
    for(const comparison of projection.comparisons){const point=comparison.metrics[m.metricId];if(point?.comparability.allowedOperations.includes('NUMERIC_DELTA')&&typeof point.delta==='number'&&Number.isFinite(point.delta))lines.push('第 '+ordinals.get(comparison.fromWaveId)+' 次至第 '+ordinals.get(comparison.toWaveId)+' 次：服务器提供的变化值 '+String(point.delta))}
    blocks.push({title:m.label,text:lines.join('\n')});disclosedMetricKeys.push(m.sourceMetricKey);disclosedLongitudinalMetricKeys.push(m.sourceMetricKey)
   }
  }else fail('PARENT_SOURCE_UNSUPPORTED')
  blocks.push({title:'说明',text:template.disclaimer})
 }
 return parentProjectionSchema.parse({schemaVersion:1,audience:'PARENT',artifactId:record.id,subjectUserId,title:template.title,publicationStatus:'PUBLISHED',policy,policyHash:canonicalHash(policy),toolRef:template.toolRef,disclosedMetricKeys:[...new Set(disclosedMetricKeys)],disclosedLongitudinalMetricKeys:[...new Set(disclosedLongitudinalMetricKeys)],summary:'',blocks})
}
