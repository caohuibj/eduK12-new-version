import {randomUUID} from 'node:crypto'
import {beforeEach,describe,expect,it,vi} from 'vitest'
const {reset}=vi.hoisted(()=>({reset:vi.fn()}))
vi.mock('../../modules/anonymous-study/service',()=>({resetParticipationCode:reset}))
vi.mock('../../modules/anonymous-study/governance',()=>({}))
import {authenticate,requireTeacher} from '../../middleware/auth'
import {anonymousStudyRouter} from '../../modules/anonymous-study/routes'
const response=()=>{const res={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);return res}
const handler=()=>{const layer=(anonymousStudyRouter as any).stack.find((c:any)=>c.route?.path==='/:studyId/participation/reset');return layer.route.stack.at(-1).handle}
beforeEach(()=>vi.clearAllMocks())
describe('Training reset issuance uses its authenticated study owner, not Survey step-up',()=>{
 it('keeps real Training authentication and teacher gates before all owner routes',async()=>{
  const stack=(anonymousStudyRouter as any).stack
  expect(stack.findIndex((l:any)=>l.handle===authenticate)).toBeLessThan(stack.findIndex((l:any)=>l.route))
  expect(stack.findIndex((l:any)=>l.handle===requireTeacher)).toBeLessThan(stack.findIndex((l:any)=>l.route))
  const res=response(),next=vi.fn()
  await authenticate({headers:{},cookies:{},get:()=>undefined} as any,res as any,next)
  expect(res.status).toHaveBeenCalledWith(401);expect(next).not.toHaveBeenCalled();expect(reset).not.toHaveBeenCalled()
 })
 it('dispatches only confirmed requests with the authenticated owner id',async()=>{
  const studyId=randomUUID(),res=response();reset.mockResolvedValue({resetCode:'synthetic',expiresAt:'synthetic'})
  await handler()({user:{userId:'owner'},params:{studyId},body:{prefix:'001',confirmed:true}},res,vi.fn())
  expect(reset).toHaveBeenCalledWith('owner',studyId,'001')
 })
 it('preserves non-owner service denial and does not accept a caller-supplied owner',async()=>{
  const res=response();reset.mockRejectedValue(Object.assign(new Error('not owner'),{statusCode:403}))
  await handler()({user:{userId:'other'},params:{studyId:randomUUID()},body:{prefix:'001',confirmed:true}},res,vi.fn())
  expect(res.status).toHaveBeenCalledWith(403)
  reset.mockClear()
  await handler()({user:{userId:'other'},params:{studyId:randomUUID()},body:{prefix:'001',confirmed:true,userId:'owner'}},response(),vi.fn())
  expect(reset).not.toHaveBeenCalled()
 })
 it('requires explicit destructive-proof invalidation confirmation',async()=>{
  const res=response()
  await handler()({user:{userId:'owner'},params:{studyId:randomUUID()},body:{prefix:'001'}},res,vi.fn())
  expect(res.status).toHaveBeenCalledWith(400);expect(reset).not.toHaveBeenCalled()
 })
})
