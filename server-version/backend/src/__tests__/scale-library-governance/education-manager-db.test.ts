import {describe,it,expect,vi,beforeEach} from 'vitest'
import {prisma} from '../../config/database'
import {assertCurrentRunManagerBoundary} from '../../modules/assessment-run/resourceBoundary'
vi.mock('../../config/database',()=>({prisma:{$queryRaw:vi.fn()}}))
const row={membershipId:'member',denied:false,actorDomain:'TRAINING',productDomain:'TRAINING',orgRole:'ORG_ADMIN'}
const input={organizationId:'org',runId:'run',actorUserId:'actor'}
beforeEach(()=>vi.clearAllMocks())
describe('existing manager boundary database context',()=>{
 it('preserves the default database client for legacy callers',async()=>{
  vi.mocked(prisma.$queryRaw).mockResolvedValue([row])
  await assertCurrentRunManagerBoundary(input)
  expect(prisma.$queryRaw).toHaveBeenCalledOnce()
 })
 it('uses the provided transaction rather than a second connection',async()=>{
  const tx={$queryRaw:vi.fn().mockResolvedValue([row])}
  await assertCurrentRunManagerBoundary(input,tx as any)
  expect(tx.$queryRaw).toHaveBeenCalledOnce()
  expect(prisma.$queryRaw).not.toHaveBeenCalled()
 })
})
