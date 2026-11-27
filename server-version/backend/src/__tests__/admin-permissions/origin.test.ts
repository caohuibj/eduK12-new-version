import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminAuthOrigin, adminWebAuthnConfig, isConfiguredAdminOrigin } from '../../modules/admin-permissions/security'

afterEach(() => vi.unstubAllEnvs())

describe('production management origin', () => {
  it('accepts only the configured administrator origin for the active installation', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ADMIN_AUTH_ORIGIN', 'https://admin.eduk12.top')
    vi.stubEnv('ADMIN_WEBAUTHN_ORIGIN', 'https://training.eduk12.top')
    vi.stubEnv('ADMIN_WEBAUTHN_RP_ID', 'admin.eduk12.top')
    expect(adminAuthOrigin()).toBe('https://admin.eduk12.top')
    expect(adminWebAuthnConfig()).toEqual({ origin: 'https://admin.eduk12.top', rpID: 'admin.eduk12.top' })
    expect(isConfiguredAdminOrigin('https://admin.eduk12.top')).toBe(true)
    expect(isConfiguredAdminOrigin('https://training.eduk12.top')).toBe(false)
    expect(isConfiguredAdminOrigin('https://survey.eduk12.top')).toBe(false)
    vi.stubEnv('ADMIN_WEBAUTHN_RP_ID', 'training.eduk12.top')
    expect(() => adminWebAuthnConfig()).toThrow()
  })

  it('supports the previous origin during rollback, with the previous RP', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ADMIN_AUTH_ORIGIN', 'https://training.eduk12.top')
    vi.stubEnv('ADMIN_WEBAUTHN_RP_ID', 'training.eduk12.top')
    expect(adminWebAuthnConfig()).toEqual({ origin: 'https://training.eduk12.top', rpID: 'training.eduk12.top' })
    expect(isConfiguredAdminOrigin('https://admin.eduk12.top')).toBe(false)
    vi.stubEnv('ADMIN_AUTH_ORIGIN', 'https://admin.eduk12.top.attacker.test')
    expect(() => adminAuthOrigin()).toThrow()
  })
})
