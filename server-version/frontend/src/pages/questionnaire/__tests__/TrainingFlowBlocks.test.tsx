import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TrainingFlowBlocks } from '../TrainingFlowBlocks'
import { createTrainingFlow, enableTrainingMaterials, parseTrainingFlow, type TrainingFlowAuthoringUnit } from '../trainingFlow'
const units: TrainingFlowAuthoringUnit[] = [
  { id: 'first', type: 'FORM_SECTION', label: '前置表单', items: [{ formDefinition: { itemKey: 'q', type: 'SINGLE', prompt: '愿意参加？', required: true, options: [{ optionKey: 'yes', label: '愿意' }, { optionKey: 'no', label: '不愿意' }], rows: [] } }] },
  { id: 'next', type: 'SCALE', label: '后续量表' },
]
function setup(disabled = false) {
  const onError = vi.fn(), onChange = vi.fn()
  function Harness() {
    const [config, setConfig] = useState(enableTrainingMaterials(createTrainingFlow(units)))
    return <><TrainingFlowBlocks config={config} units={units} disabled={disabled} onError={onError} onChange={text => {
      onChange(text); setConfig(parseTrainingFlow(text, units) as typeof config)
    }} /><output aria-label="规则">{JSON.stringify(config)}</output></>
  }
  render(<Harness />)
  return { onError, onChange }
}
describe('Training visual adapter of shared conditions', () => {
  it('exposes only previous typed choice sources and preserves material experiment parameters', () => {
    setup()
    const toggles = screen.getAllByRole('checkbox')
    expect(toggles[0]).toBeDisabled()
    fireEvent.click(toggles[1])
    expect(screen.getByRole('combobox', { name: '条件来源' })).toHaveTextContent('前置表单 / 愿意参加？')
    expect(screen.queryByRole('option', { name: '大于' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: '条件比较值' }), { target: { value: 'no' } })
    const next = JSON.parse(screen.getByLabelText('规则').textContent!)
    expect(next.blocks[1].when).toEqual({ op: 'EQUALS', field: { source: 'ANSWER', instrumentKey: 'section_first', itemKey: 'q' }, value: 'no' })
    expect(next.experiment.groups).toHaveLength(2)
    expect(next.experiment.linkedPolicy).toBe('RERANDOMIZE')
  })
  it('refuses a move that would turn a dependency into a future reference', () => {
    const { onError, onChange } = setup()
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    onChange.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '上移 后续量表' }))
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('前置'))
    expect(onChange).not.toHaveBeenCalled()
    expect(JSON.parse(screen.getByLabelText('规则').textContent!).blocks[0].instrumentKey).toBe('section_first')
  })
  it('makes frozen/busy controls inaccessible to edits', () => {
    setup(true)
    const editor = screen.getByRole('group', { name: '可视化流程编制' })
    expect(within(editor).getAllByRole('checkbox').every(el => el.matches(':disabled'))).toBe(true)
    expect(within(editor).getByRole('button', { name: '上移 后续量表' })).toBeDisabled()
  })
})
