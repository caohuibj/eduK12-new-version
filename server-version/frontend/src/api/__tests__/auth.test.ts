import { afterEach, describe, expect, it, vi } from 'vitest'
const { post, training } = vi.hoisted(() => ({post:vi.fn(), training:vi.fn()}))
vi.mock('../client', () => ({default:{post}}))
vi.mock('../../training/context', () => ({isTrainingHost:training}))
import { authApi } from '../auth'
afterEach(() => vi.clearAllMocks())
describe('explicit administrator authentication entrance', () => {
  it.each([true,false])('uses generic same-origin login for administrator entrance (training=%s)', host => {
    training.mockReturnValue(host)
    const data={username:'synthetic-admin',password:'synthetic-password'}
    authApi.login(data,'admin')
    expect(post).toHaveBeenCalledExactlyOnceWith('/auth/login',data)
    expect(Object.keys(post.mock.calls[0][1])).toEqual(['username','password'])
  })
  it.each([['STUDENT'],['TEACHER']] as const)('preserves training login for %s', expectedRole => {
    training.mockReturnValue(true)
    const data={username:'synthetic-user',password:'synthetic-password',expectedRole}
    authApi.login(data)
    expect(post).toHaveBeenCalledExactlyOnceWith('/auth/training-login',data)
  })
  it('preserves ordinary generic login off the training host', () => {
    training.mockReturnValue(false)
    const data={username:'synthetic-user',password:'synthetic-password'}
    authApi.login(data)
    expect(post).toHaveBeenCalledExactlyOnceWith('/auth/login',data)
  })
})
