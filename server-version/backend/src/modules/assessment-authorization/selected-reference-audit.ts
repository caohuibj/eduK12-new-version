import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {selectedConfigurationPointerSchema} from './standard-configuration-binding'

const hash=z.string().regex(/^[a-f0-9]{64}$/)
const reference=z.object({slotId:z.string().min(1).max(240),kind:z.enum(['STANDARD_COMBINATION','COGNITIVE_PROFILE']),
 sourceId:z.string().guid(),sourceHash:hash,referenceHash:hash,selectedBinding:selectedConfigurationPointerSchema}).strict()
export type SelectedReferenceAudit=z.infer<typeof reference>

/** Identity-only T2 audit. Callers retain their existing container ACL and
 * transaction. No current grant, latest registry, executable or report body. */
export function selectedReferenceChanges(previous:readonly SelectedReferenceAudit[],next:readonly SelectedReferenceAudit[]){
 const project=(raw:readonly SelectedReferenceAudit[])=>{
  const rows=z.array(reference).max(500).parse(raw)
  if(new Set(rows.map(row=>row.slotId)).size!==rows.length)throw Error('DUPLICATE_SELECTED_REFERENCE_SLOT')
  return rows.sort((a,b)=>a.slotId<b.slotId?-1:a.slotId>b.slotId?1:0)
 }
 const before=project(previous),after=project(next),oldHashes=new Set(before.map(canonicalHash)),newHashes=new Set(after.map(canonicalHash))
 const removed=before.filter(row=>!newHashes.has(canonicalHash(row))),added=after.filter(row=>!oldHashes.has(canonicalHash(row)))
 return removed.length||added.length?{removed,added,changeHash:canonicalHash({removed,added})}:null
}
