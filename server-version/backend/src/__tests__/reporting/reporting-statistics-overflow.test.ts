import { describe, expect, it } from 'vitest'
import { reportingAggregations, type7Quantile } from '../../modules/reporting/statistics'

describe('PR3 reporting statistic overflow safety', () => {
  it('fails closed when finite inputs overflow mean accumulation', () => {
    expect(() => reportingAggregations({
      values: [Number.MAX_VALUE, Number.MAX_VALUE],
      aggregations: ['MEAN'],
      distributionCellFloor: 1,
    })).toThrowError(expect.objectContaining({
      code: 'REPORT_STATISTIC_OVERFLOW',
      statusCode: 500,
    }))
  })

  it('fails closed when Type-7 interpolation overflows', () => {
    expect(() => type7Quantile([-Number.MAX_VALUE, Number.MAX_VALUE], 0.5))
      .toThrowError(expect.objectContaining({
        code: 'REPORT_STATISTIC_OVERFLOW',
        statusCode: 500,
      }))
  })

  it('fails closed when variance arithmetic overflows', () => {
    expect(() => reportingAggregations({
      values: [-Number.MAX_VALUE, Number.MAX_VALUE],
      aggregations: ['SD_POPULATION'],
      distributionCellFloor: 1,
    })).toThrowError(expect.objectContaining({
      code: 'REPORT_STATISTIC_OVERFLOW',
      statusCode: 500,
    }))
  })
})
