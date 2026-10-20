import {Prisma} from '@prisma/client'
import {InstrumentFinalSubmitError} from '../../services/instrumentFinalSubmit'
type Parent={id:string;trainingContentBindingHash?:string|null;trainingReferenceBindingHash?:string|null}
const checked=new WeakSet<object>(),digest=/^[a-f0-9]{64}$/
function unavailable():never{throw new InstrumentFinalSubmitError('STALE_ATTEMPT','请先提交人口学上下文并冻结参考选择',409)}
/** Runner/media admission only. Forms must remain accessible to collect context.
 * The two markers join existing parent reads; ready/new and no-content/legacy
 * paths add no query. Older content or incomplete projections need only a small
 * metadata probe, not binding JSON, source samples, selection or scoring. */
export async function assertTrainingReferenceReadyForMeasurement(db:Prisma.TransactionClient,parent:Parent){
 if(checked.has(parent))return
 const content=parent.trainingContentBindingHash,reference=parent.trainingReferenceBindingHash
 if(content===null&&reference===null){checked.add(parent);return}
 // Both immutable columns come from the same authoritative parent read; the
 // database binding guard preserves attempt/epoch/content/context identity.
 if(typeof content==='string'&&digest.test(content)&&typeof reference==='string'&&digest.test(reference)){checked.add(parent);return}
 const [row]=await db.$queryRaw<Array<{id:string;content_hash:string|null;reference_hash:string|null;required:boolean;identity_valid:boolean}>>(Prisma.sql`
  SELECT id,training_content_binding_hash AS content_hash,training_reference_binding_hash AS reference_hash,
   EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(training_content_binding->'units','[]'::jsonb)) u WHERE u ? 'referencePolicy') AS required,
   (training_reference_binding IS NULL OR (
    training_reference_binding->>'attemptId'=id AND training_reference_binding->>'epoch'=attempt_epoch::text
    AND training_reference_binding->>'contentBindingHash'=training_content_binding_hash
    AND (training_reference_binding->>'contextHash') IS NOT DISTINCT FROM context_snapshot_hash)) AS identity_valid
  FROM composite_assessment_attempts WHERE id=${parent.id}`)
 if(!row||row.id!==parent.id||!row.identity_valid||row.required&&(!row.reference_hash||!digest.test(row.reference_hash))
  ||content!==undefined&&content!==row.content_hash||reference!==undefined&&reference!==null&&reference!==row.reference_hash)unavailable()
 checked.add(parent)
}
