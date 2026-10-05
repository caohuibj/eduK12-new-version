import { describe, expect, it } from 'vitest'
import { apiErrorMessage } from '../apiErrorMessage'
describe('actionable API error classification', () => {
  it('does not mistake plain-object outages for denied permission', () => {
    expect(apiErrorMessage({status:502,message:'Request failed with status code 502'})).toContain('稍后重试')
    expect(apiErrorMessage({status:403,message:'forbidden'})).toContain('核对授权')
    expect(apiErrorMessage({status:404,message:'REPORT_NOT_FOUND'})).toContain('不存在或当前不可访问')
    expect(apiErrorMessage({message:'请先发布报告方案'})).toBe('请先发布报告方案')
  })
})
