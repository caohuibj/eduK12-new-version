import {z} from 'zod'
import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import type {AssessmentReferenceEntry} from '../assessment-reference/reference'
import {getContentRelease,type StoredRelease} from '../measurement-content/repository'
import {referenceEntryKey} from '../measurement-content/reference-candidate'
import type {FrozenReferencePolicy} from '../measurement-content/reference-policy'
import {SurveyWaveError} from './waves.service'
import type {ResearchFrozenUnit} from './publication.service'
const id=z.string().uuid()
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
    if(!release||release.status!=='PUBLISHED'||release.scope.kind!=='PRIVATE'||release.scope.ownerId!==actorId
      ||release.scope.product!=='SURVEY'||release.scope.resourceId!==projectId)fail()
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
      if(release.family!==unit!.kind||release.content.measurement.releaseId!==measurement.releaseId
        ||release.content.measurement.contentHash!==measurement.contentHash)fail()
      const entries=release.content.entries.filter(e=>referenceEntryKey(e.definition as unknown as AssessmentReferenceEntry)===choice.entryKey)
      if(entries.length!==1)fail()
      const entry=entries[0]
      policy.choices.push({...choice,contentHash:release.contentHash,metricKey:entry.metricKey,referenceKind:entry.referenceKind})
    }
    const binding:FrozenSurveyContentSelection={referencePolicy:policy}
    if(selection.reportReleaseId){
      const report=await read(selection.reportReleaseId)
      if(report.layer!=='REPORT')return fail()
      if(report.family!==unit!.kind||report.content.measurements.length!==1
        ||canonicalHash(report.content.measurements[0])!==canonicalHash({releaseId:measurement.releaseId,contentHash:measurement.contentHash}))fail()
      binding.reportRelease={releaseId:report.releaseId,contentHash:report.contentHash}
    }
    unit!.contentSelection=binding
  }
}
