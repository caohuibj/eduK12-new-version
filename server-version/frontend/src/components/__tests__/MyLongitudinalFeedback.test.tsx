import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MyLongitudinalFeedback } from '../MyLongitudinalFeedback'
const get = vi.hoisted(() => vi.fn())
vi.mock('../../api/client', () => ({ default: { get } }))
beforeEach(() => { get.mockReset() })
describe('own multi-measurement feedback', () => {
  it('uses the own-only endpoint and clears old results when authority changes', async () => {
    get.mockResolvedValue({code:0,data:{list:[{id:'own-report',generatedAt:'2026-10-01',projection:{kind:'MY_LONGITUDINAL',waves:[{ordinal:1,evidenceLevel:'PILOT',metrics:{score:{state:'present',value:3}}}],comparisons:[],limitations:['仅描述，不诊断。']}}]}})
    render(<MyLongitudinalFeedback />)
    fireEvent.click(screen.getByRole('button', {name:'查看我的多次反馈'}))
    expect(await screen.findByText('第 1 次：3')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/my-assessments/longitudinal')
    get.mockRejectedValue(new Error('权限已变化'))
    fireEvent.click(screen.getByRole('button', {name:'查看我的多次反馈'}))
    expect(await screen.findByText('权限已变化')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('第 1 次：3')).not.toBeInTheDocument())
  })
})
