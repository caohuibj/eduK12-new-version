import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ClassroomDanmakuPanel from '../ClassroomDanmakuPanel'
import type { ClassroomDanmakuControl, ClassroomDanmakuSnapshot } from '../../../types/classroomDanmaku'

const initial = (patch: Partial<ClassroomDanmakuSnapshot> = {}): ClassroomDanmakuSnapshot => ({
  available: true, classroomId: 'classroom-1', sessionId: null, revision: 0, controlRevision: 0, displayEpoch: 1,
  enabled: false, paused: false, topic: '', displayMode: 'QUESTION', reviewMode: 'realtime', speed: 'normal',
  expiresAt: null, messages: [], pending: [],
  limits: { maxTextLength: 60, cooldownMs: 3000, maxPerMinute: 10, messageTtlMs: 30000, pendingTtlMs: 300000 },
  ...patch,
})
const message = (id = 'message-1') => ({ id, text: '<img src=x> 课堂想法', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30000).toISOString(), status: 'pending' as const })
function setup(snapshot = initial()) {
  let state = snapshot
  const handlers = new Map<string, (next: ClassroomDanmakuSnapshot) => void>()
  const on = vi.fn((event: string, handler: (next: ClassroomDanmakuSnapshot) => void) => handlers.set(event, handler))
  const off = vi.fn((event: string) => handlers.delete(event))
  const emitWithAck = vi.fn(async (event: string, data: unknown): Promise<unknown> => {
    if (event === 'danmaku:state:get') return { ok: true, snapshot: state }
    const command = data as ClassroomDanmakuControl
    state = { ...state, ...command.settings, sessionId: 'session-1', revision: state.revision + 1 }
    if (command.action === 'start') state.enabled = true
    if (command.action === 'pause') state.paused = true
    if (command.action === 'resume') state.paused = false
    if (command.action === 'approve') {
      state.messages = (state.pending ?? []).map(item => ({ ...item, status: 'approved' as const }))
      state.pending = []
    }
    if (command.action === 'hide') {
      state.messages = state.messages.filter(item => item.id !== command.messageId)
      state.pending = (state.pending ?? []).filter(item => item.id !== command.messageId)
    }
    if (command.action === 'clear' || command.action === 'stop') { state.messages = []; state.pending = [] }
    if (command.action === 'stop') { state.enabled = false; state.displayMode = 'QUESTION' }
    return { ok: true, snapshot: { ...state } }
  })
  const props = { classroomId: 'classroom-1', isConnected: true, on, off, emitWithAck: emitWithAck as <T>(event: string, data: unknown) => Promise<T> }
  const view = render(<ClassroomDanmakuPanel {...props} />)
  return { ...view, props, emitWithAck, broadcast: (next: ClassroomDanmakuSnapshot) => act(() => handlers.get('danmaku:state')?.(next)) }
}
afterEach(() => vi.useRealTimers())

it('reads authority first and defaults to realtime; starts the chosen layout and speed only after ACK', async () => {
  const test = setup()
  const start = await screen.findByRole('button', { name: '开启弹幕' })
  await waitFor(() => expect(start).toBeEnabled())
  expect(screen.getByRole('radio', { name: /实时展示（默认）/ })).toBeChecked()
  expect(screen.getByRole('textbox', { name: /弹幕话题/ })).toHaveAttribute('maxlength', '80')
  fireEvent.change(screen.getByRole('textbox', { name: /弹幕话题/ }), { target: { value: ' 本轮话题 ' } })
  fireEvent.click(screen.getByRole('radio', { name: /独立弹幕/ }))
  fireEvent.change(screen.getByRole('combobox', { name: '滚动速度' }), { target: { value: 'fast' } })
  fireEvent.click(start)
  await waitFor(() => expect(test.emitWithAck).toHaveBeenLastCalledWith('teacher:danmaku:control', {
    action: 'start', revision: 0, sessionId: null, settings: { topic: '本轮话题', displayMode: 'DANMAKU', reviewMode: 'realtime', speed: 'fast' },
  }))
  expect(await screen.findByText('弹幕已开启，学生现在可以发送。')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '打开课堂大屏' })).toHaveAttribute('href', '/bigscreen/classroom-1')
})

it('supports optional review, approval, hide and screen-only pause/resume', async () => {
  const test = setup(initial({ enabled: true, sessionId: 'session-1', topic: '讨论', reviewMode: 'review', pending: [message()] }))
  await waitFor(() => expect(screen.getByRole('button', { name: '批准展示' })).toBeEnabled())
  expect(screen.getByText('<img src=x> 课堂想法')).toBeInTheDocument()
  expect(document.querySelector('.classroom-danmaku__messages img')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '批准展示' }))
  await screen.findByText('弹幕已通过审核。')
  fireEvent.click(screen.getByRole('button', { name: '已通过（1）' }))
  fireEvent.click(screen.getByRole('button', { name: '隐藏弹幕' }))
  await screen.findByText('该条弹幕已隐藏。')
  expect(screen.queryByText('<img src=x> 课堂想法')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '暂停屏显' }))
  await screen.findByText('屏显已暂停；学生仍可以发送弹幕。')
  fireEvent.click(screen.getByRole('button', { name: '恢复屏显' }))
  await screen.findByText('弹幕屏显已恢复。')
  expect(test.emitWithAck.mock.calls.filter(([event]) => event === 'teacher:danmaku:control').map(([, command]) => (command as ClassroomDanmakuControl).action)).toEqual(['approve', 'hide', 'pause', 'resume'])
})

it('requires confirmation for clear and stop, then follows the authoritative stopped snapshot', async () => {
  const test = setup(initial({ enabled: true, topic: '讨论', sessionId: 'session-1' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '清空弹幕' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '清空弹幕' }))
  const dialog = await screen.findByRole('dialog')
  expect(test.emitWithAck).toHaveBeenCalledTimes(1)
  fireEvent.click(within(dialog).getByRole('button', { name: '清空弹幕' }))
  await screen.findByText('当前弹幕已清空。')
  fireEvent.click(screen.getByRole('button', { name: '停止弹幕' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '停止弹幕' }))
  await screen.findByText('弹幕已停止，当前消息已清空。')
  expect(screen.getByRole('button', { name: '开启弹幕' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: '暂停屏显' })).not.toBeInTheDocument()
})

it('can find and hide an older message when more than 100 are still in the moderation list', async () => {
  const messages = Array.from({ length: 125 }, (_, index) => ({
    ...message(`approved-${index}`), text: `课堂弹幕 ${index + 1}`, status: 'approved' as const,
  }))
  const test = setup(initial({ enabled: true, sessionId: 'session-1', messages }))
  const search = await screen.findByRole('searchbox', { name: '搜索弹幕内容' })
  expect(screen.getAllByRole('button', { name: '隐藏弹幕' })).toHaveLength(20)
  fireEvent.change(search, { target: { value: '课堂弹幕 25' } })
  expect(screen.getByText('课堂弹幕 25')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '隐藏弹幕' }))
  await screen.findByText('该条弹幕已隐藏。')
  expect(test.emitWithAck).toHaveBeenLastCalledWith('teacher:danmaku:control', expect.objectContaining({ action: 'hide', messageId: 'approved-24' }))
  expect(screen.getByText('没有匹配的弹幕')).toBeInTheDocument()
  fireEvent.change(search, { target: { value: '' } })
  expect(screen.getByRole('button', { name: '已通过（124）' })).toBeInTheDocument()
})

it('does not turn timeout into success or resend a mutation; refresh is required', async () => {
  const test = setup(initial({ enabled: true, sessionId: 'session-1', topic: '讨论' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '暂停屏显' })).toBeEnabled())
  test.emitWithAck.mockRejectedValueOnce(new Error('操作回执超时'))
  fireEvent.click(screen.getByRole('button', { name: '暂停屏显' }))
  await screen.findByText('操作回执超时。请刷新状态后再继续。')
  expect(screen.getByRole('button', { name: '暂停屏显' })).toBeDisabled()
  expect(test.emitWithAck).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: '刷新状态' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '暂停屏显' })).toBeEnabled())
})

it('refreshes conflicts without replaying controls and ignores snapshots from an older display epoch', async () => {
  const test = setup(initial({ enabled: true, sessionId: 'session-1', topic: '新话题', displayEpoch: 10, revision: 3, controlRevision: 2 }))
  await waitFor(() => expect(screen.getByRole('button', { name: '暂停屏显' })).toBeEnabled())
  test.emitWithAck.mockResolvedValueOnce({ ok: false, code: 'CONFLICT', message: '状态已变化' })
  fireEvent.click(screen.getByRole('button', { name: '暂停屏显' }))
  await screen.findByText('状态已变化')
  await waitFor(() => expect(test.emitWithAck).toHaveBeenCalledTimes(3))
  expect(test.emitWithAck).toHaveBeenNthCalledWith(2, 'teacher:danmaku:control', { action: 'pause', sessionId: 'session-1', revision: 2 })
  test.broadcast(initial({ enabled: true, topic: '旧话题', displayEpoch: 9, revision: 999 }))
  expect(screen.queryByText('话题：旧话题')).not.toBeInTheDocument()
  test.broadcast(initial({ enabled: true, topic: '下一轮', displayEpoch: 11, revision: 1 }))
  expect(screen.getByText('话题：下一轮')).toBeInTheDocument()
})

it('locks disconnected actions, recovers on reconnect and removes expired messages locally', async () => {
  const approved = { ...message(), status: 'approved' as const, expiresAt: new Date(Date.now() + 1500).toISOString() }
  const test = setup(initial({ enabled: true, sessionId: 'session-1', messages: [approved] }))
  await waitFor(() => expect(screen.getByRole('button', { name: '隐藏弹幕' })).toBeEnabled())
  test.rerender(<ClassroomDanmakuPanel {...test.props} isConnected={false} />)
  expect(screen.getByRole('button', { name: '隐藏弹幕' })).toBeDisabled()
  expect(screen.getByText('实时连接未就绪')).toBeInTheDocument()
  test.rerender(<ClassroomDanmakuPanel {...test.props} />)
  await waitFor(() => expect(screen.getByRole('button', { name: '隐藏弹幕' })).toBeEnabled())
  vi.useFakeTimers()
  test.broadcast(initial({ enabled: true, sessionId: 'session-1', messages: [approved], revision: 1 }))
  act(() => vi.advanceTimersByTime(2500))
  expect(screen.queryByText('<img src=x> 课堂想法')).not.toBeInTheDocument()
  expect(screen.getByText('暂无已通过的弹幕')).toBeInTheDocument()
})

it('defaults a stopped reviewed activity to realtime while preserving review for an active activity', async () => {
  setup(initial({ enabled: true, sessionId: 'session-1', topic: '审核讨论', reviewMode: 'review' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '停止弹幕' })).toBeEnabled())
  expect(screen.getByRole('radio', { name: /审核后展示/ })).toBeChecked()
  // An unsaved active configuration must not carry review into the next round.
  fireEvent.change(screen.getByRole('combobox', { name: '滚动速度' }), { target: { value: 'fast' } })
  fireEvent.click(screen.getByRole('button', { name: '停止弹幕' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '停止弹幕' }))
  await screen.findByText('弹幕已停止，当前消息已清空。')
  expect(screen.getByRole('radio', { name: /实时展示（默认）/ })).toBeChecked()
  // Review remains an explicit choice before starting the new activity.
  fireEvent.click(screen.getByRole('radio', { name: /审核后展示/ }))
  expect(screen.getByRole('radio', { name: /审核后展示/ })).toBeChecked()
})

it('refreshes an enabled activity once at its expiry without polling', async () => {
  const test = setup(initial({ enabled: true, sessionId: 'session-1', topic: '即将到期', reviewMode: 'review' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '停止弹幕' })).toBeEnabled())
  vi.useFakeTimers()
  test.emitWithAck.mockResolvedValueOnce({ ok: true, snapshot: initial({ reviewMode: 'review', revision: 2, displayEpoch: 2 }) })
  test.broadcast(initial({ enabled: true, sessionId: 'session-1', reviewMode: 'review', expiresAt: new Date(Date.now() + 5000).toISOString(), revision: 1 }))
  act(() => vi.advanceTimersByTime(4900))
  expect(test.emitWithAck).toHaveBeenCalledTimes(1)
  await act(async () => { vi.advanceTimersByTime(100) })
  expect(test.emitWithAck).toHaveBeenLastCalledWith('danmaku:state:get', {})
  expect(test.emitWithAck).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('button', { name: '开启弹幕' })).toBeEnabled()
  expect(screen.getByRole('radio', { name: /实时展示（默认）/ })).toBeChecked()
  act(() => vi.advanceTimersByTime(60000))
  expect(test.emitWithAck).toHaveBeenCalledTimes(2)
})
