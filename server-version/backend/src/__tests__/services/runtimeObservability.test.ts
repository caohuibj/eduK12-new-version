import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  measureRequestPhase,
  recordPrismaCall,
  recordPrismaError,
  recordBoundedAdmissionRejection,
  recordCompletionAdmissionRejection,
  recordSerializableAttempt,
  recordSerializationConflict,
  requestObservabilityMiddleware,
  resetRuntimeObservabilityForTests,
  runtimeMetricLines,
  setBoundedAdmissionGateState,
  setCompletionAdmissionState,
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

  it('classifies slow requests by the exclusive dominant phase', async () => {
    const response = Object.assign(new EventEmitter(), { statusCode: 200 }) as any
    const request = {
      method: 'POST',
      path: '/api/assessments/session-123/answer',
      baseUrl: '/api',
      route: { path: '/assessments/:sessionId/answer' },
    } as any
    let phaseWork: Promise<void> | undefined

    requestObservabilityMiddleware(request, response, () => {
      phaseWork = measureRequestPhase('transaction', async () => {
        await measureRequestPhase('answer_mutation', async () => {
          await new Promise((resolve) => setTimeout(resolve, 550))
        })
      })
    })
    await phaseWork
    response.emit('finish')

    const metrics = metricText()
    expect(metrics).toContain('ptool_slow_requests_total{route="/api/assessments/:sessionId/answer",threshold="500ms",dominant_phase="answer_mutation"} 1')
    expect(metrics).not.toContain('threshold="1s"')
  })

  it('records a client disconnect as HTTP 499 instead of the default 200', () => {
    const response = Object.assign(new EventEmitter(), { statusCode: 200, writableFinished: false }) as any
    const request = {
      method: 'GET',
      path: '/api/assessments/disconnected',
      baseUrl: '',
      route: undefined,
    } as any

    requestObservabilityMiddleware(request, response, () => undefined)
    response.emit('close')

    const metrics = metricText()
    expect(metrics).toContain('ptool_http_request_duration_seconds_count{method="GET",route="/api/:unmatched",status="499"} 1')
    expect(metrics).not.toContain('route="/api/:unmatched",status="200"')
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

  it('records completion admission and Serializable retry signals', () => {
    recordSerializableAttempt('questionnaire_completion', 1)
    recordSerializableAttempt('questionnaire_completion', 2)
    recordSerializationConflict('questionnaire_completion', 'P2034')
    recordCompletionAdmissionRejection('queue_full')
    setCompletionAdmissionState(2, 3)
    recordBoundedAdmissionRejection('unit_submit', 'timeout')
    setBoundedAdmissionGateState('unit_submit', 4, 5)

    const metrics = metricText()
    expect(metrics).toContain('ptool_serializable_attempts_total{operation="questionnaire_completion",attempt="1"} 1')
    expect(metrics).toContain('ptool_serializable_attempts_total{operation="questionnaire_completion",attempt="2"} 1')
    expect(metrics).toContain('ptool_serialization_conflicts_total{operation="questionnaire_completion",code="P2034"} 1')
    expect(metrics).toContain('ptool_completion_admission_rejections_total{reason="queue_full"} 1')
    expect(metrics).toContain('ptool_questionnaire_completion_admission_active 2')
    expect(metrics).toContain('ptool_questionnaire_completion_admission_queue 3')
    expect(metrics).toContain('ptool_bounded_admission_rejections_total{gate="unit_submit",reason="timeout"} 1')
    expect(metrics).toContain('ptool_bounded_admission_active{gate="unit_submit"} 4')
    expect(metrics).toContain('ptool_bounded_admission_queue{gate="unit_submit"} 5')
  })


  it('records auth_account_lookup and request_body_receive_parse phases', async () => {
    const response = Object.assign(new EventEmitter(), { statusCode: 200 }) as any
    const request = {
      method: 'POST',
      path: '/api/auth/me',
      baseUrl: '',
      route: { path: '/api/auth/me' },
    } as any
    let phaseWork: Promise<void> | undefined

    requestObservabilityMiddleware(request, response, () => {
      phaseWork = (async () => {
        await measureRequestPhase('auth_account_lookup', async () => undefined)
        await measureRequestPhase('request_body_receive_parse', async () => undefined)
      })()
    })
    await phaseWork
    response.emit('finish')

    const metrics = metricText()
    expect(metrics).toContain('phase="auth_account_lookup"')
    expect(metrics).toContain('phase="request_body_receive_parse"')
  })

})
