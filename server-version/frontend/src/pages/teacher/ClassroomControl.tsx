import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { useClassroomSocket } from '../../hooks/useClassroomSocket'
import { useAuth } from '../../contexts/AuthContext'
import { Play, Square, Users, QrCode, CheckCircle, Edit, Monitor } from 'lucide-react'
import { normalizeApiError } from '../../utils/normalizeApiError'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
import { useStaffFeedback } from '../../components/staff-ui/useStaffFeedback'

interface Question {
  id: string
  questionIndex: number
  questionContent: any
  timeLimit: number | null
  startedAt: string | null
  endedAt: string | null
}

interface Classroom {
  id: string
  code: string
  name: string
  status: string
  course: {
    id: string
    title: string
  }
  questions: Question[]
}

const questionFromSocket = (data: any): Question | null => {
  if (!data?.questionId) return null
  return {
    id: data.questionId,
    questionIndex: Number(data.questionIndex ?? 0),
    questionContent: data.questionContent,
    timeLimit: data.timeLimit ?? null,
    startedAt: data.startedAt ?? new Date().toISOString(),
    endedAt: data.endedAt ?? null,
  }
}

const ClassroomControl: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isLoading: authLoading, user } = useAuth()
  const { feedback, confirm, info } = useStaffFeedback()

  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [onlineCount, setOnlineCount] = useState(0)
  const [answerCount, setAnswerCount] = useState(0)
  const [stats, setStats] = useState<any>(null)
  const [closing, setClosing] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('control')
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null)
  const [statsUnknown, setStatsUnknown] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refreshStats = useCallback(async () => {
    if (!id || !currentQuestion?.id) return
    try {
      const response = await apiClient.get<{ stats?: any }>(`/classrooms/${id}/questions/${currentQuestion.id}/stats`)
      if (response.code !== 0 || !response.data?.stats) throw new Error(response.message || '统计暂不可用')
      setStats(response.data.stats)
      setAnswerCount(response.data.stats.answerCount ?? 0)
      setOnlineCount(response.data.stats.onlineCount ?? response.data.stats.totalSessions ?? 0)
      setStatsUnknown(Boolean(response.data.stats.unsupportedType))
    } catch (err) {
      setStatsUnknown(true)
      setConnectionNotice(normalizeApiError(err).message)
    }
  }, [currentQuestion?.id, id])

  // Socket 连接
  const { isConnected, connectionState, manualRetry, on, off, emit } = useClassroomSocket({
    classroomId: id!,
    role: 'teacher',
    autoConnect: !authLoading && !!user,
    onHttpFallback: refreshStats,
  })

  // 获取课堂信息
  const fetchClassroom = useCallback(async () => {
    try {
      setLoading(true)
      const response = await apiClient.get<Classroom>(`/classrooms/${id}`)
      if (response.code === 0 && response.data) {
        setClassroom(response.data)
        setCurrentQuestion(response.data.questions.find((question) => question.startedAt && !question.endedAt) || null)
      } else {
        setClassroom(null)
        setLoadError(response.message || '课堂信息缺失')
      }
    } catch (err: any) {
      setClassroom(null)
      setLoadError(err.message || '获取课堂信息失败')
    } finally {
      setLoading(false)
    }
  }, [id, navigate])

  useEffect(() => {
    void fetchClassroom()
  }, [fetchClassroom])

  // 监听 Socket 事件
  useEffect(() => {
    if (!isConnected) return

    // 教师加入成功
    on('teacher:joined', (data) => {
      if (data?.status) {
        setClassroom((previous) => previous ? { ...previous, status: data.status } : previous)
      }
      const activeQuestion = questionFromSocket(data?.currentQuestion)
      setCurrentQuestion(activeQuestion)
    })

    // 实时统计
    on('broadcast:stats', (data) => {
      setAnswerCount(data.answerCount)
      setStats(data)
      setStatsUnknown(Boolean(data.unsupportedType))
    })

    // 在线人数
    on('broadcast:online', (data) => {
      setOnlineCount(data.onlineCount)
    })

    // 题目开始
    on('broadcast:question', (data) => {
      const activeQuestion = questionFromSocket(data)
      if (activeQuestion) setCurrentQuestion(activeQuestion)
    })

    // A concurrent start may be reconciled by the server before this client
    // receives its ACK. Keep the compatibility event authoritative as well.
    on('teacher:started', (data) => {
      const activeQuestion = questionFromSocket(data)
      if (!activeQuestion) return
      setCurrentQuestion(activeQuestion)
      setClassroom((previous) => previous ? {
        ...previous,
        status: 'ACTIVE',
        questions: previous.questions.map((candidate) => candidate.id === activeQuestion.id ? activeQuestion : candidate),
      } : previous)
    })

    // 答题结束
    on('broadcast:finished', (data) => {
      setCurrentQuestion((prev) => {
        if (prev && (!data?.questionId || prev.id === data.questionId)) {
          return {
            ...prev,
            endedAt: data.endedAt || new Date().toISOString(),
          }
        }
        return prev
      })
      // 刷新课堂信息以更新题目状态
      fetchClassroom()
    })

    // 下一题
    on('broadcast:next', (data) => {
      if (!data?.expectedQuestionId || data.expectedQuestionId === currentQuestion?.id) {
        setCurrentQuestion(null)
      }
    })

    return () => {
      off('teacher:joined')
      off('broadcast:stats')
      off('broadcast:online')
      off('broadcast:question')
      off('teacher:started')
      off('broadcast:finished')
      off('broadcast:next')
    }
  }, [currentQuestion?.id, fetchClassroom, isConnected, on, off])

  // 开始答题
  const handleStartQuestion = () => {
    if (!classroom) return

    // 从已创建的题目中选择第一个未开始的题目
    const unansweredQuestion = classroom.questions.find((q) => !q.startedAt)

    if (!unansweredQuestion) {
      info('没有可用的题目', '请先添加题目，再开始课堂答题。')
      return
    }

    handleStartSpecificQuestion(unansweredQuestion)
  }

  // 开始指定题目
  const handleStartSpecificQuestion = (question: Question) => {
    if (!classroom || !isConnected) {
      return
    }

    emit('teacher:start', {
      questionId: question.id,
      timeLimit: question.timeLimit || 60,
    }, (payload) => {
      const result = payload as { ok?: boolean; started?: boolean; message?: string; question?: unknown } | undefined
      const authoritative = questionFromSocket(result?.question)
      if (authoritative) {
        setCurrentQuestion(authoritative)
        setClassroom((previous) => previous ? {
          ...previous,
          status: authoritative.startedAt && !authoritative.endedAt ? 'ACTIVE' : (result?.ok ? 'ACTIVE' : previous.status),
          questions: previous.questions.map((candidate) => candidate.id === authoritative.id ? authoritative : candidate),
        } : previous)
      }
      if (!result?.ok) {
        setConnectionNotice(result?.message || '题目开始失败，请重试')
        return
      }
      setConnectionNotice(null)
      if (result.started) {
        // 自动打开大屏窗口 only after the server has committed the start.
        const bigscreenUrl = `/bigscreen/${classroom.id}`
        window.open(bigscreenUrl, `bigscreen-${classroom.id}`, 'width=1920,height=1080,menubar=no,toolbar=no,location=no,status=no')
      }
    })
  }

  // 结束答题
  const handleEndQuestion = () => {
    if (!classroom || !currentQuestion) return

    emit('teacher:end', {
      questionId: currentQuestion.id,
    })
  }

  // 下一题
  const handleNextQuestion = () => {
    if (!classroom) return

    emit('teacher:next', { expectedQuestionId: currentQuestion?.id || null })
  }

  // 关闭课堂
  const handleCloseClassroom = () => {
    if (!classroom || closing) return
    if (!isConnected) {
      setConnectionNotice('Socket 未连接，无法关闭课堂；请重试')
      return
    }

    setClosing(true)
    // The server ACK is emitted only after the transaction succeeds.
    emit('teacher:close', {}, (payload) => {
      const result = payload as { ok?: boolean; message?: string } | undefined
      if (result?.ok) {
        navigate('/teacher/classrooms')
      } else {
        setClosing(false)
        setConnectionNotice(result?.message || '关闭课堂失败，请重试')
      }
    })
  }

  if (loading) return <ProductPage width="management"><ProductStatus kind="pending" title="正在加载课堂控制">正在读取课堂状态和实时连接信息。</ProductStatus></ProductPage>

  if (!classroom) return <ProductPage width="management"><ProductStatus kind="error" title="课堂不可用" actions={<><ProductButton onClick={() => void fetchClassroom()}>重新加载</ProductButton> <Link to="/teacher/classrooms">返回课堂列表</Link></>}>{loadError || '课堂不存在，或当前账户无法访问。'}</ProductStatus></ProductPage>

  return (
    <ProductPage width="management" className="space-y-6 classroom-control-page">
      <PageHeader
        title={classroom.name}
        description={`${classroom.course.title} · 课堂码 ${classroom.code}`}
        actions={
          <div className="staff-inline-actions">
            <Link to="/teacher/classrooms" className="staff-secondary-link">课堂列表</Link>
            <ProductButton
              variant="danger"
              onClick={handleCloseClassroom}
              disabled={classroom.status === 'ENDED' || closing}
            >
              <Square className="w-4 h-4" aria-hidden="true" />
              {closing ? '关闭中...' : '关闭课堂'}
            </ProductButton>
          </div>
        }
      />
      {feedback}

      <section className="staff-detail-header classroom-control-summary" aria-label="课堂实时状态">
        <div className="staff-detail-header__top">
          <div className="staff-detail-meta classroom-control-summary__meta">
            <span><Users className="w-4 h-4" aria-hidden="true" />在线 {onlineCount} 人</span>
            <span className={`staff-badge ${connectionState === 'CONNECTED' ? 'staff-badge--success' : 'staff-badge--warning'}`}>
              {connectionState === 'CONNECTED'
                ? '实时连接正常'
                : connectionState === 'FAILED'
                ? '连接失败'
                : connectionState === 'RECONNECTING'
                ? '正在重连'
                : '连接未就绪'}
            </span>
            {statsUnknown && <span className="staff-badge staff-badge--warning">统计暂不可用</span>}
          </div>
          {connectionState !== 'CONNECTED' && (
            <ProductButton onClick={manualRetry}>重试连接</ProductButton>
          )}
        </div>
      </section>

      {connectionNotice && (
        <ProductStatus kind="info" title="课堂连接提示" announce="polite">
          {connectionNotice}
        </ProductStatus>
      )}

      <div className="staff-toolbar classroom-control-nav">
        <div className="staff-segmented classroom-control-tabs" role="group" aria-label="课堂控制视图">
          <button type="button" aria-pressed={activeTab === 'control'} onClick={() => setActiveTab('control')}>
            答题控制
          </button>
          {classroom.status === 'PREPARING' && (
            <button type="button" aria-pressed={activeTab === 'edit'} onClick={() => setActiveTab('edit')}>
              <Edit className="w-4 h-4" aria-hidden="true" />
              编辑题目
            </button>
          )}
          <button type="button" aria-pressed={activeTab === 'history'} onClick={() => setActiveTab('history')}>
            <Monitor className="w-4 h-4" aria-hidden="true" />
            历史大屏
          </button>
          <button type="button" aria-pressed={activeTab === 'qrcode'} onClick={() => setActiveTab('qrcode')}>
            <QrCode className="w-4 h-4" aria-hidden="true" />
            二维码
          </button>
        </div>
      </div>

      {activeTab === 'edit' && (
        <section className="staff-panel staff-panel--padded">
          <ProductStatus
            kind="info"
            title="编辑课堂题目"
            actions={
              <Link to={`/teacher/classrooms/${classroom.id}/questions`} className="staff-primary-link">
                <Edit className="w-4 h-4" aria-hidden="true" />
                进入题目编辑
              </Link>
            }
          >
            在独立题目编辑页维护题型、选项与答题时限。
          </ProductStatus>
        </section>
      )}

      {activeTab === 'history' && (
        <section className="staff-panel" aria-labelledby="classroom-history-title">
          <div className="staff-panel__header">
            <div>
              <h2 id="classroom-history-title">历史大屏</h2>
              <p>重新打开已经结束题目的大屏展示。</p>
            </div>
          </div>
          <div className="staff-panel__body">
            {classroom.questions.filter(q => q.endedAt).length === 0 ? (
              <ProductStatus kind="info" title="暂无历史记录">
                结束题目后，可在这里重新打开对应的大屏。
              </ProductStatus>
            ) : (
              <div className="classroom-history-grid">
                {classroom.questions
                  .filter(q => q.endedAt)
                  .map((question) => (
                    <button
                      type="button"
                      key={question.id}
                      className="classroom-history-card"
                      onClick={() => {
                        const bigscreenUrl = `/bigscreen/${classroom.id}?history=${question.id}`
                        window.open(bigscreenUrl, `bigscreen-history-${question.id}`, 'width=1920,height=1080,menubar=no,toolbar=no,location=no,status=no')
                      }}
                    >
                      <span>
                        <strong>第 {question.questionIndex} 题</strong>
                        <small>{question.questionContent.question?.substring(0, 30)}...</small>
                      </span>
                      <Monitor className="w-5 h-5" aria-hidden="true" />
                    </button>
                  ))}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'qrcode' && (
        <section className="staff-panel staff-panel--padded">
          <ProductStatus
            kind="info"
            title={`课堂码：${classroom.code}`}
            actions={
              <ProductButton
                variant="primary"
                onClick={() => window.open(`/teacher/classrooms/${classroom.id}/qrcode`, '_blank', 'width=600,height=700')}
              >
                <QrCode className="w-4 h-4" aria-hidden="true" />
                生成二维码
              </ProductButton>
            }
          >
            生成课堂二维码后，学生可以扫码加入，也可以手动输入课堂码。
          </ProductStatus>
        </section>
      )}

      {activeTab === 'control' && (
        <div className="classroom-control-grid">
          <section className="staff-panel classroom-control-main" aria-labelledby="classroom-control-title">
            <div className="staff-panel__header">
              <div>
                <h2 id="classroom-control-title">答题控制</h2>
                <p>教师发起题目后，实时连接负责同步题目状态与提交统计。</p>
              </div>
              <span className={`staff-badge ${
                classroom.status === 'ACTIVE'
                  ? 'staff-badge--success'
                  : classroom.status === 'ENDED'
                  ? ''
                  : 'staff-badge--warning'
              }`}>
                {classroom.status === 'PREPARING' && '准备中'}
                {classroom.status === 'ACTIVE' && '答题进行中'}
                {classroom.status === 'ENDED' && '课堂已结束'}
              </span>
            </div>

            <div className="staff-panel__body classroom-control-body">
              {classroom.status === 'PREPARING' && (
                <ProductStatus kind="info" title="等待选择题目">
                  请从右侧题目列表中选择一道未开始题目发起答题。
                </ProductStatus>
              )}

              {classroom.status === 'ACTIVE' && currentQuestion && !currentQuestion.endedAt && (
                <div className="classroom-control-current">
                  <div>
                    <span className="staff-muted">当前题目</span>
                    <strong>{currentQuestion.questionContent.question || `第 ${currentQuestion.questionIndex} 题`}</strong>
                  </div>
                  <div className="staff-inline-actions">
                    <ProductButton variant="danger" onClick={handleEndQuestion}>
                      <Square className="w-4 h-4" aria-hidden="true" />
                      结束答题
                    </ProductButton>
                    <a
                      href={`/bigscreen/${classroom.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="staff-primary-link"
                    >
                      <Monitor className="w-4 h-4" aria-hidden="true" />
                      打开大屏
                    </a>
                  </div>
                </div>
              )}

              {classroom.status === 'ACTIVE' && currentQuestion && currentQuestion.endedAt && (
                <ProductStatus kind="info" title="当前题目已结束">
                  请从题目列表选择下一题。
                </ProductStatus>
              )}

              {classroom.status === 'ACTIVE' && !currentQuestion && (
                <ProductStatus kind="info" title="等待选择题目">
                  请从题目列表选择一道可用题目发起答题。
                </ProductStatus>
              )}

              {classroom.status === 'ACTIVE' && (
                <div className="classroom-control-stats" aria-label="答题统计">
                  <dl className="staff-stat-grid">
                    <div className="staff-stat"><dt>在线人数</dt><dd>{onlineCount}</dd></div>
                    <div className="staff-stat"><dt>已提交</dt><dd>{answerCount}</dd></div>
                    <div className="staff-stat"><dt>未提交</dt><dd>{onlineCount - answerCount}</dd></div>
                  </dl>
                  <div className="classroom-control-progress">
                    <div>
                      <span>提交进度</span>
                      <strong>{onlineCount > 0 ? Math.round((answerCount / onlineCount) * 100) : 0}%</strong>
                    </div>
                    <div className="classroom-control-progress__track" aria-hidden="true">
                      <div
                        className="classroom-control-progress__value"
                        style={{ width: `${onlineCount > 0 ? (answerCount / onlineCount) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="staff-panel classroom-control-questions" aria-labelledby="classroom-control-questions-title">
            <div className="staff-panel__header">
              <div>
                <h2 id="classroom-control-questions-title">题目列表</h2>
                <p>{classroom.questions.length} 道题</p>
              </div>
            </div>
            <div className="staff-panel__body">
              {classroom.questions.length === 0 ? (
                <ProductStatus kind="info" title="暂无题目">
                  请先进入题目编辑页添加课堂题目。
                </ProductStatus>
              ) : (
                <div className="classroom-control-question-list">
                  {classroom.questions.map((question, index) => (
                    <div
                      key={question.id}
                      className={`classroom-control-question ${
                        currentQuestion?.id === question.id
                          ? 'is-current'
                          : question.endedAt
                          ? 'is-complete'
                          : question.startedAt
                          ? 'is-locked'
                          : ''
                      }`}
                      onClick={async () => {
                        if (question.endedAt) {
                          const restart = await confirm({ title: '重新开始已完成题目？', body: '这会重新发起同一题目的课堂作答。服务器仍负责校验当前课堂状态。', confirmLabel: '重新开始' })
                          if (restart) handleStartSpecificQuestion(question)
                        } else if (!question.startedAt) {
                          handleStartSpecificQuestion(question)
                        }
                      }}
                    >
                      <div className="classroom-control-question__copy">
                        <div>
                          <strong>第 {index + 1} 题</strong>
                          {question.startedAt && !question.endedAt && (
                            <span className="staff-badge staff-badge--warning">进行中</span>
                          )}
                          {question.endedAt && (
                            <span className="staff-badge staff-badge--success">已完成</span>
                          )}
                        </div>
                        <p>{question.questionContent.question?.substring(0, 42)}...</p>
                      </div>
                      {!question.startedAt && <Play className="w-4 h-4" aria-hidden="true" />}
                      {question.startedAt && <CheckCircle className="w-4 h-4" aria-hidden="true" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </ProductPage>
  )
  )
}

export default ClassroomControl
