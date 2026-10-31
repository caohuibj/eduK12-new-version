import {expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({query:vi.fn(),context:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:m.query}}))
vi.mock('../../modules/organization/access',()=>({resolveOrganizationAccessContext:m.context,contextHasCapability:vi.fn()}))
import {listCampusGroupReportHistory} from '../../modules/campus/group-reports'
it('pages only source-scoped pointers with the full time/ID cursor, never recomputing report facts',async()=>{
 m.context.mockResolvedValue({membershipId:'manager',productDomain:'SCHOOL',organizationStatus:'ACTIVE',orgRole:'ORG_ADMIN',personas:[],capabilities:[],explicitDenies:[]})
 const generatedAt='2026-10-31T00:00:00.123456Z'
 const rows=Array.from({length:26},(_,i)=>({artifactId:'10000000-0000-4000-8000-'+(26-i).toString().padStart(12,'0'),generatedAt}))
 m.query.mockImplementation(async(q:any)=>{
  const sql=q.strings.join(' ')
  expect(sql).toContain("a.artifact_payload->'source'->>'runId'")
  expect(sql).toContain("a.artifact_payload->'source'->>'trackId'")
  expect(sql).toContain("a.artifact_payload->>'schemaVersion'='2'")
  expect(sql).toContain("a.analysis_kind='GROUP'")
  expect(sql).toContain('ORDER BY a.generated_at DESC,a.id DESC LIMIT 26')
  expect(q.values.slice(0,3)).toEqual(['org','run','track'])
  if(sql.includes('(a.generated_at,a.id)<')){
   expect(q.values.at(-2)).toBe(generatedAt)
   return rows.slice(rows.findIndex(row=>row.artifactId===q.values.at(-1))+1)
  }
  return rows
 })
 const input={actor:{userId:'manager',role:'ADMIN',accountDomain:'SCHOOL'} as any,organizationId:'org',runId:'run',trackId:'track'}
 const first=await listCampusGroupReportHistory(input)
 const second=await listCampusGroupReportHistory({...input,before:first.nextCursor!})
 expect(first.artifacts).toHaveLength(25);expect(second.artifacts).toEqual(rows.slice(25));expect(second.nextCursor).toBeNull()
 expect([...first.artifacts,...second.artifacts]).toEqual(rows)
 expect(first.nextCursor?.generatedAt).toBe(generatedAt)
 expect(m.query).toHaveBeenCalledTimes(2)
})
