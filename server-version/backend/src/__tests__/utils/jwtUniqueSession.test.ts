import {describe,expect,it} from 'vitest'
import {generateToken,verifyToken} from '../../utils/jwt'
import {UserRole} from '../../types'

describe('browser JWT identity for independent product logout',()=>{
 it('issues distinct signed tokens for identical login claims within the same second',()=>{
  const claims={
   userId:'synthetic-user',username:'synthetic',role:UserRole.STUDENT,
   accountDomain:'SCHOOL' as const,tokenVersion:0,
  }
  const first=generateToken(claims),second=generateToken(claims)
  expect(first).not.toBe(second)
  const a=verifyToken(first),b=verifyToken(second)
  expect(a?.jti).toMatch(/^[0-9a-f-]{36}$/)
  expect(b?.jti).not.toBe(a?.jti)
  expect(a?.accountDomain).toBe('SCHOOL')
 })
})
