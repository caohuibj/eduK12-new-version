import { describe, expect, it } from 'vitest'
import type { Request } from 'express'
import {
  classifyPublicAssessmentBudget,
  extractPublicAssessmentRecoveryToken,
  extractPublicAssessmentStartToken,
} from '../../middleware/publicAssessmentRateLimit'
import { config } from '../../config'

const req = (partial: Partial<Request> & { method?: string; path?: string; baseUrl?: string }): Request => ({
  method: 'GET',
  path: '/',
  baseUrl: '',
  params: {},
  headers: {},
  ip: '203.0.113.10',
  socket: { remoteAddress: '203.0.113.10' },
  ...partial,
} as Request)

describe('publicAssessmentRateLimit helpers', () => {
  it('classifies start/submit/restart POST paths as FINAL and reads as GET', () => {
    expect(classifyPublicAssessmentBudget(req({
      method: 'POST',
      baseUrl: '/api/public',
      path: '/questionnaires/tok_abcdefghijklmnopqrstuv/start',
    }))).toBe('final')
    expect(classifyPublicAssessmentBudget(req({
      method: 'POST',
      baseUrl: '/api/public/cognitive',
      path: '/sessions/abc/submit',
    }))).toBe('final')
    expect(classifyPublicAssessmentBudget(req({
      method: 'POST',
      baseUrl: '/api/public',
      path: '/assessments/session/restart',
    }))).toBe('final')
    expect(classifyPublicAssessmentBudget(req({
      method: 'GET',
      baseUrl: '/api/public',
      path: '/assessments/session-1',
    }))).toBe('get')
    expect(classifyPublicAssessmentBudget(req({
      method: 'PATCH',
      baseUrl: '/api/public',
      path: '/assessments/session-1/answers',
    }))).toBe('get')
  })

  it('extracts start-tokens from known entry paths but ignores session UUIDs', () => {
    const token = 'abcdefghijklmnopqrstuvwx'
    expect(extractPublicAssessmentStartToken(req({
      baseUrl: '/api/public',
      path: `/questionnaires/${token}/start`,
    }))).toBe(token)
    expect(extractPublicAssessmentStartToken(req({
      baseUrl: '/api/public/composite-assessments',
      path: `/${token}`,
    }))).toBe(token)
    expect(extractPublicAssessmentStartToken(req({
      baseUrl: '/api/public/cognitive',
      path: `/assignments/${token}/start`,
    }))).toBe(token)
    expect(extractPublicAssessmentStartToken(req({
      params: { token },
      path: '/ignored',
    }))).toBe(token)
    expect(extractPublicAssessmentStartToken(req({
      baseUrl: '/api/public',
      path: '/assessments/550e8400-e29b-41d4-a716-446655440000',
    }))).toBeNull()
  })

  it('extracts recovery tokens only from valid x-recovery-token headers', () => {
    const recovery = 'recovery-token-value-1234567890'
    expect(extractPublicAssessmentRecoveryToken(req({
      headers: { 'x-recovery-token': recovery },
    }))).toBe(recovery)
    expect(extractPublicAssessmentRecoveryToken(req({
      headers: { 'x-recovery-token': 'short' },
    }))).toBeNull()
    expect(extractPublicAssessmentRecoveryToken(req({ headers: {} }))).toBeNull()
  })

  it('derives formula-based public assessment ceilings larger than the legacy 600 cap', () => {
    expect(config.publicAssessmentIpGetLimit).toBeGreaterThanOrEqual(60 * 40 * 50)
    expect(config.publicAssessmentIpFinalLimit).toBeGreaterThanOrEqual(60 * 8 * 50)
    expect(config.publicAssessmentTokenGetLimit).toBeGreaterThanOrEqual(60 * 40)
    expect(config.publicAssessmentTokenFinalLimit).toBeGreaterThanOrEqual(60 * 8)
    expect(config.publicAssessmentRecoveryGetLimit).toBeGreaterThanOrEqual(40)
    expect(config.publicAssessmentRecoveryFinalLimit).toBeGreaterThanOrEqual(8)
    expect(config.publicAssessmentWindowMs).toBe(15 * 60 * 1000)
  })
})
