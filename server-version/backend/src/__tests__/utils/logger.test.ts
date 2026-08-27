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
})
