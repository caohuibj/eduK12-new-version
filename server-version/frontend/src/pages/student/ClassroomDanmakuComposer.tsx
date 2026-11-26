import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { MessageCircle, Send } from 'lucide-react'
import type { ClassroomDanmakuSendAck, ClassroomDanmakuSnapshot } from '../../types/classroomDanmaku'

interface Props {
  state: ClassroomDanmakuSnapshot
  emitWithAck: <T>(event: string, data: unknown) => Promise<T>
}

export default function ClassroomDanmakuComposer({ state, emitWithAck }: Props) {
  const inputId = useId()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [retryAt, setRetryAt] = useState(0)
  const [receipt, setReceipt] = useState<{ message: string; error: boolean } | null>(null)
  const sendingRef = useRef(false)
  const lastAttempt = useRef<{ text: string; id: string } | null>(null)
  const { maxTextLength, cooldownMs } = state.limits
  const text = draft.trim()
  const textLength = Array.from(text).length
  const tooLong = textLength > maxTextLength

  useEffect(() => {
    if (!retryAt) return
    const timer = window.setTimeout(() => setRetryAt(0), Math.max(0, retryAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [retryAt])

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!state.sessionId || !text || tooLong || sendingRef.current || retryAt > Date.now()) return

    const attempt = lastAttempt.current?.text === text
      ? lastAttempt.current
      : { text, id: crypto.randomUUID() }
    lastAttempt.current = attempt
    sendingRef.current = true
    setSending(true)
    setReceipt(null)

    try {
      const result = await emitWithAck<ClassroomDanmakuSendAck>('student:danmaku:send', {
        sessionId: state.sessionId,
        clientMessageId: attempt.id,
        text,
      })
      if (!result.ok) {
        setReceipt({ message: result.message, error: true })
        if (result.retryAfterMs) setRetryAt(Date.now() + result.retryAfterMs)
        return
      }

      lastAttempt.current = null
      setDraft('')
      setRetryAt(Date.now() + cooldownMs)
      setReceipt({
        message: result.status === 'pending' ? '已发送，等待教师审核。' : '已发送，等待大屏播放。',
        error: false,
      })
    } catch (error) {
      setReceipt({ message: error instanceof Error ? error.message : '发送失败，请重试。', error: true })
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  return (
    <form className="classroom-danmaku-compose" aria-labelledby={inputId + '-heading'} onSubmit={send}>
      <div className="classroom-danmaku-compose__heading">
        <MessageCircle size={19} aria-hidden="true" />
        <h2 id={inputId + '-heading'}>课堂弹幕</h2>
      </div>
      <p className="classroom-danmaku-compose__topic">{state.topic}</p>
      <p id={inputId + '-hint'} className="classroom-danmaku-compose__hint">
        {state.reviewMode === 'review' ? '教师审核后匿名展示。' : '内容将匿名展示在课堂大屏。'}
        {state.paused && ' 大屏已暂停，可继续发送。'}
      </p>
      <label htmlFor={inputId} className="sr-only">弹幕内容</label>
      <textarea
        id={inputId}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
          setReceipt(null)
        }}
        aria-describedby={inputId + '-hint ' + inputId + '-count'}
        aria-invalid={tooLong}
        maxLength={maxTextLength * 2}
        readOnly={sending}
        placeholder="写下你的想法…"
        rows={2}
        className="classroom-danmaku-compose__input"
      />
      <div className="classroom-danmaku-compose__actions">
        <span id={inputId + '-count'} className={tooLong ? 'classroom-danmaku-compose__error' : undefined}>
          {textLength} / {maxTextLength}{tooLong && '，内容过长'}
        </span>
        <button
          className="classroom-danmaku-compose__send"
          type="submit"
          disabled={sending || !text || tooLong || retryAt > 0}
        >
          <Send size={16} aria-hidden="true" />
          {sending ? '发送中…' : retryAt ? '稍后可发送' : '发送弹幕'}
        </button>
      </div>
      {receipt && (
        <p role={receipt.error ? 'alert' : 'status'} className={receipt.error ? 'classroom-danmaku-compose__error' : undefined}>
          {receipt.message}
        </p>
      )}
    </form>
  )
}
