import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  measureRequestPhase,
  recordPrismaCall,
  recordPrismaError,
  requestObservabilityMiddleware,
  resetRuntimeObservabilityForTests,
  runtimeMetricLines,
} from '../../services/runtimeObservability'

const metricText = () => runtimeMetricLines().join('\n')

describe('runtime observability', () => {
  beforeEach(() => {
    resetRuntimeObservabilityForTests()
  })

  it('records request totals and named phases without retaining unmatched path values', async () => {
    const response = Object.assign(new EventEmitter(), { statusCode: 200 }) as any
    const request = {
      method: 'POST',
      path: '/api/public/assessments/short-student-value/form-answers/batch',
      baseUrl: '',
      route: undefined,
    } as any
    let phaseWork: Promise<void> | undefined

    requestObservabilityMiddleware(request, response, () => {
      phaseWork = measureRequestPhase('assessment_lookup', async () => undefined)
    })
    await phaseWork
    response.emit('finish')

    const metrics = metricText()
    expect(metrics).toContain('ptool_http_request_duration_seconds_count{method="POST",route="/api/:unmatched",status="200"} 1')
    expect(metrics).toContain('ptool_api_requests_total{method="POST",route="/api/:unmatched",status="200"} 1')
    expect(metrics).toContain('ptool_assessment_phase_duration_seconds_count{phase="assessment_lookup",route="/api/:unmatched"} 1')
    expect(metrics).not.toContain('short-student-value')
  })

  it('uses the Express route template and measures nested phases once for residual response time', async () => {
    const response = Object.assign(new EventEmitter(), { statusCode: 201 }) as any
    const request = {
      method: 'POST',
      path: '/api/public/assessments/session-123/form-answer',
      baseUrl: '/api/public',
      route: { path: '/assessments/:sessionId/form-answer' },
    } as any
    let phaseWork: Promise<void> | undefined

    requestObservabilityMiddleware(request, response, () => {
      phaseWork = measureRequestPhase('transaction', async () => {
        await measureRequestPhase('answer_mutation', async () => undefined)
      })
    })
    await phaseWork
    response.emit('finish')

    const metrics = metricText()
    expect(metrics).toContain('route="/api/public/assessments/:sessionId/form-answer"')
    expect(metrics).toContain('phase="transaction"')
    expect(metrics).toContain('phase="answer_mutation"')
    expect(metrics).toContain('phase="response"')
  })

  it('records bounded Prisma call timings and error codes without query text', () => {
    recordPrismaCall('QuestionnaireAssessment', 'findUnique', 12)
    recordPrismaCall(undefined, '$queryRaw', 30)
    recordPrismaError('P2034')
    recordPrismaError('40001')

    const metrics = metricText()
    expect(metrics).toContain('ptool_prisma_call_duration_seconds_count{model="QuestionnaireAssessment",action="findUnique"} 1')
    expect(metrics).toContain('ptool_prisma_call_duration_seconds_count{model="raw",action="$queryRaw"} 1')
    expect(metrics).toContain('ptool_prisma_errors_total{code="P2034"} 1')
    expect(metrics).toContain('ptool_prisma_errors_total{code="40001"} 1')
    expect(metrics).not.toContain('SELECT')
  })
})
