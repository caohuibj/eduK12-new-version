import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { useClassroomSocket } from '../../hooks/useClassroomSocket'
import { useAuth } from '../../contexts/AuthContext'
import { Play, Square, ArrowRight, Users, QrCode, CheckCircle, Edit, Monitor } from 'lucide-react'
import { normalizeApiError } from '../../utils/normalizeApiError'

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
        alert(response.message || '课堂信息缺失')
        navigate('/teacher/classrooms')
      }
    } catch (err: any) {
      alert(err.message || '获取课堂信息失败')
      navigate('/teacher/classrooms')
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
      alert('没有可用的题目，请先添加题目')
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (!classroom) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部状态栏 */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* 课堂名称和信息 */}
          <div className="py-4">
            <h1 className="text-2xl font-bold text-gray-900">{classroom.name}</h1>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              <span>课堂码: {classroom.code}</span>
              <span>课程: {classroom.course.title}</span>
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                在线: {onlineCount} 人
              </span>
              {connectionState !== 'CONNECTED' && (
                <span className="flex items-center gap-2 text-amber-600">
                  {connectionState === 'FAILED' ? '连接失败' : connectionState === 'RECONNECTING' ? '正在重连' : '连接未就绪'}
                  <button type="button" onClick={manualRetry} className="underline">重试</button>
                </span>
              )}
              {statsUnknown && <span className="text-amber-600">统计暂不可用</span>}
            </div>
          </div>

          {/* Tabs */}
          <div className="border-t border-gray-200">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('control')}
                className={`${
                  activeTab === 'control'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
              >
                答题控制
              </button>
              {classroom.status === 'PREPARING' && (
                <button
                  onClick={() => setActiveTab('edit')}
                  className={`${
                    activeTab === 'edit'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2`}
                >
                  <Edit className="w-4 h-4" />
                  编辑题目
                </button>
              )}
              <button
                onClick={() => setActiveTab('history')}
                className={`${
                  activeTab === 'history'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2`}
              >
                <Monitor className="w-4 h-4" />
                历史大屏
              </button>
              <button
                onClick={() => setActiveTab('qrcode')}
                className={`${
                  activeTab === 'qrcode'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2`}
              >
                <QrCode className="w-4 h-4" />
                二维码
              </button>
              <button
                onClick={handleCloseClassroom}
                disabled={classroom.status === 'ENDED' || closing}
                className={`${
                  activeTab === 'close'
                    ? 'border-red-500 text-red-600'
                    : 'border-transparent text-red-500 hover:text-red-700 hover:border-red-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Square className="w-4 h-4" />
                {closing ? '关闭中...' : '关闭课堂'}
              </button>
            </nav>
          </div>
        </div>
      </div>

      {/* 主要内容区 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {connectionNotice && <div role="alert" className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{connectionNotice}</div>}
        {/* 编辑题目 Tab */}
        {activeTab === 'edit' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">点击下方按钮编辑题目</p>
              <Link
                to={`/teacher/classrooms/${classroom.id}/questions`}
                className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Edit className="w-5 h-5 mr-2" />
                进入题目编辑
              </Link>
            </div>
          </div>
        )}

        {/* 历史大屏 Tab */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">历史大屏</h2>
            {classroom.questions.filter(q => q.endedAt).length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                暂无历史记录
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {classroom.questions
                  .filter(q => q.endedAt)
                  .map((question) => (
                    <div
                      key={question.id}
                      className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => {
                        const bigscreenUrl = `/bigscreen/${classroom.id}?history=${question.id}`
                        window.open(bigscreenUrl, `bigscreen-history-${question.id}`, 'width=1920,height=1080,menubar=no,toolbar=no,location=no,status=no')
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900">第 {question.questionIndex} 题</div>
                          <div className="text-sm text-gray-500 mt-1">
                            {question.questionContent.question?.substring(0, 30)}...
                          </div>
                        </div>
                        <Monitor className="w-5 h-5 text-gray-400" />
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* 二维码 Tab */}
        {activeTab === 'qrcode' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">课堂二维码</h2>
            <div className="text-center py-8">
              <p className="text-gray-600 mb-2">课堂码: <span className="font-mono text-lg font-semibold">{classroom.code}</span></p>
              <p className="text-sm text-gray-500 mb-6">点击按钮生成二维码，学生扫码即可加入课堂</p>
              <button
                onClick={() => window.open(`/teacher/classrooms/${classroom.id}/qrcode`, '_blank', 'width=600,height=700')}
                className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <QrCode className="w-5 h-5 mr-2" />
                生成二维码
              </button>
            </div>
          </div>
        )}

        {/* 答题控制 Tab */}
        {activeTab === 'control' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 左侧：控制面板 */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow">
                <div className="p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">答题控制</h2>

                  {/* 当前题目状态 */}
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-500 mb-2">当前状态</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {classroom.status === 'PREPARING' && '准备中'}
                      {classroom.status === 'ACTIVE' && '答题进行中'}
                      {classroom.status === 'ENDED' && '课堂已结束'}
                    </div>
                  </div>

                  {/* 控制按钮 */}
                  <div className="flex gap-4">
                    {classroom.status === 'PREPARING' && (
                      <div className="flex-1 text-center py-8 text-gray-500">
                        请从右侧题目列表中选择题目开始答题
                      </div>
                    )}

                    {classroom.status === 'ACTIVE' && currentQuestion && !currentQuestion.endedAt && (
                      <>
                        <button
                          onClick={handleEndQuestion}
                          className="flex-1 flex items-center justify-center px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700"
                        >
                          <Square className="w-5 h-5 mr-2" />
                          结束答题
                        </button>
                        <a
                          href={`/bigscreen/${classroom.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          <Monitor className="w-5 h-5 mr-2" />
                          打开大屏
                        </a>
                      </>
                    )}

                    {classroom.status === 'ACTIVE' && currentQuestion && currentQuestion.endedAt && (
                      <div className="flex-1 text-center py-8 text-gray-500">
                        当前题目已结束，请从右侧选择下一题
                      </div>
                    )}

                    {classroom.status === 'ACTIVE' && !currentQuestion && (
                      <div className="flex-1 text-center py-8 text-gray-500">
                        请从右侧题目列表中选择题目开始答题
                      </div>
                    )}
                  </div>

                  {/* 答题统计 */}
                  {classroom.status === 'ACTIVE' && (
                    <div className="mt-6">
                      <h3 className="text-sm font-medium text-gray-700 mb-3">答题统计</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-gray-900">{onlineCount}</div>
                          <div className="text-sm text-gray-500">在线人数</div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-green-600">{answerCount}</div>
                          <div className="text-sm text-gray-500">已提交</div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-gray-400">{onlineCount - answerCount}</div>
                          <div className="text-sm text-gray-500">未提交</div>
                        </div>
                      </div>

                      {/* 提交进度条 */}
                      <div className="mt-4">
                        <div className="flex justify-between text-sm text-gray-600 mb-1">
                          <span>提交进度</span>
                          <span>{onlineCount > 0 ? Math.round((answerCount / onlineCount) * 100) : 0}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full transition-all"
                            style={{ width: `${onlineCount > 0 ? (answerCount / onlineCount) * 100 : 0}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 右侧：题目列表 */}
            <div>
              <div className="bg-white rounded-lg shadow">
                <div className="p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">题目列表</h2>

                  {classroom.questions.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm">
                      暂无题目
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {classroom.questions.map((question, index) => (
                        <div
                          key={question.id}
                          className={`p-3 rounded-lg border transition-all ${
                            currentQuestion?.id === question.id
                              ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-400 cursor-pointer'
                              : question.endedAt
                              ? 'bg-green-50 border-green-200 cursor-pointer hover:bg-green-100'
                              : question.startedAt
                              ? 'bg-yellow-50 border-yellow-200 cursor-not-allowed'
                              : 'bg-gray-50 border-gray-200 hover:bg-gray-100 cursor-pointer'
                          }`}
                          onClick={() => {
                            // 已完成的题目，询问是否重新开始
                            if (question.endedAt) {
                              if (window.confirm('该题目已完成，是否重新开始？')) {
                                // 重置题目状态
                                handleStartSpecificQuestion(question)
                              }
                            }
                            // 未开始的题目可以直接开始
                            else if (!question.startedAt) {
                              handleStartSpecificQuestion(question)
                            }
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900">
                                  第 {index + 1} 题
                                </span>
                                {question.startedAt && !question.endedAt && (
                                  <span className="px-2 py-0.5 text-xs bg-yellow-200 text-yellow-800 rounded">
                                    进行中
                                  </span>
                                )}
                                {question.endedAt && (
                                  <span className="px-2 py-0.5 text-xs bg-green-200 text-green-800 rounded">
                                    已完成
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {question.questionContent.question?.substring(0, 30)}...
                              </div>
                            </div>
                            {!question.startedAt && (
                              <Play className="w-4 h-4 text-green-600" />
                            )}
                            {question.startedAt && !question.endedAt && (
                              <CheckCircle className="w-4 h-4 text-yellow-600" />
                            )}
                            {question.endedAt && (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ClassroomControl
