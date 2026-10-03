import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import QuestionEditor, { type Question } from '../QuestionEditor'
const initial: Question[] = [{ id: 'one', type: 'single_choice', question: '合成题', options: [{ key: 'A', text: '选项一', points: 1 }, { key: 'B', text: '选项二', points: 0 }, { key: 'C', text: '选项三', points: 0 }] }]
function Editor() { const [questions, setQuestions] = useState(initial); return <QuestionEditor questions={questions} onChange={setQuestions}/> }
describe('question editing with explicit control names', () => {
  it('supports labelled option text, scoring, removal and reordering', () => {
    render(<Editor />)
    expect(screen.getByRole('button', { name: '上移题目 1' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: '题目 1 选项 A' }), { target: { value: '更新合成选项' } })
    expect(screen.getByRole('textbox', { name: '题目 1 选项 A' })).toHaveValue('更新合成选项')
    fireEvent.change(screen.getByRole('spinbutton', { name: '题目 1 选项 A 分值' }), { target: { value: '2' } })
    expect(screen.getByRole('spinbutton', { name: '题目 1 选项 A 分值' })).toHaveValue(2)
    fireEvent.click(screen.getByRole('button', { name: '删除题目 1 选项 C' }))
    expect(screen.queryByRole('textbox', { name: '题目 1 选项 C' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '添加主观题' }))
    fireEvent.click(screen.getByRole('button', { name: '上移题目 2' }))
    expect(screen.getByRole('textbox', { name: '题目 1 内容' })).toHaveValue('新的主观题')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: '删除题目 1' }))
    expect(screen.getByRole('textbox', { name: '题目 1 内容' })).toHaveValue('合成题')
    confirm.mockRestore()
  })
})
