import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { deferredAssessmentExport } from '../deferredAssessmentExport'

const props = { row: { id: 'assessment', name: '测评', kind: 'QUESTIONNAIRE', status: 'PUBLISHED', editHref: '/questionnaire-products/assessment' }, actorId: 'teacher', onClose: vi.fn() }
it('keeps the teacher list usable after a code-download failure and retries only on request', async () => {
  const submit = vi.fn()
  const Dialog = () => <button onClick={submit}>导出 CSV</button>
  const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(Dialog)
  const Deferred = deferredAssessmentExport(load)
  render(<><h1>课程测评列表</h1><Deferred {...props} /></>)
  expect(await screen.findByRole('alert')).toHaveTextContent('尚未提交导出')
  expect(screen.getByRole('heading', { name: '课程测评列表' })).toBeVisible()
  expect(screen.queryByRole('button', { name: '导出 CSV' })).toBeNull()
  expect(load).toHaveBeenCalledTimes(1)
  expect(submit).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '重试加载导出' }))
  await screen.findByRole('button', { name: '导出 CSV' })
  expect(load).toHaveBeenCalledTimes(2)
  expect(submit).not.toHaveBeenCalled()
})
it('shares a pending code download and retains successful code across reopens', async () => {
  const Dialog = ({ actorId }: { actorId: string }) => <div role="dialog">{actorId}</div>
  let release!: (value: typeof Dialog) => void
  const load = vi.fn(() => new Promise<typeof Dialog>(resolve => { release = resolve }))
  const Deferred = deferredAssessmentExport(load)
  const page = render(<><Deferred {...props} /><Deferred {...props} actorId="another-teacher" /></>)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(load).toHaveBeenCalledTimes(1)
  await act(async () => release(Dialog))
  expect(screen.getAllByRole('dialog')).toHaveLength(2)
  page.unmount()
  render(<Deferred {...props} />)
  expect(screen.getByRole('dialog')).toHaveTextContent('teacher')
  expect(load).toHaveBeenCalledTimes(1)
})
it('allows closing a failed load without sending an export', async () => {
  const load = vi.fn().mockRejectedValue(new Error('offline'))
  const Deferred = deferredAssessmentExport(load)
  const onClose = vi.fn()
  render(<Deferred {...props} onClose={onClose} />)
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: '关闭数据导出' }))
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(load).toHaveBeenCalledTimes(1)
})
