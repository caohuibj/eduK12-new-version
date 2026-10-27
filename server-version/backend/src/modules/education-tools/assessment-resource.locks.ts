import {Prisma} from '@prisma/client'
import {EducationAssessmentSourceError} from './assessment-resource.repository'

/** Account lifecycle can hold User UPDATE before Organization UPDATE, while
 * existing education workflows already hold Organization. Never wait for an
 * account lock in this inverse order. A concurrent mutation returns a retryable
 * conflict and rolls back the whole transaction; it never grants stale access.
 * No retries, lock-timeout setting, or authorization cache is introduced here.
 */
export async function lockEducationAssessmentUsers(tx:Prisma.TransactionClient,ids:string[]){
 if(!ids.length)return
 try{
  await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id IN (${Prisma.join([...new Set(ids)].sort())}) ORDER BY id FOR SHARE NOWAIT`)
 }catch(error){
  const e=error as {code?:string;meta?:{code?:string}}
  if(e.code==='55P03'||e.meta?.code==='55P03')throw new EducationAssessmentSourceError('EDUCATION_ASSESSMENT_AUTHORITY_BUSY')
  throw error
 }
}
/** Prelock all exact chain subjects without waiting before the existing content
 * authority reader takes its grant/User locks. Missing/changed chains still
 * fail through that reader; this discovery query grants no permission. */
export async function lockEducationDistributionSubjects(tx:Prisma.TransactionClient,grantIds:string[]){
 const rows=await tx.$queryRaw<Array<{subject_id:string}>>(Prisma.sql`
  SELECT DISTINCT ancestor.subject_id FROM content_capability_grants leaf
   JOIN content_capability_grants ancestor ON ancestor.id=ANY(leaf.ancestry)
   WHERE leaf.id IN (${Prisma.join([...new Set(grantIds)].sort())})`)
 await lockEducationAssessmentUsers(tx,rows.map(row=>row.subject_id))
}
