import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScaleUnitReportCard from '../ScaleUnitReportCard'

describe('ScaleUnitReportCard PR6A null/zero and caveat contract', () => {
  it('keeps independent support visible in an incomplete report with no score interpretation',()=>{
    render(<ScaleUnitReportCard report={{type:'SCALE',kind:'scale',scaleId:'incomplete',scaleName:'症状自述',quality:{status:'invalid',flags:['missing_items','score_not_calculable']},scores:[],references:[],interpretations:[],caveats:[],disclaimer:'独立支持说明：第9题或总分不能判断个人自伤风险，未完成作答也可求助。',completedAt:null,totalTime:null}}/>)
    expect(screen.getByTestId('scale-disclaimer')).toHaveTextContent('未完成作答也可求助')
    expect(screen.queryByText('筛查阳性')).not.toBeInTheDocument()
  })
  it('renders zero as a score, null as an em dash, and shared caveats/disclaimer', () => {
    render(<ScaleUnitReportCard report={{
      itemId: 'scale-item-1',
      type: 'SCALE',
      kind: 'scale',
      scaleId: 'scale-1',
      scaleCode: 'S-1',
      scaleName: '学习投入',
      result: {
        schemaVersion: 2,
        instrument: { scaleId: 'scale-1', code: 'S-1', name: '学习投入', instrumentVersion: '2.0.0' },
        method: {
          scaleId: 'scale-1',
          instrumentVersion: '2.0.0',
          scoringVersion: '2.0.0',
          reportVersion: '2.0.0',
          definitionHash: 'hash-1',
          referenceVersions: [],
          assessmentContext: null,
        },
        quality: { status: 'interpretable', flags: [] },
        itemScores: [],
        scores: [
          { key: 'zero', type: 'dimension', label: '零分维度', direction: 'descriptive', canonical: true, displayPrecision: 1, value: 0, range: { min: 0, max: 10 }, expectedItems: ['Q1'], answeredItems: ['Q1'], status: 'calculated', prorated: false },
          { key: 'missing', type: 'dimension', label: '缺失维度', direction: 'descriptive', canonical: false, displayPrecision: 1, value: null, range: { min: 0, max: 10 }, expectedItems: ['Q2'], answeredItems: [], status: 'not_calculable', prorated: false },
        ],
        references: [],
        interpretations: [],
        caveats: [],
        disclaimer: '不构成医学诊断。',
      },
      quality: { status: 'interpretable', flags: [] },
      scores: [],
      references: [],
      interpretations: [],
      caveats: ['量表结果只用于本次作答解读。'],
      disclaimer: '不构成医学诊断。',
      completedAt: null,
      totalTime: 0,
      method: {
        scaleId: 'scale-1',
        instrumentVersion: '2.0.0',
        scoringVersion: '2.0.0',
        reportVersion: '2.0.0',
        definitionHash: 'hash-1',
        referenceVersions: [],
        assessmentContext: null,
      },
    }} />)

    expect(screen.getAllByText('0.0').length).toBeGreaterThan(0)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.getByText('量表结果只用于本次作答解读。')).toBeTruthy()
    expect(screen.getByText('不构成医学诊断。')).toBeTruthy()
  })
})
