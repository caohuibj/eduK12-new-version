import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import ModalSurface from '../components/shared-ui/ModalSurface'
import { useEditorGuard } from '../components/shared-ui/useEditorGuard'
import TrainingCourseEditorTabs from './TrainingCourseEditorTabs'
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'trainer', role: 'TEACHER' } }) }))
vi.mock('./context', () => ({ isTrainingHost: () => true }))

function Editor() {
  const [title, setTitle] = useState('原有标题')
  const guard = useEditorGuard({ open: true, value: title, onClose: vi.fn() })
  return <><ModalSurface open onClose={guard.close} className="editor"><form role="dialog" aria-label="编辑练习">
    <TrainingCourseEditorTabs courseId="c" leave={guard.leave} />
    <input aria-label="练习标题" value={title} onChange={event => setTitle(event.target.value)} />
  </form></ModalSurface>{guard.confirmation}</>
}
it('keeps tabs usable inside the dialog and protects a dirty draft before switching sections', () => {
  render(<MemoryRouter initialEntries={['/assignments?courseId=c']}><Routes>
    <Route path="/assignments" element={<Editor />} />
    <Route path="/courses/c/detail" element={<p>课程测评内容</p>} />
  </Routes></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('练习标题'), { target: { value: '未保存标题' } })
  fireEvent.click(screen.getByRole('link', { name: '测评' }))
  const dialog = screen.getByRole('dialog', { name: '放弃未保存的修改？' })
  fireEvent.click(within(dialog).getByRole('button', { name: '继续编辑' }))
  expect(screen.getByLabelText('练习标题')).toHaveValue('未保存标题')
  expect(screen.queryByText('课程测评内容')).toBeNull()
  fireEvent.click(screen.getByRole('link', { name: '测评' }))
  fireEvent.click(screen.getByRole('button', { name: '放弃修改' }))
  expect(screen.getByText('课程测评内容')).toBeInTheDocument()
})
