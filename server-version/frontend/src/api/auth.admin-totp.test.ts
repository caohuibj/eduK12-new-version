import {beforeEach,describe,expect,it,vi} from 'vitest'
const {post,key}=vi.hoisted(()=>({post:vi.fn(),key:vi.fn()}))
vi.mock('./client',()=>({default:{post}}))
vi.mock('../training/context',()=>({isTrainingHost:()=>false}))
vi.mock('../admin/securityKey',()=>({assertSecurityKey:key}))
import {authApi} from './auth'
const credentials={username:'synthetic-admin',password:'Synthetic1!password'}
beforeEach(()=>{vi.clearAllMocks()})
describe('admin Authenticator wire contract',()=>{
  it('verifies the password before sending the code and returns only the fully authenticated identity',async()=>{
    post.mockResolvedValueOnce({code:0,data:{adminTotpRequired:true}}).mockResolvedValueOnce({code:0,data:{user:{id:'verified'}}})
    const response=await authApi.login(credentials,'admin',{method:'TOTP',code:'123456'})
    expect(post.mock.calls).toEqual([['/auth/login',{...credentials,adminAuthMethod:'TOTP'}],['/admin/security/totp/authentication/verify',{code:'123456'}]])
    expect(response.data?.user.id).toBe('verified')
    expect(key).not.toHaveBeenCalled()
  })
  it('does not complete a TOTP challenge from a business entrance',async()=>{
    post.mockResolvedValueOnce({code:0,data:{adminTotpRequired:true}})
    await expect(authApi.login(credentials)).rejects.toThrow('独立管理员入口')
    expect(post).toHaveBeenCalledTimes(1)
  })
  it('never treats a password challenge or malformed code as a full session',async()=>{
    post.mockResolvedValueOnce({code:0,data:{adminTotpRequired:true}})
    await expect(authApi.login(credentials,'admin',{method:'TOTP',code:'bad'})).rejects.toThrow('六位动态码')
    expect(post).toHaveBeenCalledTimes(1)
  })
  it('keeps the existing hardware ceremony available when explicitly selected',async()=>{
    post.mockResolvedValueOnce({code:0,data:{adminKeyRequired:true,options:{challenge:'synthetic'}}}).mockResolvedValueOnce({code:0,data:{user:{id:'verified'}}})
    key.mockResolvedValue({id:'synthetic-key'})
    await authApi.login(credentials,'admin',{method:'SECURITY_KEY'})
    expect(key).toHaveBeenCalledExactlyOnceWith({challenge:'synthetic'})
    expect(post).toHaveBeenLastCalledWith('/admin/security/authentication/verify',{response:{id:'synthetic-key'}})
  })
})
