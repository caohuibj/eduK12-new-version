import {beforeEach,describe,expect,it,vi} from 'vitest'
import type {Request,Response} from 'express'
const {list}=vi.hoisted(()=>({list:vi.fn()}))
vi.mock('../../services/trainingLearningInbox',()=>({listTrainingLearningInbox:list}))
import {trainingLearningInbox} from '../../controllers/trainingLearningController'
function response(){const res={setHeader:vi.fn(),status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);res.json.mockReturnValue(res);return res}
beforeEach(()=>{vi.clearAllMocks();list.mockResolvedValue({summary:{todo:2,feedback:1}})})
describe('Training overview request boundary',()=>{
 it('uses the authenticated identity and disables caching',async()=>{
  const res=response();await trainingLearningInbox({query:{},user:{userId:'owner'}} as unknown as Request,res as unknown as Response)
  expect(list).toHaveBeenCalledWith('owner',{view:'todo',kind:'ALL',page:1,pageSize:6})
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','no-store')
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({code:0}))
 })
 it.each([{userId:'other'},{courseId:'other'},{view:'invalid'},{page:'0'},{pageSize:'51'},{kind:['ALL','CHECKIN']}])('rejects malformed queries and caller-selected authority %j',async(query)=>{
  const res=response();await trainingLearningInbox({query,user:{userId:'owner'}} as unknown as Request,res as unknown as Response)
  expect(res.status).toHaveBeenCalledWith(400);expect(list).not.toHaveBeenCalled()
 })
 it('returns a safe failure without exposing database/config details',async()=>{
  list.mockRejectedValue(new Error('private configuration detail'))
  const res=response();await trainingLearningInbox({query:{view:'feedback'},user:{userId:'owner'}} as unknown as Request,res as unknown as Response)
  expect(res.status).toHaveBeenCalledWith(503);expect(JSON.stringify(res.json.mock.calls)).not.toContain('private configuration')
 })
})
