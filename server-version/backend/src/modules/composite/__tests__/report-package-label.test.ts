import {describe,expect,it} from 'vitest'
import {resolveSituationalReportLabel} from '../report-package-label'

const uploaded = {position: 2, type: 'SITUATIONAL', situationalInstrumentKey: 'uploaded-key', situationalInstrumentVersion: '1.0.0'}

describe('composite SJT report label provenance', () => {
  it('uses the title frozen at attempt start for uploaded releases without any builtin', () => {
    expect(resolveSituationalReportLabel(uploaded, '已发布情境判断测验', undefined)).toBe('已发布情境判断测验')
  })
  it('keeps the frozen historical title even if the current builtin title differs', () => {
    expect(resolveSituationalReportLabel(uploaded, '冻结时标题', '当前目录标题')).toBe('冻结时标题')
  })
  it('preserves an explicitly frozen package slot label over instrument metadata', () => {
    expect(resolveSituationalReportLabel(uploaded, '题本标题', '内置标题', new Map([[2, '整包单元标题']]))).toBe('整包单元标题')
  })
  it('falls back to an exact builtin for an incomplete legacy attempt, never to a raw key', () => {
    expect(resolveSituationalReportLabel(uploaded, undefined, '内置测验')).toBe('内置测验')
    expect(resolveSituationalReportLabel(uploaded, undefined, undefined)).toBeNull()
  })
})
