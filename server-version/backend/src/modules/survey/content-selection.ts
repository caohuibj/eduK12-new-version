import {z} from 'zod'
import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import type {AssessmentReferenceEntry} from '../assessment-reference/reference'
import {getContentRelease,type StoredRelease} from '../measurement-content/repository'
import {referenceEntryKey} from '../measurement-content/reference-candidate'
import type {FrozenReferencePolicy} from '../measurement-content/reference-policy'
import {SurveyWaveError} from './waves.service'
import type {ResearchFrozenUnit} from './publication.service'
const id=z.string().guid()
export const surveyContentSelectionsSchema=z.array(z.object({
  instrumentId:id,reportReleaseId:id.optional(),
  references:z.array(z.object({releaseId:id,entryKey:z.string().regex(/^[a-f0-9]{64}$/),priority:z.number().int().safe()}).strict()).max(100),
}).strict()).max(30)
export type SurveyContentSelection=z.infer<typeof surveyContentSelectionsSchema>[number]
export interface FrozenSurveyContentSelection {
  referencePolicy:FrozenReferencePolicy
  reportRelease?:{releaseId:string;contentHash:string}
}
const fail=():never=>{throw new SurveyWaveError(409,'所选参考或报告版本不可用，或与当前项目测量不兼容')}
/** Shared picker/freezer eligibility. Discovery never expands the private scope. */
export function surveyContentReleaseInScope(release:StoredRelease,actorId:string,projectId:string):boolean{
  return release.status==='PUBLISHED'&&release.scope.kind==='PRIVATE'&&release.scope.ownerId===actorId
    &&release.scope.product==='SURVEY'&&release.scope.resourceId===projectId
}
export function surveyContentReleaseMatchesMeasurement(release:StoredRelease,unit:Pick<ResearchFrozenUnit,'kind'|'measurementRelease'>):boolean{
  const measurement=unit.measurementRelease
  if(!measurement||unit.kind==='FORM'||release.family!==unit.kind)return false
  const pointer={releaseId:measurement.releaseId,contentHash:measurement.contentHash}
  return release.layer==='REFERENCE'
    ?canonicalHash(release.content.measurement)===canonicalHash(pointer)
    :release.layer==='REPORT'&&release.content.measurements.length===1&&canonicalHash(release.content.measurements[0])===canonicalHash(pointer)
}
const frozenText=z.string().min(1).max(240),digest=z.string().regex(/^[a-f0-9]{64}$/)
export const surveyFrozenMeasurementPointerSchema=z.object({releaseId:frozenText,contentHash:digest,measurementHash:digest}).strict()
export const surveyFrozenContentSelectionSchema=z.object({
  referencePolicy:z.object({policyVersion:z.literal('EXACT_POPULATION_PRIORITY_V1'),measurementReleaseId:frozenText,
    choices:z.array(z.object({releaseId:frozenText,contentHash:digest,entryKey:digest,priority:z.number().int().safe(),
      metricKey:frozenText,referenceKind:z.enum(['normative_distribution','criterion_threshold','descriptive_sample','theoretical_range'])}).strict()).max(100)}).strict(),
  reportRelease:z.object({releaseId:frozenText,contentHash:digest}).strict().optional(),
}).strict()

/** Inside authenticated Wave freeze transaction. Each exact private release is
 * locked once per request. No global cache or implicit shared/platform access. */
export async function freezeSurveyContentSelections(tx:Prisma.TransactionClient,actorId:string,projectId:string,
  units:ResearchFrozenUnit[],raw:unknown):Promise<void>{
  const selections=surveyContentSelectionsSchema.parse(raw)
  if(new Set(selections.map(s=>s.instrumentId)).size!==selections.length)fail()
  const cache=new Map<string,StoredRelease>()
  const read=async(releaseId:string)=>{
    if(cache.has(releaseId))return cache.get(releaseId)!
    const release=await getContentRelease(tx,releaseId,true)
    if(!release||!surveyContentReleaseInScope(release,actorId,projectId))fail()
    cache.set(releaseId,release!);return release!
  }
  for(const selection of selections){
    const unit=units.find(u=>u.draftId===selection.instrumentId)
    if(!unit||unit.kind==='FORM'||!unit.measurementRelease)fail()
    const measurement=unit!.measurementRelease!
    const policy:FrozenReferencePolicy={policyVersion:'EXACT_POPULATION_PRIORITY_V1',measurementReleaseId:measurement.releaseId,choices:[]}
    const seen=new Set<string>()
    for(const choice of selection.references){
      const identity=JSON.stringify([choice.releaseId,choice.entryKey])
      if(seen.has(identity))fail();seen.add(identity)
      const release=await read(choice.releaseId)
      if(release.layer!=='REFERENCE')return fail()
      if(!surveyContentReleaseMatchesMeasurement(release,unit!))fail()
      const entries=release.content.entries.filter(e=>referenceEntryKey(e.definition as unknown as AssessmentReferenceEntry)===choice.entryKey)
      if(entries.length!==1)fail()
      const entry=entries[0]
      policy.choices.push({...choice,contentHash:release.contentHash,metricKey:entry.metricKey,referenceKind:entry.referenceKind})
    }
    const binding:FrozenSurveyContentSelection={referencePolicy:policy}
    if(selection.reportReleaseId){
      const report=await read(selection.reportReleaseId)
      if(report.layer!=='REPORT')return fail()
      if(!surveyContentReleaseMatchesMeasurement(report,unit!))fail()
      binding.reportRelease={releaseId:report.releaseId,contentHash:report.contentHash}
    }
    unit!.contentSelection=binding
  }
}
