import {isSupportedEducationLibraryVariant} from './education-supported-variants'
import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import type {RelationalProductEntryV1} from '../assessment-relational/product-registry'
import {educationLibraryOriginSchema,educationLibraryResourceKey,type EducationLibraryResourceEntry} from './education-runtime-entry'
import {readEducationLibraryUse} from './education-use'
import {ScaleLibraryError,fail} from './contracts'

/** Route callers first authorize the actual activity/event. This read projection
 * still checks that workflow's persistent product, then the current exact grant.
 * No definition, attachment address or answer payload leaves this directory.
 */
export async function listEducationLibraryResourcePage(tx:Prisma.TransactionClient,input:{
 product:'SCHOOL'|'TEACHER';organizationId:string;actorId:string;
 workflow:{kind:'ACTIVITY'|'EVENT';id:string};cursor?:string
}){
 const size=25,batchSize=50,scanBudget=200
 let cursor=input.cursor??''
 if(cursor.length>240||(cursor!==''&&!cursor.startsWith('library-scale:')))fail('EDUCATION_LIBRARY_CURSOR_INVALID',400)
 const workflow= input.product==='SCHOOL'&&input.workflow.kind==='ACTIVITY'
  ? await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT a.course_id AS id FROM campus_activities a
    JOIN courses c ON c.id=a.course_id AND c.organization_id=a.organization_id AND c.course_type='CAMPUS_ACTIVITY'
    WHERE a.organization_id=${input.organizationId} AND a.course_id=${input.workflow.id}`)
  : input.product==='TEACHER'&&input.workflow.kind==='EVENT'
   ? await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT e.id FROM huiteacher_evaluation_events e
     JOIN huiteacher_evaluation_run_links l ON l.event_id=e.id AND l.organization_id=e.organization_id
     JOIN assessment_runs r ON r.id=l.run_id AND r.organization_id=l.organization_id
     WHERE e.organization_id=${input.organizationId} AND e.id=${input.workflow.id}`)
   : []
 if(workflow.length!==1)fail('EDUCATION_LIBRARY_EXPLICIT_WORKFLOW_REQUIRED',403)
 // Scope before candidate retrieval; final pagination follows current issuer /
 // membership / deny qualification, so unauthorized rows cannot consume a page.
 const entries:RelationalProductEntryV1[]=[],qualified=new Map<string,boolean>()
 let scanned=0,exhausted=false
 while(entries.length<size&&scanned<scanBudget){
 const rows=await tx.$queryRaw<Array<{entry:unknown;entryHash:string}>>(Prisma.sql`
  SELECT r.entry,r.entry_hash AS "entryHash" FROM registered_assessment_resources r
  JOIN scale_library_entries e ON e.id=r.entry->'libraryOrigin'->>'entryId'
  WHERE r.status='PUBLISHED' AND e.status='ACTIVE' AND r.entry->'libraryOrigin'->>'product'=${input.product}
    AND r.resource_key LIKE 'library-scale:%'
    AND EXISTS(SELECT 1 FROM scale_library_use_grants g WHERE g.entry_id=e.id
      AND g.product=${input.product} AND g.organization_id=${input.organizationId} AND g.status='ACTIVE'
      AND ((g.scope_kind='USER' AND g.user_id=${input.actorId}) OR (g.scope_kind='ORGANIZATION' AND g.user_id IS NULL)))
    AND r.resource_key>${cursor}
  ORDER BY r.resource_key LIMIT ${batchSize}`)
 if(rows.length===0){exhausted=true;break}
 for(const row of rows){
  if(canonicalHash(row.entry)!==row.entryHash)fail('EDUCATION_LIBRARY_REGISTERED_IDENTITY_MISMATCH')
  const full=row.entry as EducationLibraryResourceEntry,origin=educationLibraryOriginSchema.parse(full.libraryOrigin)
  if(origin.product!==input.product||full.applicability.resourceKey!==educationLibraryResourceKey(origin)
    ||full.applicability.resourceVersion!==origin.adapterVersion)fail('EDUCATION_LIBRARY_REGISTERED_IDENTITY_MISMATCH')
  cursor=full.applicability.resourceKey;scanned++
  const population=input.product==='SCHOOL'?'STUDENT':'TEACHER'
  if(!full.applicability.subjectRoles.includes(population)||!isSupportedEducationLibraryVariant(input.product,origin.variantKey))continue
  if(!qualified.has(origin.entryId)){
   try{
    await readEducationLibraryUse(tx,{product:input.product,organizationId:input.organizationId,actorId:input.actorId,
      entryId:origin.entryId,releaseId:origin.releaseId,contentHash:origin.contentHash})
    qualified.set(origin.entryId,true)
   }catch(error){
    if(!(error instanceof ScaleLibraryError)||![403,409].includes(error.statusCode))throw error
    qualified.set(origin.entryId,false)
   }
  }
  if(!qualified.get(origin.entryId))continue
  const {libraryOrigin:_origin,...metadata}=full
  entries.push(metadata)
  if(entries.length===size)break
 }
 if(rows.length<batchSize&&cursor===(rows[rows.length-1].entry as EducationLibraryResourceEntry).applicability.resourceKey){exhausted=true;break}
 }
 return {entries,nextCursor:exhausted?null:cursor}
}
