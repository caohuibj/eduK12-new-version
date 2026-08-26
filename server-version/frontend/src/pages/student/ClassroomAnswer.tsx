import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useClassroomSocket } from '../../hooks/useClassroomSocket'
import { useAuth } from '../../contexts/AuthContext'
import { AlertCircle, CheckCircle, Clock } from 'lucide-react'

interface Question {
  questionId: string
  questionContent: any
  timeLimit: number | null
  questionIndex: number
}

const ClassroomAnswer: React.FC = () => {
  const { classroomId } = useParams<{ classroomId: string }>()
  const [searchParams] = useSearchParams()
  const classroomCode = searchParams.get('code') || ''
  const navigate = useNavigate()
  const { isLoading: authLoading } = useAuth()

  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [answer, setAnswer] = useState<any>(null)
  const [multiAnswers, setMultiAnswers] = useState<string[]>([]) // 多选题答案
  const [submitted, setSubmitted] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [isFinished, setIsFinished] = useState(false) // 答题是否已结束

  // Socket 连接只使用课堂码；session 由服务端创建并绑定。
  const { isConnected, on, off, emit } = useClassroomSocket({
    classroomId,
    classroomCode,
    role: 'student',
    autoConnect: !authLoading && !!classroomId && !!classroomCode,
  })

  // 监听 Socket 事件
  useEffect(() => {
  
  if (!classroomId || !classroomCode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center text-gray-500">
          缺少课堂码，请返回扫码入口重新加入课堂
        </div>
      </div>
    )
  }

  if (!isConnected) {
      console.warn('Socket 未连接，无法监听事件')
      return
    }

    console.log('学生端开始监听 Socket 事件')

    // 接收题目
    on('broadcast:question', (data: Question & { remainingTime?: number }) => {
      console.log('学生端收到题目', data)
      setCurrentQuestion(data)
      setAnswer(null)
      setMultiAnswers([])
      setSubmitted(false)
      setIsFinished(false) // 重置结束状态
      setCountdown(null) // 先清除旧倒计时，避免状态残留

      // 启动倒计时（支持剩余时间）
      if (data.timeLimit) {
        // 如果有剩余时间（后加入课堂），使用剩余时间；否则使用总时间
        const initialTime = data.remainingTime !== undefined ? data.remainingTime : data.timeLimit
        setCountdown(initialTime)
      }
    })

    // 答题结束
    on('broadcast:finished', () => {
      console.log('答题结束')
      setCountdown(null)
      setIsFinished(true) // 标记答题已结束
    })

    // 下一题
    on('broadcast:next', () => {
      console.log('准备下一题')
      setCurrentQuestion(null)
      setAnswer(null)
      setMultiAnswers([])
      setSubmitted(false)
      setCountdown(null)
      setIsFinished(false) // 重置结束状态
    })

    // 课堂关闭
    on('broadcast:closed', () => {
      console.log('课堂关闭')
      alert('课堂已结束')
      navigate('/student')
    })

    // 提交成功
    on('student:submitted', () => {
      console.log('提交成功')
      setSubmitted(true)
    })

    // 错误处理
    on('error' as any, (data) => {
      console.error('Socket 错误', data)
      alert(data.message || '发生错误')
    })

    return () => {
      console.log('清理 Socket 事件监听器')
      off('student:joined')
      off('broadcast:question')
      off('broadcast:finished')
      off('broadcast:next')
      off('broadcast:closed')
      off('student:submitted')
    }
  }, [isConnected, on, off, navigate])

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
    if (!currentQuestion || !isConnected) {
      console.warn('无法提交答案：题目不存在或 socket 未连接')
      return
    }

    // 检查答题是否已结束
    if (isFinished) {
      alert('答题已结束，无法提交答案')
      return
    }

    // 单选题
    if (currentQuestion.questionContent.type === 'single_choice') {
      if (!answer) return
      emit('student:submit', {
        questionId: currentQuestion.questionId,
        answer,
      })
    }
    // 多选题
    else if (currentQuestion.questionContent.type === 'multiple_choice') {
      if (multiAnswers.length === 0) return
      emit('student:submit', {
        questionId: currentQuestion.questionId,
        answer: multiAnswers.join(','), // 用逗号分隔多个选项
      })
    }
    // 其他题型
    else {
      if (!answer) return
      emit('student:submit', {
        questionId: currentQuestion.questionId,
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
        <div className="text-center py-20">
          <div className="text-gray-400 mb-4">等待教师出题...</div>
          <div className="text-sm text-gray-300">请保持页面打开</div>
        </div>
      )
    }

    const { questionContent } = currentQuestion

    switch (questionContent.type) {
      case 'single_choice':
        return (
          <div className="space-y-3">
            <div className="text-lg font-semibold text-gray-900 mb-4">
              {questionContent.question}
            </div>
            {questionContent.options?.map((option: any, index: number) => {
              const optionValue = option.value || option.key
              const optionLabel = option.label || option.text
              
              return (
                <button
                  key={optionValue}
                  onClick={() => setAnswer(optionValue)}
                  disabled={submitted}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                    answer === optionValue
                      ? 'border-primary bg-primary/10'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  } ${submitted ? 'opacity-50 cursor-not-allowed' : ''}`}
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
            <div className="text-lg font-semibold text-gray-900 mb-4">
              {questionContent.question}
            </div>
            <div className="text-sm text-gray-500 mb-3">
              可选择多个选项
            </div>
            {questionContent.options?.map((option: any, index: number) => {
              const optionValue = option.value || option.key
              const optionLabel = option.label || option.text
              
              return (
                <button
                  key={optionValue}
                  onClick={() => toggleMultiAnswer(optionValue)}
                  disabled={submitted}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                    multiAnswers.includes(optionValue)
                      ? 'border-primary bg-primary/10'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  } ${submitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        multiAnswers.includes(optionValue)
                          ? 'border-primary bg-primary'
                          : 'border-gray-300'
                      }`}
                    >
                      {multiAnswers.includes(optionValue) && (
                        <svg
                          className="w-3 h-3 text-white"
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
            <div className="text-lg font-semibold text-gray-900 mb-4">
              {questionContent.question}
            </div>
            <input
              type="text"
              value={answer || ''}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={submitted}
              placeholder="请输入答案"
              className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-primary focus:outline-none disabled:opacity-50"
            />
          </div>
        )

      case 'text_input':
        return (
          <div className="space-y-4">
            <div className="text-lg font-semibold text-gray-900 mb-4">
              {questionContent.question}
            </div>
            <textarea
              value={answer || ''}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={submitted}
              placeholder="请输入答案"
              rows={5}
              className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-primary focus:outline-none disabled:opacity-50 resize-none"
            />
          </div>
        )

      default:
        return <div className="text-gray-500">未知题目类型</div>
    }
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-gray-500 mb-2">连接中...</div>
          <div className="text-sm text-gray-400">正在建立实时连接</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部状态栏 */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500">
              {currentQuestion ? `第 ${currentQuestion.questionIndex} 题` : '等待出题'}
            </div>
            {countdown !== null && (
              <div className="flex items-center gap-1 text-sm font-medium text-orange-600">
                <Clock className="w-4 h-4" />
                {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 主要内容区 */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* 题目 */}
        {renderQuestion()}

        {/* 提交按钮 */}
        {currentQuestion && !submitted && !isFinished && (
          <button
            onClick={handleSubmit}
            disabled={
              currentQuestion.questionContent.type === 'multiple_choice'
                ? multiAnswers.length === 0
                : !answer
            }
            className="w-full mt-6 px-4 py-4 bg-primary text-white rounded-lg font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            提交答案
          </button>
        )}

        {/* 答题已结束提示 */}
        {currentQuestion && !submitted && isFinished && (
          <div className="mt-6 p-4 bg-red-50 rounded-lg flex items-center justify-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-700 font-medium">答题已结束，无法提交</span>
          </div>
        )}

        {/* 已提交提示 */}
        {submitted && (
          <div className="mt-6 p-4 bg-green-50 rounded-lg flex items-center justify-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-green-700 font-medium">答案已提交</span>
          </div>
        )}

        {/* 等待下一题提示 */}
        {submitted && (
          <div className="mt-4 text-center text-gray-500 text-sm">
            请等待教师出下一题
          </div>
        )}
      </div>
    </div>
  )
}

export default ClassroomAnswer
