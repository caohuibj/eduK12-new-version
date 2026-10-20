import { beforeEach,afterEach, describe, expect, it, vi } from 'vitest'
const { post, training,assertKey } = vi.hoisted(() => ({post:vi.fn(), training:vi.fn(),assertKey:vi.fn()}))
vi.mock('../client', () => ({default:{post}}))
vi.mock('../../training/context', () => ({isTrainingHost:training}))
vi.mock('../../admin/securityKey',()=>({assertSecurityKey:assertKey}))
import { authApi } from '../auth'
beforeEach(()=>{post.mockResolvedValue({code:0,data:{user:{id:'synthetic',role:'TEACHER'}}})})
afterEach(() => vi.clearAllMocks())
describe('explicit administrator authentication entrance', () => {
  it.each([true,false])('uses generic same-origin login for administrator entrance (training=%s)', async host => {
    training.mockReturnValue(host)
    const data={username:'synthetic-admin',password:'synthetic-password'}
    await authApi.login(data,'admin')
    expect(post).toHaveBeenCalledExactlyOnceWith('/auth/login',data)
    expect(Object.keys(post.mock.calls[0][1])).toEqual(['username','password'])
  })
  it.each([['STUDENT'],['TEACHER']] as const)('preserves training login for %s', async expectedRole => {
    training.mockReturnValue(true)
    const data={username:'synthetic-user',password:'synthetic-password',expectedRole}
    await authApi.login(data)
    expect(post).toHaveBeenCalledExactlyOnceWith('/auth/training-login',data)
  })
  it('preserves ordinary generic login off the training host', async () => {
    training.mockReturnValue(false)
    const data={username:'synthetic-user',password:'synthetic-password'}
    await authApi.login(data)
    expect(post).toHaveBeenCalledExactlyOnceWith('/auth/login',data)
  })
  it('directs a business login with management qualification to the explicit admin entrance without completing its ceremony',async()=>{
    post.mockResolvedValueOnce({code:0,data:{adminKeyRequired:true,options:{challenge:'synthetic'}}})
    await expect(authApi.login({username:'overlap',password:'synthetic-password'})).rejects.toThrow('独立管理员入口')
    expect(assertKey).not.toHaveBeenCalled();expect(post).toHaveBeenCalledTimes(1)
  })
})
