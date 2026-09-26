import { beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({findFirst:vi.fn(),canIssueToken:vi.fn(),createToken:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{questionnaire:{findFirst:mocks.findFirst}}}))
vi.mock('../../services/questionnaireAuthorizationService',()=>({questionnaireAuthorizationService:{canIssueToken:mocks.canIssueToken}}))
vi.mock('../../services/tokenService',()=>({tokenService:{createToken:mocks.createToken},serializeQuestionnaireAccessToken:vi.fn()}))
vi.mock('../../utils/logger',()=>({logger:{info:vi.fn(),error:vi.fn(),warn:vi.fn(),debug:vi.fn()}}))
import { generalQuestionnaireController } from '../../controllers/generalQuestionnaireController'
async function create(body:unknown) {
  const res:any={statusCode:200,body:null}
  res.status=(code:number)=>{res.statusCode=code;return res}
  res.json=(value:unknown)=>{res.body=value;return res}
  await generalQuestionnaireController.createToken({user:{userId:'owner',role:'TEACHER'},params:{id:'q'},body} as any,res)
  return res
}
beforeEach(()=>{vi.clearAllMocks();mocks.findFirst.mockResolvedValue({id:'q',status:'PUBLISHED'});mocks.canIssueToken.mockResolvedValue(true);mocks.createToken.mockResolvedValue({id:'token',token:'opaque'})})
it('accepts an exact future deadline and retains the legacy day-based contract',async()=>{
  const expiresAt=new Date(Date.now()+3600000).toISOString()
  expect((await create({expiresAt,maxUses:2})).body.code).toBe(0)
  expect(mocks.createToken).toHaveBeenLastCalledWith({questionnaireId:'q',createdBy:'owner',expiresAt:new Date(expiresAt),maxUses:2})
  expect((await create({expiresDays:7})).body.code).toBe(0)
  const expiry=mocks.createToken.mock.calls[1][0].expiresAt.getTime()
  expect(expiry).toBeGreaterThan(Date.now()+6*86400000)
  expect(expiry).toBeLessThanOrEqual(Date.now()+7*86400000)
})
it.each([
  {expiresAt:'invalid'}, {expiresAt:'2000-01-01T00:00:00Z'},
  {expiresAt:'2099-01-01T00:00:00Z'},
  {expiresAt:new Date(Date.now()+3600000).toISOString(),expiresDays:1},
  {maxUses:-1},{maxUses:1.5},{maxUses:2147483648},
])('rejects invalid deadlines and quotas before creating a link: %j',async(body)=>{
  expect((await create(body)).statusCode).toBe(400)
  expect(mocks.createToken).not.toHaveBeenCalled()
})
it('rechecks permission before issuing an exact-deadline token',async()=>{
  mocks.canIssueToken.mockResolvedValue(false)
  expect((await create({expiresAt:new Date(Date.now()+3600000).toISOString()})).statusCode).toBe(403)
  expect(mocks.createToken).not.toHaveBeenCalled()
})
