import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'
import { referenceSetHash } from '../assessment-runtime/reference-binding'
import { resolveAssessmentReference, type AssessmentReferenceSetDefinition, type ResolvedScaleReference } from './reference'
export type ReferenceResolutionMode = 'ORIGINAL' | 'TIME_MATCHED' | 'LATER_REFERENCE'
export interface ScaleReferenceIdentityV1 {
 instrumentKey:string; instrumentVersion:string; scoringVersion:string; measurementHash:string
 subjectKey:string; locale:string; schoolStage:'junior_secondary'|'upper_secondary'; scoreKey:string
 direction:string; range:{min:number;max:number}; reportVersion:string
 originalReferenceVersion:string; originalReferenceHash:string
}
export interface LongitudinalReferencePoint { resultVersion:string; at:string; value:number|null; identity:ScaleReferenceIdentityV1 }
export interface LongitudinalReferenceSnapshotV1 {
 schemaVersion:1; resolutionMode:ReferenceResolutionMode; selectedReferenceVersions:string[]; sourceResultVersions:string[]
 generatedAt:string; compatibilityDecision:string; explicitLatest:boolean
 points:Array<{resultVersion:string;rawValue:number|null;reference:ResolvedScaleReference|null}>
 snapshotHash:string
}
const entryFor=(set:AssessmentReferenceSetDefinition,id:ScaleReferenceIdentityV1)=>set.instrumentType==='scale' && set.instrumentKey===id.instrumentKey ? set.entries.find(e=>e.scoreKey===id.scoreKey && e.instrumentVersion===id.instrumentVersion && e.scoringVersion===id.scoringVersion && e.governance?.subjectKey===id.subjectKey && e.governance.locale===id.locale && (e.governance.schoolStage===id.schoolStage || e.governance.crossStageReReferenceAllowed) && e.governance.scoreRange.min===id.range.min && e.governance.scoreRange.max===id.range.max) : undefined
const compatible=(a:ScaleReferenceIdentityV1,b:ScaleReferenceIdentityV1)=>a.instrumentKey===b.instrumentKey && a.instrumentVersion===b.instrumentVersion && a.scoringVersion===b.scoringVersion && a.measurementHash===b.measurementHash && a.subjectKey===b.subjectKey && a.locale===b.locale && a.scoreKey===b.scoreKey && a.direction===b.direction && a.range.min===b.range.min && a.range.max===b.range.max
export function buildLongitudinalReferenceSnapshot(input:{points:LongitudinalReferencePoint[];references:AssessmentReferenceSetDefinition[];mode?:ReferenceResolutionMode;explicitLatest?:boolean;generatedAt:string}):LongitudinalReferenceSnapshotV1 {
 if(input.points.length<2 || input.points.some(p=>!Number.isFinite(Date.parse(p.at))) || new Set(input.points.map(p=>p.resultVersion)).size!==input.points.length || !Number.isFinite(Date.parse(input.generatedAt))) throw new Error('LONGITUDINAL_SOURCE_INVALID')
 const points=[...input.points].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)),mode=input.mode??'LATER_REFERENCE'
 if(!['ORIGINAL','TIME_MATCHED','LATER_REFERENCE'].includes(mode)) throw new Error('LONGITUDINAL_MODE_INVALID')
 const original=(p:LongitudinalReferencePoint)=>{
  const r=input.references.find(r=>r.instrumentKey===p.identity.instrumentKey && r.referenceVersion===p.identity.originalReferenceVersion)
  if(!r || r.status==='DRAFT' || referenceSetHash(r)!==p.identity.originalReferenceHash) throw new Error('LONGITUDINAL_FROZEN_REFERENCE_INVALID')
  return r
 }
 points.forEach(original)
 const candidates=input.explicitLatest ? input.references.filter(r=>r.status==='ACTIVE' && Date.parse(r.entries[0]?.governance?.effectiveFrom??'')<=Date.parse(input.generatedAt)).sort((a,b)=>Date.parse(b.entries[0]?.governance?.effectiveFrom??'')-Date.parse(a.entries[0]?.governance?.effectiveFrom??'')) : [...points].reverse().map(original)
 const later=mode==='LATER_REFERENCE' ? candidates.find(r=>points.every(p=>compatible(p.identity,points[points.length-1].identity) && !!entryFor(r,p.identity))) : undefined
 const project=(p:LongitudinalReferencePoint,r:AssessmentReferenceSetDefinition):ResolvedScaleReference|null=>{
  const e=entryFor(r,p.identity)
  if(!e) return null
  return resolveAssessmentReference({instrumentType:'scale',instrumentKey:r.instrumentKey,instrumentVersion:p.identity.instrumentVersion,scoringVersion:p.identity.scoringVersion,selections:[{scoreKey:p.identity.scoreKey,referenceVersion:r.referenceVersion,referenceKind:e.referenceKind}],references:[{...r,status:'ACTIVE'}],score:{key:p.identity.scoreKey,value:p.value},context:{gradeLevel:e.governance!.schoolStage==='junior_secondary'?'8':'11',language:p.identity.locale}})[0]
 }
 const projected=points.map(p=>{
  const timeMatched=mode==='TIME_MATCHED' || (mode==='LATER_REFERENCE' && !later) ? input.references.filter(r=>r.status!=='DRAFT' && Date.parse(r.entries[0]?.governance?.effectiveFrom??'')<=Date.parse(p.at) && !!entryFor(r,p.identity)).sort((a,b)=>Date.parse(b.entries[0].governance!.effectiveFrom)-Date.parse(a.entries[0].governance!.effectiveFrom))[0] : undefined
  return {resultVersion:p.resultVersion,rawValue:p.value,reference:project(p,later??timeMatched??original(p))}
 })
 const payload={schemaVersion:1 as const,resolutionMode:mode,selectedReferenceVersions:[...new Set(projected.flatMap(p=>p.reference?[p.reference.referenceVersion]:[]))],sourceResultVersions:points.map(p=>p.resultVersion),generatedAt:input.generatedAt,compatibilityDecision:mode==='LATER_REFERENCE'?(later?'COMPATIBLE_LATER_REFERENCE':'FALLBACK_TIME_MATCHED'):mode,explicitLatest:input.explicitLatest===true,points:projected}
 return {...payload,snapshotHash:canonicalHash(payload)}
}

export const scaleReferenceIdentitySchema = z.object({
 instrumentKey:z.string().min(1),instrumentVersion:z.string().min(1),scoringVersion:z.string().min(1),measurementHash:z.string().regex(/^[a-f0-9]{64}$/),
 subjectKey:z.string().min(1),locale:z.string().min(1),schoolStage:z.enum(['junior_secondary','upper_secondary']),scoreKey:z.string().min(1),direction:z.string().min(1),
 range:z.object({min:z.number().finite(),max:z.number().finite()}).strict().refine(r=>r.min<r.max),reportVersion:z.string().min(1),originalReferenceVersion:z.string().min(1),originalReferenceHash:z.string().regex(/^[a-f0-9]{64}$/)
}).strict()
