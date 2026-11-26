import React, { useState, useEffect, useRef } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useClassroomSocket } from '../../hooks/useClassroomSocket'
import { useAuth } from '../../contexts/AuthContext'
import { AlertCircle, BookOpen, CheckCircle, Clock, Radio } from 'lucide-react'
import type { ClassroomDanmakuSnapshot } from '../../types/classroomDanmaku'
import ClassroomDanmakuComposer from './ClassroomDanmakuComposer'

interface Question {
  questionId: string
  questionContent: any
  timeLimit: number | null
  questionIndex: number
  startedAt: string
}

const ClassroomAnswer: React.FC = () => {
  const { classroomId } = useParams<{ classroomId: string }>()
  const [searchParams] = useSearchParams()
  const classroomCode = searchParams.get('code') || ''
  const { isLoading: authLoading } = useAuth()

  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [answer, setAnswer] = useState<any>(null)
  const [multiAnswers, setMultiAnswers] = useState<string[]>([]) // 多选题答案
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const questionRef = useRef<Question | null>(null)
  const submittedRef = useRef(false)
  const submittingRef = useRef(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [isFinished, setIsFinished] = useState(false) // 答题是否已结束
  const [closedClassroomId, setClosedClassroomId] = useState<string | null>(null)
  const classroomClosed = !!classroomId && closedClassroomId === classroomId
  const [joinUnavailable, setJoinUnavailable] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'info' | 'error'; message: string } | null>(null)
  const [danmaku, setDanmaku] = useState<ClassroomDanmakuSnapshot | null>(null)

  // Socket 连接只使用课堂码；session 由服务端创建并绑定。
  const { isConnected, on, off, emit, emitWithAck } = useClassroomSocket({
    classroomId,
    classroomCode,
    role: 'student',
    autoConnect: !authLoading && !!classroomId && !!classroomCode && !classroomClosed && !joinUnavailable,
  })

  useEffect(() => {
    questionRef.current = null
    submittedRef.current = false
    submittingRef.current = false
    setCurrentQuestion(null)
    setAnswer(null)
    setMultiAnswers([])
    setSubmitted(false)
    setSubmitting(false)
    setCountdown(null)
    setIsFinished(false)
    setJoinUnavailable(false)
    setNotice(null)
    setDanmaku(null)
  }, [classroomId, classroomCode])

  useEffect(() => {
    if (!isConnected) {
      submittingRef.current = false
      setSubmitting(false)
      setDanmaku(null)
    }
  }, [isConnected])

  const danmakuExpiresAt = danmaku?.expiresAt
  useEffect(() => {
    if (!danmakuExpiresAt) return
    const timer = window.setTimeout(() => {
      setDanmaku(previous => previous?.expiresAt === danmakuExpiresAt ? { ...previous, enabled: false } : previous)
    }, Math.max(0, Date.parse(danmakuExpiresAt) - Date.now()))
    return () => window.clearTimeout(timer)
  }, [danmakuExpiresAt])

  // Register before connect/join can return a snapshot, including after auth
  // finishes loading. The hook creates the socket in its earlier effect.
  useEffect(() => {
    const receiveDanmaku = (snapshot: ClassroomDanmakuSnapshot) => {
      if (snapshot.classroomId !== classroomId) return
      setDanmaku(previous => {
        if (!snapshot.available) return null
        const stale = previous && (
          previous.displayEpoch > snapshot.displayEpoch ||
          (previous.displayEpoch === snapshot.displayEpoch && previous.revision > snapshot.revision)
        )
        if (stale) return previous
        return snapshot.expiresAt && Date.parse(snapshot.expiresAt) <= Date.now()
          ? { ...snapshot, enabled: false }
          : snapshot
      })
    }
    on('danmaku:state', receiveDanmaku)

    // 接收题目
    on('broadcast:question', (data: Question & { remainingTime?: number; mySubmission?: { answer: unknown } | null }) => {
      const previous = questionRef.current
      // A delayed join snapshot must not roll back a restarted question.
      if (previous && Date.parse(data.startedAt) < Date.parse(previous.startedAt)) return
      const sameRound = previous?.questionId === data.questionId && previous?.startedAt === data.startedAt
      questionRef.current = data
      setCurrentQuestion(data)
      if (!sameRound) {
        setAnswer(null)
        setMultiAnswers([])
        submittedRef.current = false
        submittingRef.current = false
        setSubmitted(false)
        setSubmitting(false)
        setNotice(null)
      }
      // Room broadcasts contain no personal answers. Only the joining student's
      // snapshot may restore a committed answer; it never clears an acknowledged one.
      if (data.mySubmission) {
        const restored = data.mySubmission.answer
        setAnswer(restored)
        setMultiAnswers(Array.isArray(restored) ? restored.map(String) : String(restored ?? '').split(',').filter(Boolean))
        submittedRef.current = true
        submittingRef.current = false
        setSubmitted(true)
        setSubmitting(false)
      }
      const remaining = data.timeLimit ? (data.remainingTime ?? Math.max(0,
        data.timeLimit - Math.floor((Date.now() - Date.parse(data.startedAt)) / 1000))) : null
      setCountdown(remaining)
      setIsFinished(remaining !== null && remaining <= 0)
    })

    // 答题结束
    on('broadcast:finished', () => {
      setCountdown(null)
      setIsFinished(true) // 标记答题已结束
    })

    // 下一题
    on('broadcast:next', () => {
      questionRef.current = null
      submittedRef.current = false
      submittingRef.current = false
      setSubmitting(false)
      setCurrentQuestion(null)
      setAnswer(null)
      setMultiAnswers([])
      setSubmitted(false)
      setCountdown(null)
      setIsFinished(false) // 重置结束状态
    })

    // 课堂关闭
    on('broadcast:closed', () => {
      setCountdown(null)
      setSubmitting(false)
      setClosedClassroomId(classroomId ?? null)
    })

    // 提交成功
    on('student:submitted', (data: { questionId: string; startedAt?: string; success: boolean }) => {
      const question = questionRef.current
      if (!question || data.questionId !== question.questionId || !data.success ||
          (data.startedAt && data.startedAt !== question.startedAt)) return
      submittedRef.current = true
      submittingRef.current = false
      setSubmitted(true)
      setSubmitting(false)
    })

    // 错误处理
    const handleError = (data: { message?: string }) => {
      submittingRef.current = false
      setSubmitting(false)
      if (data.message === '课堂不存在或当前不可加入') {
        setCountdown(null)
        setJoinUnavailable(true)
        return
      }
      setNotice({ kind: 'error', message: data.message || '发生错误' })
    }
    on('error', handleError)

    return () => {
      off('danmaku:state', receiveDanmaku)
      off('broadcast:question')
      off('broadcast:finished')
      off('broadcast:next')
      off('broadcast:closed')
      off('student:submitted')
      off('error', handleError)
    }
  }, [authLoading, classroomId, classroomCode, on, off])

  // A missing confirmation must not leave the submit button locked indefinitely.
  useEffect(() => {
    if (!submitting) return
    const timer = setTimeout(() => {
      submittingRef.current = false
      setSubmitting(false)
      setNotice({ kind: 'error', message: '尚未收到提交确认，请重试或刷新。重复提交同一答案不会新增记录。' })
    }, 15_000)
    return () => clearTimeout(timer)
  }, [submitting])

  // 倒计时
  useEffect(() => {
    if (countdown === null || countdown <= 0) return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer)
          setIsFinished(true) // 倒计时结束，标记答题已结束
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [countdown])

  // 提交答案
  const handleSubmit = () => {
    if (!currentQuestion || !isConnected || submittedRef.current || submittingRef.current) {
      return
    }

    // 检查答题是否已结束
    if (isFinished) {
      setNotice({ kind: 'error', message: '答题已结束，无法提交答案。' })
      return
    }

    // 单选题
    if (currentQuestion.questionContent.type === 'single_choice') {
      if (!answer) return
      submittingRef.current = true
      setSubmitting(true)
      emit('student:submit', {
        questionId: currentQuestion.questionId,
        startedAt: currentQuestion.startedAt,
        answer,
      })
    }
    // 多选题
    else if (currentQuestion.questionContent.type === 'multiple_choice') {
      if (multiAnswers.length === 0) return
      submittingRef.current = true
      setSubmitting(true)
      emit('student:submit', {
        questionId: currentQuestion.questionId,
        startedAt: currentQuestion.startedAt,
        answer: multiAnswers.join(','), // 用逗号分隔多个选项
      })
    }
    // 其他题型
    else {
      if (!answer) return
      submittingRef.current = true
      setSubmitting(true)
      emit('student:submit', {
        questionId: currentQuestion.questionId,
        startedAt: currentQuestion.startedAt,
        answer,
      })
    }
  }

  // 切换多选题选项
  const toggleMultiAnswer = (value: string) => {
    setMultiAnswers((prev) => {
      if (prev.includes(value)) {
        return prev.filter((v) => v !== value)
      } else {
        return [...prev, value]
      }
    })
  }

  // 渲染题目
  const renderQuestion = () => {
    if (!currentQuestion) {
      return (
        <div className="classroom-answer-empty">
          <BookOpen size={24} aria-hidden="true" />
          <strong>等待教师出题...</strong>
          <p>请保持页面打开。</p>
        </div>
      )
    }

    const { questionContent } = currentQuestion

    switch (questionContent.type) {
      case 'single_choice':
        return (
          <div className="space-y-3">
            <div className="classroom-answer__prompt">
              {questionContent.question}
            </div>
            {questionContent.options?.map((option: any) => {
              const optionValue = option.value || option.key
              const optionLabel = option.label || option.text
              
              return (
                <button
                  key={optionValue}
                  onClick={() => setAnswer(optionValue)}
                  disabled={submitted || submitting || isFinished}
                  aria-pressed={answer === optionValue}
                  className="classroom-answer-option"
                >
                  <span className="font-medium">{optionLabel}</span>
                </button>
              )
            })}
          </div>
        )

      case 'multiple_choice':
        return (
          <div className="space-y-3">
            <div className="classroom-answer__prompt">
              {questionContent.question}
            </div>
            <div className="text-sm text-gray-500 mb-3">
              可选择多个选项
            </div>
            {questionContent.options?.map((option: any) => {
              const optionValue = option.value || option.key
              const optionLabel = option.label || option.text
              
              return (
                <button
                  key={optionValue}
                  onClick={() => toggleMultiAnswer(optionValue)}
                  disabled={submitted || submitting || isFinished}
                  aria-pressed={multiAnswers.includes(optionValue)}
                  className="classroom-answer-option"
                >
                  <div className="flex items-center gap-3">
                    <div className="classroom-answer-option__marker" aria-hidden="true">
                      {multiAnswers.includes(optionValue) && (
                        <svg
                          className="w-3 h-3"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                    <span className="font-medium">{optionLabel}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )

      case 'fill_blank':
        return (
          <div className="space-y-4">
            <div className="classroom-answer__prompt">
              {questionContent.question}
            </div>
            <input
              type="text"
              value={answer || ''}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={submitted || submitting || isFinished}
              placeholder="请输入答案"
              className="classroom-answer-input"
            />
          </div>
        )

      case 'text_input':
        return (
          <div className="space-y-4">
            <div className="classroom-answer__prompt">
              {questionContent.question}
            </div>
            <textarea
              value={answer || ''}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={submitted || submitting || isFinished}
              placeholder="请输入答案"
              rows={5}
              className="classroom-answer-input"
            />
          </div>
        )

      default:
        return <div className="text-gray-500">未知题目类型</div>
    }
  }

  if (!classroomId || !classroomCode) {
    return (
      <div className="classroom-answer-state">
        <div className="classroom-answer-state__card">
          <span className="classroom-answer-state__icon"><AlertCircle aria-hidden="true" /></span>
          <h1>缺少课堂码</h1>
          <p>返回课堂入口，输入六位课堂码后重新加入。</p>
          <Link to="/student/classroom/enter" className="classroom-answer-state__link">返回课堂入口</Link>
        </div>
      </div>
    )
  }

  if (classroomClosed || joinUnavailable) {
    return (
      <div className="classroom-answer-state">
        <div className="classroom-answer-state__card">
          <span className="classroom-answer-state__icon">
            {classroomClosed ? <CheckCircle aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
          </span>
          <h1>{classroomClosed ? '课堂已结束' : '课堂暂不可加入'}</h1>
          <p>{classroomClosed ? '感谢参与课堂互动。' : '课堂不存在或当前不可加入，请返回入口确认课堂码。'}</p>
          <Link to="/student/classroom/enter" className="classroom-answer-state__link">返回课堂入口</Link>
        </div>
      </div>
    )
  }

  if (!isConnected) {
    return (
      <div className="classroom-answer-state">
        <div className="classroom-answer-state__card" role="status">
          <span className="classroom-answer-state__icon"><Radio aria-hidden="true" /></span>
          <h1>正在连接课堂</h1>
          <p>实时连接建立后，教师发布的内容会自动显示。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="classroom-answer">
      <header className="classroom-answer__status">
        <div>
          <span className="classroom-answer__context"><BookOpen size={16} aria-hidden="true" />课堂答题</span>
          <h1>{currentQuestion ? `第 ${currentQuestion.questionIndex} 题` : danmaku?.enabled ? '课堂互动' : '等待出题'}</h1>
        </div>
        {countdown !== null && (
          <div className="classroom-answer__countdown">
            <Clock size={18} aria-hidden="true" />
            <span className="sr-only">剩余时间</span>
            {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
          </div>
        )}
      </header>

      {/* 主要内容区 */}
      <div className="classroom-answer__body">
        {notice ? (
          <div
            role={notice.kind === 'error' ? 'alert' : 'status'}
            aria-live={notice.kind === 'error' ? 'assertive' : 'polite'}
            className={`classroom-answer-notice ${notice.kind === 'error' ? 'classroom-answer-notice--ended' : ''}`}
          >
            {notice.message}
          </div>
        ) : null}

        {/* 题目 */}
        {(currentQuestion || !danmaku?.enabled) && (
          <section className="classroom-answer__question">{renderQuestion()}</section>
        )}

        {/* 提交按钮 */}
        {currentQuestion && !submitted && !isFinished && (
          <button
            onClick={handleSubmit}
            disabled={submitting || (
              currentQuestion.questionContent.type === 'multiple_choice'
                ? multiAnswers.length === 0
                : !answer)
            }
            className="classroom-answer-submit"
          >
            {submitting ? '提交中…' : '提交答案'}
          </button>
        )}

        {/* 答题已结束提示 */}
        {currentQuestion && !submitted && isFinished && (
          <div className="classroom-answer-notice classroom-answer-notice--ended">
            <AlertCircle size={18} aria-hidden="true" />
            <span>答题已结束，无法提交</span>
          </div>
        )}

        {/* 已提交提示 */}
        {submitted && (
          <div className="classroom-answer-notice classroom-answer-notice--submitted">
            <CheckCircle size={18} aria-hidden="true" />
            <span>答案已提交</span>
          </div>
        )}

        {/* 等待下一题提示 */}
        {submitted && (
          <div className="classroom-answer__waiting">
            请等待教师出下一题
          </div>
        )}

        {danmaku?.enabled && danmaku.sessionId && (
          <ClassroomDanmakuComposer key={danmaku.sessionId} state={danmaku} emitWithAck={emitWithAck} />
        )}
      </div>
    </div>
  )
}

export default ClassroomAnswer
