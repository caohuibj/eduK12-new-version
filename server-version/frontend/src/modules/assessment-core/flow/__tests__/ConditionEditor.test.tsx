import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConditionEditor } from '../ConditionEditor'
import { defaultPredicate, type FieldChoice } from '../conditions'
const fields: FieldChoice[] = [{ id: 'A:form:choice', label: '多选题', kind: 'choices', field: { source: 'ANSWER', instrumentKey: 'form', itemKey: 'choice' }, options: [{ key: 'a', label: '选项 A' }] }]
describe('Shared condition control capabilities', () => {
  it('initializes a multiple choice with INCLUDES and uses stable option identities', () => {
    const value = defaultPredicate(fields)
    expect(value.op).toBe('INCLUDES')
    const change = vi.fn()
    render(<ConditionEditor value={value} fields={fields} onChange={change} />)
    fireEvent.change(screen.getByLabelText('条件运算'), { target: { value: 'IS_MISSING' } })
    expect(change).toHaveBeenCalledWith({ op: 'IS_MISSING', field: fields[0].field })
  })
  it('preserves Survey numeric operations without exposing them in Training', () => {
    const numbers: FieldChoice[] = [{ id: 'E:n', label: '数值', field: { source: 'EMBEDDED', key: 'n' }, kind: 'number', options: [] }]
    const change = vi.fn()
    render(<ConditionEditor value={defaultPredicate(numbers)} fields={numbers} onChange={change} />)
    fireEvent.change(screen.getByLabelText('条件运算'), { target: { value: 'GTE' } })
    expect(change).toHaveBeenCalledWith({ op: 'GTE', field: numbers[0].field, value: 0 })
  })
  it('does not silently replace an unavailable condition source with the first field', () => {
    const change = vi.fn()
    render(<ConditionEditor value={{ op: 'EQUALS', field: { source: 'ANSWER', instrumentKey: 'deleted', itemKey: 'old' }, value: 'old' }} fields={fields} onChange={change} />)
    expect(screen.getByLabelText('条件来源')).toHaveValue('A:deleted:old')
    expect(screen.queryByLabelText('条件比较值')).not.toBeInTheDocument()
    expect(change).not.toHaveBeenCalled()
  })
})
