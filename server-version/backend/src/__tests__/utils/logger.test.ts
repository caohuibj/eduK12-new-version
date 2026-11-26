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
  it('keeps real frames and discards the entire multiline exception header', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const err = new Error('invalid record\n    at private student answer\nother private detail')
    logger.error('request failed', err)
    const output = JSON.stringify(spy.mock.calls)
    expect(output).toContain('logger.test.ts')
    expect(output).not.toMatch(/invalid record|private student answer|other private detail/)
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

  it('redacts the new start-intent capability from nested data and textual diagnostics', () => {
    const secret = 'A'.repeat(43)
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    logger.info(`startIntent=${secret}`, {
      requestId: 'keep-this-id', nested: [{ startIntent: secret }, { start_intent: secret }],
      diagnostic: `{"start-intent":"${secret}"}`,
    })
    const output = JSON.stringify(spy.mock.calls)
    expect(output).toContain('keep-this-id')
    expect(output).toContain('[REDACTED]')
    expect(output).not.toContain(secret)
  })

})
