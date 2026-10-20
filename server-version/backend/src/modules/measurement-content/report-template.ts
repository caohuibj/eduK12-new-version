import { z } from 'zod'

const prose=z.string().trim().min(1).max(20000)
const key=z.string().trim().min(1).max(240)
/** Declarative display only: metric values and band membership are resolved from
 * frozen facts/reference results by the installed generator, never expressions.
 * Strict nodes prevent nested numeric rules or scripts from becoming a second
 * scoring/reference authority. Text is rendered as text, not executable HTML.
 */
export const reportBlockSchema=z.discriminatedUnion('type',[
  z.object({type:z.literal('TEXT'),text:prose}).strict(),
  z.object({type:z.literal('METRIC'),metricKey:key,label:prose.optional(),display:z.enum(['RAW','REFERENCE_RESULT'])}).strict(),
  z.object({type:z.literal('REFERENCE_BAND'),metricKey:key,bandKey:key,text:prose,guidance:z.array(prose).max(30).default([])}).strict(),
  z.object({type:z.literal('ASSET'),assetId:key,alt:prose}).strict(),
  z.object({type:z.literal('CHART'),metricKeys:z.array(key).min(1).max(100),style:z.enum(['BAR','TABLE']),caption:prose.optional()}).strict(),
])
export const reportTemplateSchema=z.object({
  title:prose.optional(),
  blocks:z.array(reportBlockSchema).max(500).default([]),
  limitations:z.array(prose).max(100).default([]),
  disclaimer:prose.optional(),
}).strict().refine(t=>Boolean(t.title)||t.blocks.length>0,'Report requires display content')
export type ReportTemplate=z.infer<typeof reportTemplateSchema>

export function validateReportTemplateBindings(template:ReportTemplate,metricKeys:readonly string[],assetIds:readonly string[]):void{
  const metrics=new Set(metricKeys),assets=new Set(assetIds)
  for(const block of template.blocks){
    const keys=block.type==='METRIC'||block.type==='REFERENCE_BAND'?[block.metricKey]:block.type==='CHART'?block.metricKeys:[]
    if(keys.some(key=>!metrics.has(key)))throw new Error('REPORT_TEMPLATE_METRIC_UNKNOWN')
    if(block.type==='ASSET'&&!assets.has(block.assetId))throw new Error('REPORT_TEMPLATE_ASSET_UNKNOWN')
  }
}
