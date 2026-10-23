import { describe, expect, it } from 'vitest'
import { schoolActivityNextStep, schoolClassApprovalReasons, schoolRunStatusText } from './school-activity-workflow'

describe('School existing workflow display', () => {
  it('does not equate activity openness with assessment publication or completion', () => {
    expect(schoolActivityNextStep('OPEN', ['DRAFT', 'PUBLISHED']).text).toContain('仍有测评批次未发布')
    expect(schoolActivityNextStep('OPEN', ['PUBLISHED']).text).toContain('不代表作答已完成')
    expect(schoolActivityNextStep('OPEN', []).text).toContain('不会自动创建或发布测评')
    expect(schoolActivityNextStep('CLOSED', ['PUBLISHED']).text).toContain('不代表测评批次已收尾或报告已就绪')
    expect(schoolActivityNextStep('PAUSED', ['PUBLISHED']).text).toContain('现有作答也受到限制')
  })
  it('retains preparation and governor responsibility boundaries', () => {
    expect(schoolActivityNextStep('DRAFT', []).owner).toBe('活动准备教师')
    expect(schoolActivityNextStep('SUBMITTED', []).owner).toBe('学校管理员')
    expect(schoolRunStatusText('CANCELLED')).toBe('已取消')
    expect(schoolRunStatusText('NEW_UNKNOWN_STATE')).toBe('状态待确认')
  })
  it('explains only existing class registration gates', () => {
    expect(schoolClassApprovalReasons(null)).toEqual(['请先刷新班级状态。'])
    const valid = {status:'CLOSED', rosterExpectedCount:10, eligibleCount:10, registeredCount:10, unresolvedIncidents:0}
    expect(schoolClassApprovalReasons(valid)).toEqual([])
    expect(schoolClassApprovalReasons({...valid, status:'OPEN', eligibleCount:9, registeredCount:8, unresolvedIncidents:1})).toHaveLength(4)
    expect(schoolClassApprovalReasons({...valid, registeredCount:11})).toHaveLength(1)
  })
})


it('uses the explicit own-psychologist capability to explain self publication without changing admin defaults',()=>{
  expect(schoolActivityNextStep('SUBMITTED',[],true).owner).toBe('活动心理教师')
  expect(schoolActivityNextStep('DRAFT',[],true).text).toContain('自行开放本人活动')
  expect(schoolActivityNextStep('SUBMITTED',[]).owner).toBe('学校管理员')
})
