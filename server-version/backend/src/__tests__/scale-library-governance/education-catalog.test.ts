import {describe,it,expect,vi,beforeEach} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {ScaleLibraryError} from '../../modules/scale-library-governance/contracts'
import {listEducationLibraryResourcePage} from '../../modules/scale-library-governance/education-catalog'
import {readEducationLibraryUse} from '../../modules/scale-library-governance/education-use'
vi.mock('../../modules/scale-library-governance/education-use',()=>({readEducationLibraryUse:vi.fn()}))
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
function row(n:number){
 const origin={schemaVersion:1,adapterVersion:'1.0.0',entryId:uuid(n),product:'SCHOOL',releaseId:uuid(1000+n),contentHash:'a'.repeat(64),approvedSnapshotHash:'b'.repeat(64),sourceDefinitionHash:'c'.repeat(64),applicabilityHash:'d'.repeat(64),variantKey:'STUDENT:SELF',dependencies:[]}
 const entry={title:`scale ${n}`,libraryOrigin:origin,applicability:{resourceKey:`library-scale:${uuid(n)}:SCHOOL:STUDENT:SELF`,resourceVersion:'1.0.0',subjectRoles:['STUDENT']}}
 return {entry,entryHash:canonicalHash(entry)}
}
const input={product:'SCHOOL' as const,organizationId:uuid(9000),actorId:uuid(9001),workflow:{kind:'ACTIVITY' as const,id:uuid(9002)}}
function db(rows:ReturnType<typeof row>[]){return {$queryRaw:vi.fn(async(query:any)=>{
 if(query.strings.join('').includes('FROM campus_activities'))return [{id:input.workflow.id}]
 const cursor=query.values.find((v:any)=>typeof v==='string'&&(v===''||v.startsWith('library-scale:')))??''
 return rows.filter(r=>r.entry.applicability.resourceKey>cursor).slice(0,50)
})} as any}
beforeEach(()=>vi.clearAllMocks())
describe('current education library cursor catalog',()=>{
 it('does not let denied candidates consume the visible page or expose library origin',async()=>{
  const rows=Array.from({length:51},(_,i)=>row(i+1))
  vi.mocked(readEducationLibraryUse).mockImplementation(async(_tx,context)=>{
   if(context.entryId!==uuid(51))throw new ScaleLibraryError(403,'revoked issuer')
   return {} as any
  })
  const result=await listEducationLibraryResourcePage(db(rows),input)
  expect(result.entries).toHaveLength(1)
  expect(result.entries[0]).not.toHaveProperty('libraryOrigin')
  expect(result.nextCursor).toBeNull()
 })
 it('returns scan position on an empty budgeted page and resumes without losing unscanned entries',async()=>{
  const rows=Array.from({length:201},(_,i)=>row(i+1))
  vi.mocked(readEducationLibraryUse).mockImplementation(async(_tx,context)=>{
   if(context.entryId!==uuid(201))throw new ScaleLibraryError(403,'revoked issuer')
   return {} as any
  })
  const first=await listEducationLibraryResourcePage(db(rows),input)
  expect(first.entries).toHaveLength(0)
  expect(first.nextCursor).toBe(rows[199].entry.applicability.resourceKey)
  expect(readEducationLibraryUse).toHaveBeenCalledTimes(200)
  const second=await listEducationLibraryResourcePage(db(rows),{...input,cursor:first.nextCursor!})
  expect(second.entries).toHaveLength(1)
  expect(second.nextCursor).toBeNull()
 })
 it('does not treat an infrastructure error as an unauthorized empty catalog',async()=>{
  vi.mocked(readEducationLibraryUse).mockRejectedValue(new Error('database disconnected'))
  await expect(listEducationLibraryResourcePage(db([row(1)]),input)).rejects.toThrow('database disconnected')
 })
})
