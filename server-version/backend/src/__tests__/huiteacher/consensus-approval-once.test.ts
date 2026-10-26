import {createHash} from 'node:crypto'
import {beforeEach,describe,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({tx:{} as Record<string,any>,audit:vi.fn(),approved:false,record:{id:'consensus',organizationId:'org',eventId:'event',title:'共识',bodyCipher:'cipher',status:'DRAFT',revision:3,createdByUserId:'manager',submittedAt:null}}))
vi.mock('../../config/database',()=>({prisma:{$transaction:async(fn:(tx:unknown)=>Promise<unknown>)=>fn(state.tx)}}))
vi.mock('../../modules/assessment-runtime/security',()=>({encryptUnifiedRuntimePayload:()=> 'cipher',decryptUnifiedRuntimePayload:()=>({schemaVersion:1,product:'HUITEACHER',kind:'FIELD_CONSENSUS',content:'合成共识'})}))
vi.mock('../../modules/organization/service',()=>({appendAudit:state.audit}))
vi.mock('../../modules/organization/educationProductAccess',()=>({resolveEducationProductMemberScope:vi.fn()}))
import {approveHuiteacherFieldConsensus,myHuiteacherConsensusReviews} from '../../modules/huiteacher/consensus.service'
beforeEach(()=>{
 vi.clearAllMocks();state.approved=false;state.record.revision=3
 const src=['actor','other'].map((user,index)=>({recordId:'record'+index,sourceCipherHash:createHash('sha256').update(user).digest('hex'),observerUserId:user,kind:'FORMAL_FEEDBACK',bodyCipher:user,status:'SUBMITTED'}))
 state.tx={$queryRaw:vi.fn(async(strings:TemplateStringsArray)=>{const sql=strings.join('');if(sql.includes('SELECT DISTINCT consensus.'))return [{id:'consensus'}];if(sql.includes('FROM "huiteacher_field_consensus_sources"'))return src;if(sql.includes('FROM "huiteacher_field_consensuses"'))return [state.record];return [{id:'actor'}]}),huiteacherFieldConsensusApproval:{findMany:vi.fn(async()=>state.approved?[{observerUserId:'actor'}]:[]),findFirst:vi.fn(async()=>null),createMany:vi.fn(async()=>({count:1}))}}
})
const input=async()=>({actorUserId:'actor',consensusId:'consensus',expectedRevision:3,expectedDigest:(await myHuiteacherConsensusReviews('actor')).list[0].digest})
describe('Teacher exact-version consensus approval',()=>{
 it('projects only this actor approval for the current version and exact digest',async()=>{
  expect((await myHuiteacherConsensusReviews('actor')).list[0].approvedByMe).toBe(false)
  state.approved=true
  const row=(await myHuiteacherConsensusReviews('actor')).list[0]
  expect(row.approvedByMe).toBe(true);expect(row.approvalCount).toBe(1)
  expect(state.tx.huiteacherFieldConsensusApproval.findMany).toHaveBeenLastCalledWith({where:{consensusId:'consensus',revision:3,contentHash:row.digest},select:{observerUserId:true}})
  expect((await myHuiteacherConsensusReviews('other')).list[0].approvedByMe).toBe(false)
 })
 it('reuses a concurrently inserted same-version receipt without a duplicate audit',async()=>{
  const payload=await input();state.tx.huiteacherFieldConsensusApproval.createMany.mockResolvedValue({count:0})
  state.tx.huiteacherFieldConsensusApproval.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({id:'receipt',contentHash:payload.expectedDigest})
  expect((await approveHuiteacherFieldConsensus(payload)).replayed).toBe(true)
  expect(state.tx.huiteacherFieldConsensusApproval.createMany).toHaveBeenCalledWith(expect.objectContaining({skipDuplicates:true}))
  expect(state.audit).not.toHaveBeenCalled()
 })
 it('rejects a concurrent different-digest receipt rather than treating it as confirmed',async()=>{
  const payload=await input();state.tx.huiteacherFieldConsensusApproval.createMany.mockResolvedValue({count:0})
  state.tx.huiteacherFieldConsensusApproval.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({id:'receipt',contentHash:'different'})
  await expect(approveHuiteacherFieldConsensus(payload)).rejects.toMatchObject({code:'HUITEACHER_CONSENSUS_APPROVAL_CONFLICT'})
  expect(state.audit).not.toHaveBeenCalled()
 })
 it('rejects a stale version before attempting to insert a signature',async()=>{
  const payload=await input();state.record.revision=4
  await expect(approveHuiteacherFieldConsensus(payload)).rejects.toMatchObject({code:'HUITEACHER_CONSENSUS_CHANGED_SINCE_REVIEW'})
  expect(state.tx.huiteacherFieldConsensusApproval.createMany).not.toHaveBeenCalled()
 })
})
