import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ScaleComponentReportEditor } from './ScaleComponentReportEditor'

describe('ScaleComponentReportEditor', () => {
  it('renders and edits threshold bands, guidance items, limitations, and disclaimer visually', () => {
    const onChange = vi.fn()
    render(
      <ScaleComponentReportEditor
        disabled={false}
        scoreLabels={{ total: '总分' }}
        report={{
          reportVersion: '1.0.0',
          primaryScoreKeys: ['total'],
          scoreOrder: ['total'],
          interpretations: [
            {
              scoreKey: 'total',
              headline: '总分解读',
              source: { type: 'reference_context' },
              summary: '按分档说明表现。',
              bands: [{ key: 'low', label: '偏低', interpretation: '需要更多练习。' }],
              guidance: [{ category: 'strategy', text: '每天安排固定复盘。' }],
            },
          ],
          limitations: ['仅反映本次测验。'],
          disclaimer: '不构成临床诊断。',
        }}
        onChange={onChange}
      />,
    )

    expect(screen.getByText('总分（total）')).toBeInTheDocument()
    expect(screen.getByDisplayValue('偏低')).toBeInTheDocument()
    expect(screen.getByDisplayValue('需要更多练习。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '新增分档' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    const nextReport = onChange.mock.calls[0][0]
    expect(nextReport.interpretations[0].bands).toHaveLength(2)
    expect(nextReport.interpretations[0].bands[1]).toMatchObject({ key: 'band_2', label: '新分档' })
  })
})
