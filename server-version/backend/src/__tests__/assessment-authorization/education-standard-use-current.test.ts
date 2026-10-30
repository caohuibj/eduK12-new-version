import {describe,it,expect,vi} from 'vitest'
vi.mock('../../config/database',()=>({prisma:{}}))
import {readEducationStandardCurrentEvidence} from '../../modules/assessment-authorization/education-standard-use-current'
describe('bounded new identity evidence without new legacy restrictions',()=>{
 const context={entry:'SCHOOL' as const,organizationId:'org',principal:{userId:'recipient',accountDomain:'SCHOOL' as const}}
 it('keeps a large legacy grant list with no new T1 event out of additional authority queries',async()=>{
  const tx={$queryRaw:vi.fn()} as any
  const uses=Array.from({length:200},(_,n)=>({id:'legacy-'+n,subject_id:'recipient',issuer_id:'old-system',resource_keys:['same-old-key']}))
  const found=await readEducationStandardCurrentEvidence(tx,context,uses,true,[])
  expect(found.size).toBe(0);expect(tx.$queryRaw).not.toHaveBeenCalled()
 })
 it('does not silently truncate an oversized set of new typed evidence into a legacy fallback',async()=>{
  const tx={$queryRaw:vi.fn()} as any
  const audits=Array.from({length:129},(_,n)=>({id:'new-'+n,actor_id:'manager',metadata:{}}))
  await expect(readEducationStandardCurrentEvidence(tx,context,[{id:'new-0',subject_id:'recipient',issuer_id:'manager',resource_keys:['key']}],true,audits))
   .rejects.toMatchObject({code:'EDUCATION_CONFIGURATION_USE_BATCH_LIMIT'})
  expect(tx.$queryRaw).not.toHaveBeenCalled()
 })
})
