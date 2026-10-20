import { matchReferencePopulation, type AssessmentReferenceEntry, type ReferenceContext, type ReferenceKind } from '../assessment-reference/reference'
import { referenceEntryKey } from './reference-candidate'
import { ContentReleaseError, type ReleaseStatus } from './release'

export interface FrozenReferenceChoice {
  releaseId:string
  contentHash:string
  entryKey:string
  metricKey:string
  referenceKind:ReferenceKind
  priority:number
}
export interface FrozenReferencePolicy {
  policyVersion:'EXACT_POPULATION_PRIORITY_V1'
  measurementReleaseId:string
  choices:FrozenReferenceChoice[]
}
export interface VerifiedReferenceForSelection {
  releaseId:string
  contentHash:string
  measurementReleaseId:string
  status:ReleaseStatus
  entries:AssessmentReferenceEntry[]
}
export type SelectedReferenceSlot={metricKey:string;referenceKind:ReferenceKind} & (
  {status:'SELECTED';releaseId:string;contentHash:string;entryKey:string} |
  {status:'UNAVAILABLE';reason:'REVOKED'|'RETIRED'|'MISSING_CONTEXT'|'NO_MATCH'|'AMBIGUOUS'})
/** The caller loads exact immutable releases once and checks current permissions.
 * No registry default/latest lookup, sample scan, scorer, or report side effect.
 * Normal supersession remains valid inside an already frozen candidate set.
 */
export function selectFrozenReferencePolicy(policy:FrozenReferencePolicy,releases:readonly VerifiedReferenceForSelection[],context:ReferenceContext):SelectedReferenceSlot[]{
  if(policy.choices.length>1000||releases.length>1000)throw new ContentReleaseError('REFERENCE_POLICY_BOUND_EXCEEDED')
  if(policy.policyVersion!=='EXACT_POPULATION_PRIORITY_V1')throw new ContentReleaseError('REFERENCE_POLICY_UNSUPPORTED')
  const index=new Map<string,{release:VerifiedReferenceForSelection;entries:Map<string,AssessmentReferenceEntry>}>()
  for(const release of releases){
    if(index.has(release.releaseId))throw new ContentReleaseError('REFERENCE_RELEASE_DUPLICATE')
    const entries=new Map(release.entries.map(e=>[referenceEntryKey(e),e]))
    if(entries.size!==release.entries.length)throw new ContentReleaseError('REFERENCE_ENTRY_DUPLICATE')
    index.set(release.releaseId,{release,entries})
  }
  const slots=new Map<string,Array<{choice:FrozenReferenceChoice;status:ReleaseStatus;match:ReturnType<typeof matchReferencePopulation>}>>()
  const seen=new Set<string>()
  for(const choice of policy.choices){
    const identity=JSON.stringify([choice.releaseId,choice.entryKey])
    if(seen.has(identity)||!Number.isSafeInteger(choice.priority))throw new ContentReleaseError('REFERENCE_POLICY_CHOICE_INVALID')
    seen.add(identity)
    const loaded=index.get(choice.releaseId),entry=loaded?.entries.get(choice.entryKey)
    if(!loaded||!entry||loaded.release.contentHash!==choice.contentHash||loaded.release.measurementReleaseId!==policy.measurementReleaseId
      ||entry.scoreKey!==choice.metricKey||entry.referenceKind!==choice.referenceKind)throw new ContentReleaseError('REFERENCE_POLICY_IDENTITY_MISMATCH')
    const slot=JSON.stringify([choice.metricKey,choice.referenceKind]),group=slots.get(slot)??[]
    group.push({choice,status:loaded.release.status,match:matchReferencePopulation(entry.population,context)});slots.set(slot,group)
  }
  return [...slots.values()].map((group):SelectedReferenceSlot=>{
    const first=group[0].choice,slot={metricKey:first.metricKey,referenceKind:first.referenceKind}
    if(group.some(c=>c.status==='REVOKED'))return {...slot,status:'UNAVAILABLE',reason:'REVOKED'}
    const matches=group.filter(c=>c.status!=='RETIRED'&&c.match==='MATCH')
    if(!matches.length)return {...slot,status:'UNAVAILABLE',reason:group.every(c=>c.status==='RETIRED')?'RETIRED':group.some(c=>c.match==='MISSING_CONTEXT')?'MISSING_CONTEXT':'NO_MATCH'}
    const priority=Math.max(...matches.map(c=>c.choice.priority)),top=matches.filter(c=>c.choice.priority===priority)
    if(top.length!==1)return {...slot,status:'UNAVAILABLE',reason:'AMBIGUOUS'}
    const choice=top[0].choice
    return {...slot,status:'SELECTED',releaseId:choice.releaseId,contentHash:choice.contentHash,entryKey:choice.entryKey}
  })
}
