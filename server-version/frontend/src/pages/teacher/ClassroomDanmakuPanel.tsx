import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, ExternalLink, EyeOff, MessageSquare, Pause, Play, Square, Trash2 } from 'lucide-react'
import { ProductButton, ProductStatus } from '../../components/product-ui'
import { useStaffFeedback } from '../../components/staff-ui/useStaffFeedback'
import type { ClassroomDanmakuControl, ClassroomDanmakuSettings, ClassroomDanmakuSnapshot, ClassroomDanmakuStateAck } from '../../types/classroomDanmaku'
import './classroom-danmaku.css'

interface Props {
  classroomId: string
  isConnected: boolean
  on: (event: 'danmaku:state', handler: (snapshot: ClassroomDanmakuSnapshot) => void) => void
  off: (event: 'danmaku:state', handler: (snapshot: ClassroomDanmakuSnapshot) => void) => void
  emitWithAck?: <T>(event: string, data: unknown) => Promise<T>
}

const initialSettings: ClassroomDanmakuSettings = { topic: '', displayMode: 'QUESTION', reviewMode: 'realtime', speed: 'normal' }
const messagePageSize = 20
const settingsFrom = (snapshot: ClassroomDanmakuSnapshot): ClassroomDanmakuSettings => ({
  topic: snapshot.topic, displayMode: snapshot.displayMode, reviewMode: snapshot.enabled ? snapshot.reviewMode : 'realtime', speed: snapshot.speed,
})

export default function ClassroomDanmakuPanel({ classroomId, isConnected, on, off, emitWithAck }: Props) {
  const [snapshot, setSnapshot] = useState<ClassroomDanmakuSnapshot | null>(null)
  const snapshotRef = useRef<ClassroomDanmakuSnapshot | null>(null)
  const [settings, setSettings] = useState<ClassroomDanmakuSettings>(initialSettings)
  const dirty = useRef(false)
  const generation = useRef(0)
  const [synchronized, setSynchronized] = useState(false)
  const [reading, setReading] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState<'pending' | 'approved'>('approved')
  const [search, setSearch] = useState('')
  const [visibleLimit, setVisibleLimit] = useState(messagePageSize)
  const [clock, setClock] = useState(Date.now)
  const { feedback, confirm } = useStaffFeedback()
  const invalidateGeneration = useCallback(() => { ++generation.current }, [])

  const receive = useCallback((next: ClassroomDanmakuSnapshot) => {
    const previous = snapshotRef.current
    if (next.classroomId !== classroomId || (previous && (next.displayEpoch < previous.displayEpoch
      || (next.displayEpoch === previous.displayEpoch && next.revision < previous.revision)))) return
    snapshotRef.current = next
    setSnapshot(next)
    setSynchronized(true)
    setClock(Date.now())
    if (!previous) setFilter(next.reviewMode === 'review' ? 'pending' : 'approved')
    if (previous?.displayEpoch !== next.displayEpoch) {
      setSearch('')
      setVisibleLimit(messagePageSize)
    }
    if (previous?.enabled && !next.enabled) dirty.current = false
    if (!dirty.current) setSettings(settingsFrom(next))
  }, [classroomId])

  const refresh = useCallback(async (preserveProblem = false) => {
    if (!isConnected || !emitWithAck) return
    const current = generation.current
    setReading(true)
    if (!preserveProblem) setProblem(null)
    try {
      const result = await emitWithAck<ClassroomDanmakuStateAck>('danmaku:state:get', {})
      if (current !== generation.current) return
      if (!result.ok) throw new Error(result.message || '暂时无法读取弹幕状态')
      receive(result.snapshot)
    } catch (error) {
      if (current !== generation.current) return
      setSynchronized(false)
      setProblem(error instanceof Error ? error.message : '暂时无法读取弹幕状态，请重试')
    } finally {
      if (current === generation.current) setReading(false)
    }
  }, [emitWithAck, isConnected, receive])

  useEffect(() => {
    snapshotRef.current = null
    dirty.current = false
    setSnapshot(null)
    setSettings(initialSettings)
    setNotice(null)
    setFilter('approved')
    return invalidateGeneration
  }, [classroomId, invalidateGeneration])

  useEffect(() => {
    invalidateGeneration()
    setPending(null)
    setReading(false)
    setSynchronized(false)
    if (!isConnected) return
    on('danmaku:state', receive)
    void refresh()
    return () => {
      invalidateGeneration()
      off('danmaku:state', receive)
    }
  }, [invalidateGeneration, isConnected, off, on, receive, refresh])

  const activityExpiresAt = snapshot?.enabled ? snapshot.expiresAt : null
  useEffect(() => {
    if (!isConnected || !activityExpiresAt) return
    const expiresAt = Date.parse(activityExpiresAt)
    if (!Number.isFinite(expiresAt)) return
    const timer = window.setTimeout(() => void refresh(), Math.max(0, expiresAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [activityExpiresAt, isConnected, refresh])

  useEffect(() => {
    if (!snapshot?.messages.length && !snapshot?.pending?.length) return
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [snapshot])

  const changeSettings = (patch: Partial<ClassroomDanmakuSettings>) => {
    dirty.current = true
    setSettings(previous => ({ ...previous, ...patch }))
    setNotice(null)
  }

  const control = async (action: ClassroomDanmakuControl['action'], messageId?: string) => {
    const currentSnapshot = snapshotRef.current
    if (!isConnected || !emitWithAck || !synchronized || !currentSnapshot?.available || pending || reading) return
    const current = generation.current
    setPending(messageId ? `${action}:${messageId}` : action)
    setProblem(null)
    setNotice(null)
    const command: ClassroomDanmakuControl = {
      action, revision: currentSnapshot.controlRevision, sessionId: currentSnapshot.sessionId,
      ...((action === 'start' || action === 'configure') ? { settings: { ...settings, topic: settings.topic.trim() } } : {}),
      ...(messageId ? { messageId } : {}),
    }
    try {
      const result = await emitWithAck<ClassroomDanmakuStateAck>('teacher:danmaku:control', command)
      if (current !== generation.current) return
      if (!result.ok) {
        setProblem(result.message || '操作未成功，请重试')
        if (result.code === 'CONFLICT') {
          setSynchronized(false)
          void refresh(true)
        }
        return
      }
      if (action === 'start' || action === 'configure') {
        dirty.current = false
        setFilter(result.snapshot.reviewMode === 'review' ? 'pending' : 'approved')
      }
      receive(result.snapshot)
      const messages: Record<ClassroomDanmakuControl['action'], string> = {
        start: '弹幕已开启，学生现在可以发送。', configure: '弹幕设置已更新。',
        pause: '屏显已暂停；学生仍可以发送弹幕。', resume: '弹幕屏显已恢复。',
        clear: '当前弹幕已清空。', stop: '弹幕已停止，当前消息已清空。',
        approve: '弹幕已通过审核。', hide: '该条弹幕已隐藏。',
      }
      setNotice(messages[action])
    } catch (error) {
      if (current !== generation.current) return
      setSynchronized(false)
      const message = (error instanceof Error ? error.message : '操作尚未确认').replace(/[。.!！?？]+$/, '')
      setProblem(`${message}。请刷新状态后再继续。`)
    } finally {
      if (current === generation.current) setPending(null)
    }
  }

  const submitSettings = (event: FormEvent) => {
    event.preventDefault()
    if (!settings.topic.trim()) { setProblem('请填写本轮弹幕话题。'); return }
    void control(snapshot?.enabled ? 'configure' : 'start')
  }
  const locked = !isConnected || !synchronized || !snapshot?.available || !!pending || reading
  const pendingMessages = (snapshot?.pending ?? []).filter(message => Date.parse(message.expiresAt) > clock)
  const approvedMessages = (snapshot?.messages ?? []).filter(message => Date.parse(message.expiresAt) > clock)
  const messagesInTab = filter === 'pending' ? pendingMessages : approvedMessages
  const searchTerm = search.trim().toLowerCase()
  const matchingMessages = searchTerm ? messagesInTab.filter(message => message.text.toLowerCase().includes(searchTerm)) : messagesInTab
  const visibleMessages = matchingMessages.slice(0, visibleLimit)
  const selectFilter = (value: 'pending' | 'approved') => {
    setFilter(value)
    setSearch('')
    setVisibleLimit(messagePageSize)
  }
  const status = !snapshot ? '正在读取' : !synchronized ? '待刷新确认' : !snapshot.enabled ? '未开启' : snapshot.paused ? '屏显已暂停' : '进行中'

  return <section className="classroom-danmaku" aria-labelledby="classroom-danmaku-title">
    <div className="classroom-danmaku__header">
      <div><h2 id="classroom-danmaku-title">课堂弹幕</h2><p className="classroom-danmaku__intro">围绕一个话题收集想法，让学生的声音出现在同一个大屏上。</p></div>
      <a href={`/bigscreen/${classroomId}`} target="_blank" rel="noopener noreferrer" className="staff-secondary-link"><ExternalLink size={16} aria-hidden="true" />打开课堂大屏</a>
    </div>
    {feedback}
    {!isConnected && <ProductStatus kind="warning" title="实时连接未就绪" announce="polite">弹幕操作暂不可用。请使用课堂上方的“重试连接”，连接恢复后将重新读取状态。</ProductStatus>}
    {isConnected && !emitWithAck && <ProductStatus kind="warning" title="弹幕连接暂不可用">请刷新页面后重试。</ProductStatus>}
    {problem && <ProductStatus kind="error" title="弹幕操作提示" announce="assertive">{problem}</ProductStatus>}
    {notice && <ProductStatus kind="success" title={notice} announce="polite" />}
    {snapshot && !snapshot.available && <ProductStatus kind="warning" title="弹幕服务暂不可用">当前状态无法确认或课堂已结束。请刷新状态；持续不可用时联系管理员。</ProductStatus>}
    <div className="classroom-danmaku__state">
      <strong>当前状态：{status}</strong>
      {snapshot?.enabled && <><span>{snapshot.displayMode === 'QUESTION' ? '叠加题目' : '独立弹幕'}</span><span>{snapshot.reviewMode === 'review' ? '审核后展示' : '实时展示'}</span><p>话题：{snapshot.topic}</p></>}
      <ProductButton onClick={() => void refresh()} disabled={!isConnected || !emitWithAck || !!pending || reading}>{reading ? '读取中…' : '刷新状态'}</ProductButton>
    </div>
    <div className="classroom-danmaku__workspace">
    <div className="classroom-danmaku__setup">
    <form className="staff-panel staff-panel--padded classroom-danmaku__settings-panel" onSubmit={submitSettings}>
      <div className="classroom-danmaku__settings-heading"><h3>弹幕设置</h3><p className="classroom-danmaku__hint">确定本轮话题与上屏方式。</p></div>
      <fieldset disabled={locked} className="classroom-danmaku__config">
        <legend className="sr-only">弹幕设置</legend>
        <label className="staff-field classroom-danmaku__topic"><span>弹幕话题</span><textarea value={settings.topic} onChange={event => changeSettings({ topic: event.target.value })} maxLength={80} placeholder="例如：用一句话分享今天最有启发的发现" required /><span className="classroom-danmaku__hint">{settings.topic.length}/80 字</span></label>
        <fieldset><legend>大屏布局</legend><div className="classroom-danmaku__choices">
          <label className="classroom-danmaku__choice"><input type="radio" name="danmaku-display" checked={settings.displayMode === 'QUESTION'} onChange={() => changeSettings({ displayMode: 'QUESTION' })} /><span><strong>叠加题目</strong><span className="classroom-danmaku__hint">在底部专用区域展示弹幕，题目与统计仍可见。</span></span></label>
          <label className="classroom-danmaku__choice"><input type="radio" name="danmaku-display" checked={settings.displayMode === 'DANMAKU'} onChange={() => changeSettings({ displayMode: 'DANMAKU' })} /><span><strong>独立弹幕</strong><span className="classroom-danmaku__hint">大屏专注展示话题与弹幕。</span></span></label>
        </div></fieldset>
        <fieldset><legend>展示方式</legend><div className="classroom-danmaku__choices">
          <label className="classroom-danmaku__choice"><input type="radio" name="danmaku-review" checked={settings.reviewMode === 'realtime'} onChange={() => changeSettings({ reviewMode: 'realtime' })} /><span><strong>实时展示（默认）</strong><span className="classroom-danmaku__hint">发送后直接显示，教师可随时隐藏。</span></span></label>
          <label className="classroom-danmaku__choice"><input type="radio" name="danmaku-review" checked={settings.reviewMode === 'review'} onChange={() => changeSettings({ reviewMode: 'review' })} /><span><strong>审核后展示</strong><span className="classroom-danmaku__hint">教师批准后才会出现在大屏。</span></span></label>
        </div><p className="classroom-danmaku__hint">切换实时展示不会自动批准已有的待审核消息。</p></fieldset>
        <label className="staff-field"><span>滚动速度</span><select value={settings.speed} onChange={event => changeSettings({ speed: event.target.value as ClassroomDanmakuSettings['speed'] })}><option value="slow">慢速</option><option value="normal">标准</option><option value="fast">快速</option></select></label>
        <p className="classroom-danmaku__hint">消息按系统时限自动移除，仅供当前课堂互动。停止弹幕会清空本轮消息并回到题目大屏。</p>
        <div className="classroom-danmaku__actions"><ProductButton type="submit" variant="primary" disabled={locked}><MessageSquare size={16} aria-hidden="true" />{pending === 'start' || pending === 'configure' ? '确认中…' : snapshot?.enabled ? '保存弹幕设置' : '开启弹幕'}</ProductButton></div>
      </fieldset>
    </form>
    {snapshot?.enabled && <div className="classroom-danmaku__actions classroom-danmaku__live-controls" aria-label="弹幕控制">
      <ProductButton disabled={locked} onClick={() => void control(snapshot.paused ? 'resume' : 'pause')}>{snapshot.paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}{snapshot.paused ? '恢复屏显' : '暂停屏显'}</ProductButton>
      <ProductButton disabled={locked} onClick={async () => { if (await confirm({ title: '清空当前弹幕？', body: '待审核和已展示的消息都会清空，无法恢复。弹幕仍保持开启。', confirmLabel: '清空弹幕', danger: true })) void control('clear') }}><Trash2 size={16} aria-hidden="true" />清空弹幕</ProductButton>
      <ProductButton variant="danger" disabled={locked} onClick={async () => { if (await confirm({ title: '停止本轮弹幕？', body: '学生将不能继续发送，本轮消息会清空，大屏回到题目视图。', confirmLabel: '停止弹幕', danger: true })) void control('stop') }}><Square size={16} aria-hidden="true" />停止弹幕</ProductButton>
      <p className="classroom-danmaku__hint">暂停只停止屏显，学生仍可发送。</p>
    </div>}
    </div>
    <section className="staff-panel staff-panel--padded classroom-danmaku__queue" aria-labelledby="classroom-danmaku-review-title">
      <div><h3 id="classroom-danmaku-review-title">弹幕审核</h3><p className="classroom-danmaku__hint">可查找仍在有效期内的弹幕。隐藏后会从列表和大屏移除。</p></div>
      <div className="classroom-danmaku__filters" role="group" aria-label="弹幕审核筛选"><button type="button" aria-pressed={filter === 'pending'} onClick={() => selectFilter('pending')}>待审核（{pendingMessages.length}）</button><button type="button" aria-pressed={filter === 'approved'} onClick={() => selectFilter('approved')}>已通过（{approvedMessages.length}）</button></div>
      {(messagesInTab.length > messagePageSize || search) && <label className="staff-field"><span>搜索弹幕内容</span><input type="search" value={search} onChange={event => { setSearch(event.target.value); setVisibleLimit(messagePageSize) }} /></label>}
      {!visibleMessages.length ? <p className="classroom-danmaku__empty">{searchTerm ? '没有匹配的弹幕' : filter === 'pending' ? '暂无待审核弹幕' : '暂无已通过的弹幕'}</p> : <ul className="classroom-danmaku__messages">{visibleMessages.map(message => <li key={message.id} className="classroom-danmaku__message">
        <div className="classroom-danmaku__message-top"><span className={`staff-badge ${filter === 'pending' ? 'staff-badge--warning' : 'staff-badge--success'}`}>{filter === 'pending' ? '待审核' : '已通过'}</span><time className="classroom-danmaku__message-meta" dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time></div>
        <p className="classroom-danmaku__message-text">{message.text}</p><div className="classroom-danmaku__actions">
          {filter === 'pending' && <ProductButton variant="primary" disabled={locked || !snapshot?.enabled} onClick={() => void control('approve', message.id)}><Check size={16} aria-hidden="true" />{pending === `approve:${message.id}` ? '确认中…' : '批准展示'}</ProductButton>}
          <ProductButton disabled={locked || !snapshot?.enabled} onClick={() => void control('hide', message.id)}><EyeOff size={16} aria-hidden="true" />{pending === `hide:${message.id}` ? '确认中…' : '隐藏弹幕'}</ProductButton>
        </div>
      </li>)}</ul>}
      {visibleMessages.length < matchingMessages.length && <ProductButton onClick={() => setVisibleLimit(limit => limit + messagePageSize)}>显示更多弹幕</ProductButton>}
    </section>
    </div>
  </section>
}
