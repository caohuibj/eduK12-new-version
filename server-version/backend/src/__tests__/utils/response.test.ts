import { describe, expect, it, vi } from 'vitest'
import { assessmentSubmitBusy, completionBusy, error } from '../../utils/response'

const makeResponse = () => {
  const response: any = {}
  response.status = vi.fn(() => response)
  response.setHeader = vi.fn()
  response.json = vi.fn(() => response)
  return response
}

describe('API error response envelope', () => {
  it('includes a null data field for ordinary errors', () => {
    const response = makeResponse()

    error(response, 'bad request', -1, 400)

    expect(response.json).toHaveBeenCalledWith({ code: -1, message: 'bad request', data: null })
  })

  it('returns a retryable completion envelope with Retry-After', () => {
    const response = makeResponse()

    completionBusy(response, 1.2)

    expect(response.status).toHaveBeenCalledWith(503)
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '2')
    expect(response.json).toHaveBeenCalledWith({
      code: 'COMPLETION_BUSY',
      message: '测评完成请求繁忙，请稍后重试',
      data: null,
    })
  })

  it('returns a retryable UNIT submit envelope with ASSESSMENT_SUBMIT_BUSY', () => {
    const response = makeResponse()

    assessmentSubmitBusy(response, 1)

    expect(response.status).toHaveBeenCalledWith(503)
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '1')
    expect(response.json).toHaveBeenCalledWith({
      code: 'ASSESSMENT_SUBMIT_BUSY',
      message: '测评提交繁忙，请稍后重试',
      data: null,
    })
  })
})
