import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CompositeAttemptState } from '../../modules/composite/types'
import { TrainingFlowBoundary } from '../../modules/composite/TrainingFlowBoundary'
import FinalCompositeAssessment from '../FinalCompositeAssessment'
import WholeCompositeQuestionnaire from '../WholeCompositeQuestionnaire'
const state: CompositeAttemptState = {
  id: 'attempt-flow', assessmentId: 'flow', name: '条件课程问卷', instruction: null,
  status: 'IN_PROGRESS', progress: 0, completedItems: 0, totalItems: 1, currentIndex: 0,
  startedAt: '2026-10-18T00:00:00Z', lastSavedAt: '2026-10-18T00:00:00Z', completedAt: null, anonymousCode: null,
  items: [{ id: 'cog', type: 'COGNITIVE', label: '已达任务', position: 0, index: 0, completed: false }],
  currentItem: { id: 'cog', type: 'COGNITIVE', position: 0, required: true },
  deliveryMode: 'FINAL_ONLY', trainingFlow: { materials: [{ blockKey: 'm1', kind: 'MATERIAL', title: '前置材料', body: '请了解本次任务。' }], termination: 'PENDING', currentInstrumentKey: 'item_cog', pathHash: 'server-path-1' },
}
describe('Training server flow presentation', () => {
  it('shows reached materials before the current unit, without submitting or proving attention', async () => {
    const props = { submitFormSection: vi.fn(), submitScale: vi.fn(), onReload: vi.fn(), onExit: vi.fn(), onCompleted: vi.fn(), onEnterCognitive: vi.fn(), onEnterSituational: vi.fn() }
    render(<FinalCompositeAssessment state={state} {...props} />)
    expect(screen.getByRole('heading', { name: '前置材料' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '开始/继续认知任务' })).not.toBeInTheDocument()
    expect(screen.getByText(/不会记录阅读证明/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    expect(await screen.findByRole('button', { name: '开始/继续认知任务' })).toBeInTheDocument()
    expect(props.submitFormSection).not.toHaveBeenCalled()
    expect(props.submitScale).not.toHaveBeenCalled()
    expect(props.onReload).not.toHaveBeenCalled()
  })
  it('keeps earlier display acknowledgements across server path updates and displays newly reached materials', () => {
    const props = { onExit: vi.fn(), onCompleted: vi.fn(), children: <p>唯一当前工具</p> }
    const view = render(<TrainingFlowBoundary state={state} {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '继续' }))
    expect(screen.getByText('唯一当前工具')).toBeInTheDocument()
    view.rerender(<TrainingFlowBoundary state={{ ...state, trainingFlow: { ...state.trainingFlow!, pathHash: 'server-path-2', materials: [...state.trainingFlow!.materials, { blockKey: 'm2', kind: 'MATERIAL', body: '后置材料' }] } }} {...props} />)
    expect(screen.getByText('后置材料')).toBeInTheDocument()
    expect(screen.queryByText('请了解本次任务。')).not.toBeInTheDocument()
    expect(screen.queryByText('唯一当前工具')).not.toBeInTheDocument()
  })
  it.each(['SCREEN_OUT', 'COMPLETE_EARLY', 'COMPLETE'] as const)('does not equate %s with task satisfaction or run a next tool', termination => {
    render(<TrainingFlowBoundary state={{ ...state, status: 'COMPLETED', taskSatisfaction: 'NOT_SATISFIED', taskSatisfied: false, currentItem: null, trainingFlow: { ...state.trainingFlow!, materials: [], termination, currentInstrumentKey: null } }} onExit={vi.fn()} onCompleted={vi.fn()}><p>不可执行的下一工具</p></TrainingFlowBoundary>)
    expect(screen.getByRole('heading', { name: '交卷已结束' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('任务未达成')
    expect(screen.queryByText('不可执行的下一工具')).not.toBeInTheDocument()
  })
  it('does not infer satisfaction when terminal state has no server result', () => {
    render(<TrainingFlowBoundary state={{ ...state, taskSatisfaction: 'PENDING', taskSatisfied: false, trainingFlow: { ...state.trainingFlow!, materials: [], termination: 'COMPLETE_EARLY', currentInstrumentKey: null } }} onExit={vi.fn()} onCompleted={vi.fn()}><p>工具</p></TrainingFlowBoundary>)
    expect(screen.getByRole('status')).toHaveTextContent('任务达成状态待确认')
  })
  it('never initializes, restores, or submits whole FINAL for a flow attempt', () => {
    const api = { wholeDefinition: vi.fn(), reportStatus: vi.fn(), submitWhole: vi.fn(), wholeReceipt: vi.fn() }
    render(<WholeCompositeQuestionnaire state={state} api={api} fallback={<p>按服务端当前单元作答</p>} onExit={vi.fn()} onCompleted={vi.fn()} />)
    expect(screen.getByText('按服务端当前单元作答')).toBeInTheDocument()
    expect(api.wholeDefinition).not.toHaveBeenCalled()
    expect(api.reportStatus).not.toHaveBeenCalled()
    expect(api.wholeReceipt).not.toHaveBeenCalled()
    expect(api.submitWhole).not.toHaveBeenCalled()
  })
  it('bypasses whole-questionnaire flattening for a frozen ALL_AT_ONCE current unit', () => {
    const api = { wholeDefinition: vi.fn(), reportStatus: vi.fn(), submitWhole: vi.fn(), wholeReceipt: vi.fn() }
    render(<WholeCompositeQuestionnaire state={{ ...state, trainingFlow: undefined, currentItem: { id: 'scale', type: 'SCALE', position: 0, required: true, presentationMode: 'ALL_AT_ONCE' } }} api={api} fallback={<p>按冻结模式呈现整页</p>} onExit={vi.fn()} onCompleted={vi.fn()} />)
    expect(screen.getByText('按冻结模式呈现整页')).toBeInTheDocument()
    expect(api.wholeDefinition).not.toHaveBeenCalled()
    expect(api.submitWhole).not.toHaveBeenCalled()
  })

})
