import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { productOrigins, surveyAdminLoginUrl, surveyInvitationUrl, surveyRecruitmentUrl } from './origins'

const recruitment = 'https://survey.eduk12.top/r/public-id#entry=synthetic_token-1'
beforeEach(() => { vi.stubEnv('DEV', true); vi.stubEnv('VITE_DEV_PRODUCT', 'survey') })
afterEach(() => vi.unstubAllEnvs())

describe('explicit loopback Survey presentation links', () => {
  it.each(['http://localhost:5174', 'http://127.0.0.1:5174', 'https://localhost:5190', 'http://LOCALHOST.:5174'])(
    'preserves the current Survey origin and existing admin target at %s', origin => {
      const url = new URL(origin)
      const admin = `${url.protocol}//${url.hostname === '127.0.0.1' ? '127.0.0.1' : 'localhost'}:${url.port}`
      expect(productOrigins(origin)).toEqual({ admin, survey: url.origin })
      expect(surveyAdminLoginUrl(origin)).toBe(admin + '/admin/login?returnTo=%2Fadmin%2Fsurvey-researchers')
      for (const kind of ['claim', 'reset-password'] as const) {
        const invite = new URL(surveyInvitationUrl(kind, 'synthetic&?#/token', origin)!)
        expect(invite.origin).toBe(url.origin)
        expect(invite.pathname).toBe('/' + kind)
        expect(invite.search).toBe('')
        expect(new URLSearchParams(invite.hash.slice(1)).get('token')).toBe('synthetic&?#/token')
        expect(surveyInvitationUrl(kind, '', origin)).toBeNull()
      }
      expect(surveyRecruitmentUrl(recruitment, origin)).toBe(url.origin + '/r/public-id#entry=synthetic_token-1')
    },
  )
  it('ignores the option in production even when a caller passes development=true', () => {
    vi.stubEnv('DEV', false)
    expect(productOrigins('http://localhost:5174')).toBeNull()
    expect(productOrigins('http://localhost:5174', true)?.survey).toBe('http://survey.localhost:5174')
    expect(productOrigins('https://survey.eduk12.top')).toEqual({ admin: 'https://training.eduk12.top', survey: 'https://survey.eduk12.top' })
  })
  it.each([undefined, '', 'training', 'SURVEY', ' survey'])(
    'preserves default subdomain links for option %j', option => {
      vi.stubEnv('VITE_DEV_PRODUCT', option)
      expect(productOrigins('http://localhost:5174')?.survey).toBe('http://survey.localhost:5174')
    },
  )
  it.each(['http://survey.localhost:5174', 'http://training.localhost:5174'])(
    'does not change non-loopback alias mapping for %s', origin => {
      expect(productOrigins(origin)).toEqual({ admin: 'http://localhost:5174', survey: 'http://survey.localhost:5174' })
    },
  )
  it.each(['http://localhost.attacker.test:5174', 'http://127.0.0.1.attacker.test:5174', 'http://192.168.1.2:5174',
    'http://user@localhost:5174', 'http://localhost:5174/path', 'http://localhost:5174?next=x',
    'http://localhost:5174#token=x', 'file://localhost', 'javascript:alert(1)'])(
    'keeps origin validation fail-closed for %s', origin => {
      expect(productOrigins(origin)).toBeNull()
      expect(surveyInvitationUrl('claim', 'synthetic', origin)).toBeNull()
      expect(surveyRecruitmentUrl(recruitment, origin)).toBeNull()
    },
  )
  it.each(['http://survey.eduk12.top/r/id#entry=x', 'https://evil.test/r/id#entry=x',
    'https://user@survey.eduk12.top/r/id#entry=x', 'https://survey.eduk12.top/r/id?x=1#entry=x',
    'https://survey.eduk12.top/r/%2Fid#entry=x', 'https://survey.eduk12.top/r/id#entry=x&next=y',
    'https://survey.eduk12.top/r/id#entry=', 'https://survey.eduk12.top/r/id#entry=%3Cx%3E'])(
    'keeps recruitment validation fail-closed for %s', source => {
      expect(surveyRecruitmentUrl(source, 'http://localhost:5174')).toBeNull()
    },
  )
})
