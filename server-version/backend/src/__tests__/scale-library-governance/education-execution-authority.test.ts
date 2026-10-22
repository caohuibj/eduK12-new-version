import {Prisma} from '@prisma/client'
import {describe,it,expect,vi} from 'vitest'
import {currentRunPopulationAuthoritySql} from '../../modules/assessment-run/currentPopulationAuthority'
import {assertCurrentRunStartAuthority} from '../../modules/assessment-run/startAuthority'

function accountProbe(rows:unknown[][]){
 const sql:string[]=[]
 const tx={$queryRaw:vi.fn(async(first:any,...values:any[])=>{
  const query=Array.isArray(first)?Prisma.sql(first as any,...values):first
  sql.push(query.sql);return rows.shift()??[]
 })} as unknown as Prisma.TransactionClient
 return {tx,sql}
}
describe('education execution purpose and account-lock boundary',()=>{
 it('keeps default collection denies and rejects School Training fallback',()=>{
  const sql=currentRunPopulationAuthoritySql(Prisma.sql`e.id`).sql
  expect(sql).toContain("'RUN_START'")
  expect(sql).not.toContain("'PARTICIPANT_REPORT_READ'")
  expect(sql).toContain('school_scale.resource_family')
  expect(sql).toContain("'library-scale:%:SCHOOL:%'")
 })
 it('report history uses current report denies, not collection denies or School legacy collection policy',()=>{
  const sql=currentRunPopulationAuthoritySql(Prisma.sql`e.id`,'REPORT_READ').sql
  expect(sql).not.toContain("'RUN_START'")
  expect(sql).toContain("'PARTICIPANT_REPORT_READ'")
  expect(sql).not.toContain('school_scale.resource_family')
  expect(sql).toContain("activity.status IN ('OPEN','PAUSED','CLOSED') AND x.status='COMPLETED'")
  expect(sql).toContain('persona.revoked_at IS NULL')
 })
 it('default caller keeps its existing user SHARE fence',async()=>{
  const p=accountProbe([[]])
  await expect(assertCurrentRunStartAuthority(p.tx,'execution')).rejects.toMatchObject({code:'RUN_ACCOUNT_INACTIVE'})
  expect(p.sql).toHaveLength(1)
  expect(p.sql[0]).toContain('FOR SHARE OF u')
 })
 it('actual library metadata permits query-time accounts without a post-org user lock',async()=>{
  const p=accountProbe([[{id:'execution'}],[]])
  await expect(assertCurrentRunStartAuthority(p.tx,'execution',{accountMode:'DETECT_EDUCATION_LIBRARY'})).rejects.toMatchObject({code:'RUN_ACCOUNT_INACTIVE'})
  expect(p.sql[0]).toContain('registered_assessment_resources')
  expect(p.sql[0]).toContain("r.entry->'libraryOrigin'->>'product'")
  expect(p.sql[1]).not.toContain('FOR SHARE OF u')
 })
 it('requesting detection cannot remove legacy user locks when no actual library track exists',async()=>{
  const p=accountProbe([[],[]])
  await expect(assertCurrentRunStartAuthority(p.tx,'execution',{accountMode:'DETECT_EDUCATION_LIBRARY'})).rejects.toMatchObject({code:'RUN_ACCOUNT_INACTIVE'})
  expect(p.sql[1]).toContain('FOR SHARE OF u')
 })
 it('private source qualification joins the immutable version and real workflow before changing account-lock mode',async()=>{
  const p=accountProbe([[{id:'execution'}],[]])
  await expect(assertCurrentRunStartAuthority(p.tx,'execution',{accountMode:'DETECT_EDUCATION_LIBRARY'})).rejects.toMatchObject({code:'RUN_ACCOUNT_INACTIVE'})
  const query=p.sql[0]
  expect(query).toContain('education_private_tool_versions private_version')
  expect(query).toContain("private_version.content_hash=r.entry->'privateOrigin'->>'contentHash'")
  expect(query).toContain('private_version.organization_id=e.organization_id')
  expect(query).toContain('campus_activity_runs school')
  expect(query).toContain('huiteacher_evaluation_run_links teacher')
  expect(p.sql[1]).not.toContain('FOR SHARE OF u')
  const population=currentRunPopulationAuthoritySql(Prisma.sql`e.id`).sql
  expect(population).toContain("private_version.owner_user_id=registered.entry->'privateOrigin'->>'ownerUserId'")
  expect(population).toContain('private_version.organization_id=org.id')
  expect(population).toContain('private_release.content_hash=registered.entry')
 })

 it('cannot use bound FINAL intake semantics for an unverified legacy/public source',async()=>{
  const p=accountProbe([[{id:'execution',privateForm:false}]])
  await expect(assertCurrentRunStartAuthority(p.tx,'execution',{accountMode:'DETECT_EDUCATION_LIBRARY',operation:'BOUND_FINAL'}))
   .rejects.toMatchObject({code:'RUN_BOUND_FINAL_SOURCE_REQUIRED'})
  expect(p.sql).toHaveLength(1)
 })
 it.each([false,true])('only DB-bound FORM FINAL may finish after the new-intake deadline (final=%s)',async(final)=>{
  const p=accountProbe([[{id:'execution',privateForm:true}],[{valid:true}],[{organizationId:'org',active:true}],
   [{valid:true,denied:false}],[],[{kind:'SELF',ref:null,facts:{}}],[{accountsCurrent:true,populationCurrent:true,intakeOpen:false}]])
  const call=assertCurrentRunStartAuthority(p.tx,'execution',{accountMode:'DETECT_EDUCATION_LIBRARY',...(final?{operation:'BOUND_FINAL' as const}:{})})
  if(final)await expect(call).resolves.toBeUndefined()
  else await expect(call).rejects.toMatchObject({code:'RUN_INTAKE_CLOSED'})
  expect(p.sql[1]).not.toContain('FOR SHARE OF u')
 })

})
