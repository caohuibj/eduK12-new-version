import { afterEach, describe, expect, it, vi } from 'vitest'
import { logger } from '../../utils/logger'

describe('logger redaction', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps a sanitized nested error stack without exposing its message', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    logger.error('request failed', {
      requestId: 'request-1',
      error: new Error('database password=should-not-leak'),
      answer: '学生的秘密回答',
    })

    const output = JSON.stringify(errorSpy.mock.calls)
    expect(output).toContain('request-1')
    expect(output).toContain('[REDACTED]')
    expect(output).toContain('stack')
    expect(output).not.toContain('should-not-leak')
    expect(output).not.toContain('学生的秘密回答')
  })
  it('redacts public entry and recovery credentials from structured diagnostics', () => {
    const spy=vi.spyOn(console, 'info').mockImplementation(() => undefined)
    logger.info('anonymous lifecycle', {
      requestId:'public-delivery-test',
      token:'raw-entry-credential',
      nested:{recoveryToken:'raw-recovery-credential',authorization:'Bearer raw-auth-credential'},
    })
    const output=JSON.stringify(spy.mock.calls)
    expect(output).toContain('public-delivery-test')
    for(const raw of ['raw-entry-credential','raw-recovery-credential','raw-auth-credential']) expect(output).not.toContain(raw)
  })

})
