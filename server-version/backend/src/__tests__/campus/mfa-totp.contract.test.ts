import { describe, it, expect } from 'vitest'
import { base32TotpSecret, totpAt } from '../../modules/campus/mfa.service'

describe('Campus RFC6238 interoperability',()=>{
  it('uses RFC6238 SHA1 with 6-digit projection, compatible with standard authenticator apps',()=>{
    const key=Buffer.from('12345678901234567890','ascii')
    expect(totpAt(key,1)).toBe('287082')
    expect(totpAt(key,37037036)).toBe('081804')
  })
  it('encodes TOTP enrollment secrets in unpadded RFC4648 base32',()=>{
    expect(base32TotpSecret(Buffer.from('foo'))).toBe('MZXW6')
  })
})
