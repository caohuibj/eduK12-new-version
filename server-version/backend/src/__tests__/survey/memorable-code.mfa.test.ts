import {describe,it,expect,vi} from 'vitest'
import type {Request,Response} from 'express'
const reset=vi.hoisted(()=>vi.fn().mockResolvedValue({resetCode:'001-ABCDEF1234'}))
vi.mock('../../modules/survey/memorable-code.service',()=>({readParticipationSettings:vi.fn(),configureParticipation:vi.fn(),resetMemorableIdentity:reset}))
import {surveyProjectsRouter} from '../../modules/survey/projects.routes'
import {generateToken} from '../../utils/jwt'
const user={userId:'fixture-owner',tokenVersion:1,accountDomain:'SURVEY' as const,role:'STUDENT' as const,username:'fixture-owner'}
const route=surveyProjectsRouter.stack.find(layer=>layer.route?.path==='/:id/participation/reset')!.route!.stack[0].handle
async function request(patch:Record<string,unknown>|null){
 reset.mockClear()
 const token=patch?generateToken({...user,...patch}):''
 const req={user,params:{id:'11111111-1111-4111-8111-111111111111'},body:{prefix:'001'},headers:{cookie:token?'huisurvey_research_session='+token:''}} as unknown as Request
 const res={status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res)
 await route(req,res as unknown as Response,vi.fn())
 return res
}
describe('participant-code reset uses the existing recent signed Survey MFA gate',()=>{
 it('rejects an ordinary or stale researcher session before issuing any reset token',async()=>{
  for(const payload of [null,{}, {mfaVerifiedAt:Math.floor(Date.now()/1000)-301}]){
   const res=await request(payload);expect(res.status).toHaveBeenCalledWith(403);expect(reset).not.toHaveBeenCalled()
  }
 })
 it('rejects another account or wrong account domain even with recent MFA',async()=>{
  for(const payload of [{userId:'other'},{accountDomain:'LEGACY'},{tokenVersion:0}]){
   const res=await request({...payload,mfaVerifiedAt:Math.floor(Date.now()/1000)});expect(res.status).toHaveBeenCalledWith(403);expect(reset).not.toHaveBeenCalled()
  }
 })
 it('passes the authenticated owner and original assigned prefix only after recent MFA',async()=>{
  await request({mfaVerifiedAt:Math.floor(Date.now()/1000)})
  expect(reset).toHaveBeenCalledWith(user.userId,'11111111-1111-4111-8111-111111111111','001')
 })
})
