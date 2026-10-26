import {describe,expect,it,vi} from 'vitest'
vi.mock('../../config/database',()=>({prisma:{}}))
import {readStandardApprovalIntent} from '../../modules/survey/standard-triplet.service'
describe('unverifiable legacy approval scope fails explicitly without rewriting history',()=>{
 it.each(['missing','hardcoded-survey','wrong-actor','ambiguous','invalid-products'])('requires verifiable product evidence: %s',async kind=>{
  const row={id:'release',combination_hash:'hash',approved_by:'system',snapshot:{reference:{approvals:[]}}} as never
  const metadata={combinationHash:'hash',reason:'original',...(kind==='hardcoded-survey'?{scope:'SURVEY_ONLY'}:{allowedProducts:kind==='invalid-products'?['TRAINING','TRAINING']:['TRAINING']})}
  const event={actor_user_id:kind==='wrong-actor'?'other':'system',metadata}
  const db={$queryRaw:vi.fn(async()=>kind==='missing'?[]:kind==='ambiguous'?[event,event]:[event]),$executeRaw:vi.fn()}
  await expect(readStandardApprovalIntent(db as never,row)).rejects.toMatchObject({statusCode:409})
  expect(db.$executeRaw).not.toHaveBeenCalled()
 })
})
