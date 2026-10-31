import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {privateToolFail} from './private-tool.contracts'

// Publisher input only. This is neither a source entitlement nor the shared
// EDUCATION_SELF_GROUP_V2 identity; the real publisher must supply the ceilings
// of each server-loaded, authorized exact source before freezing a V2 entry.
const metricKeys=z.array(z.string().trim().min(1).max(240)).max(100)
const audiences=z.object({PROFESSIONAL:metricKeys,TEACHER:metricKeys,ORGANIZATION:metricKeys}).strict()
export const schoolPrivateGroupSelectionSchema=z.object({
 schemaVersion:z.literal(1),minimumRespondents:z.number().int().min(10),
 leaves:z.array(z.object({blockId:z.string().guid().optional(),versionId:z.string().guid(),
  contentHash:z.string().regex(/^[a-f0-9]{64}$/),audiences}).strict()).min(1).max(50),
}).strict().superRefine((selection,ctx)=>{
 const keys=selection.leaves.map(leaf=>leaf.blockId??'standalone')
 if(new Set(keys).size!==keys.length||selection.leaves.length>1&&keys.includes('standalone'))
  ctx.addIssue({code:'custom',path:['leaves'],message:'群体指标必须明确定位唯一工具块'})
 for(const [i,leaf] of selection.leaves.entries()){
  if(!Object.values(leaf.audiences).some(keys=>keys.length))
   ctx.addIssue({code:'custom',path:['leaves',i,'audiences'],message:'请选择至少一个明确获准的群体指标'})
  for(const [audience,keys] of Object.entries(leaf.audiences))if(new Set(keys).size!==keys.length)
   ctx.addIssue({code:'custom',path:['leaves',i,'audiences',audience],message:'群体指标不能重复'})
 }
})
export type SchoolPrivateGroupSelection=z.infer<typeof schoolPrivateGroupSelectionSchema>
export type SchoolPrivateGroupSourceCeiling={
 blockId?:string;versionId:string;contentHash:string;minimumRespondents:number
 // These come from an explicit author-owned new source grant or the shared
 // source-owned aggregate ceiling, never from own/longitudinal numeric keys.
 audiences:SchoolPrivateGroupSelection['leaves'][number]['audiences']
}
const fail=():never=>privateToolFail('SCHOOL_PRIVATE_GROUP_SELECTION_INVALID',409)

export function parseSchoolPrivateGroupSelection(raw:unknown,context:{
 entry:'SCHOOL'|'TEACHER';administration:{population:string;responseMode:string}
 sources:ReadonlyArray<SchoolPrivateGroupSourceCeiling>
}){
 const selected=schoolPrivateGroupSelectionSchema.parse(raw)
 if(context.administration.population!==(context.entry==='SCHOOL'?'STUDENT':'TEACHER')||context.administration.responseMode!=='SELF')fail()
 const sources=new Map<string,SchoolPrivateGroupSourceCeiling>()
 for(const source of context.sources){
  const key=source.blockId??'standalone'
  if(sources.has(key)||!Number.isInteger(source.minimumRespondents)||source.minimumRespondents<3)fail()
  sources.set(key,source)
 }
 for(const leaf of selected.leaves){
  const source=sources.get(leaf.blockId??'standalone')
  if(!source)return fail()
  if(source.versionId!==leaf.versionId||source.contentHash!==leaf.contentHash
   ||selected.minimumRespondents<source.minimumRespondents)fail()
  for(const audience of ['PROFESSIONAL','TEACHER','ORGANIZATION'] as const)
   if(leaf.audiences[audience].some(key=>!source.audiences[audience].includes(key)))fail()
 }
 // Stable source identity on semantically identical publisher choices. No
 // scores, observed times or wave/slot IDs are folded into measurement C.
 return {...selected,leaves:selected.leaves.map(leaf=>({...leaf,audiences:{
  PROFESSIONAL:[...leaf.audiences.PROFESSIONAL].sort(),TEACHER:[...leaf.audiences.TEACHER].sort(),
  ORGANIZATION:[...leaf.audiences.ORGANIZATION].sort(),
 }})).sort((a,b)=>(a.blockId??'').localeCompare(b.blockId??''))}
}
export const schoolPrivateGroupSelectionHash=(selection:SchoolPrivateGroupSelection)=>canonicalHash(selection)
