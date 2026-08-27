import React, { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { Spin, message, Progress, Card, Button, Input, Result } from 'antd'
import { CheckCircle, FileText, Layers } from 'lucide-react'
import { questionnaireResumeHeaders } from '../../utils/questionnaireResume'

type ResponseValue = string | number

interface ScaleRunnerItem {
  content: string
  itemCode: string
  type: string
  required: boolean
  sortOrder: number
  responseSetKey: string
  randomizeOptions: boolean
  options: Array<{ value: ResponseValue; label: string }>
}

interface FormOption {
  value: string
  label: string
}

interface Scale {
  id: string
  name: string
  instruction: string | null
  estimatedTime: number | null
  definition: {
    schemaVersion: 2
    respondentType: string
    display: { randomizeItems: boolean }
    items: ScaleRunnerItem[]
  }
}

// 表单题目类型
interface FormItem {
  id: string
  type: 'fill_blank' | 'single_choice' | 'multiple_choice' | 'text_input'
  label: string
  placeholder: string | null
  required: boolean
  position: number
  options: FormOption[] | string | null
}

// 内容项类型
interface ContentItem {
  type: 'form' | 'scale'
  position: number
  id: string
  label: string
  completed: boolean
}

interface QuestionnaireAssessmentData {
  questionnaireAssessment: {
    id: string
    status: string
    progress: number
    currentIndex: number
  }
  currentFormItem: FormItem | null
  currentScale: (Scale & { scaleAssessmentId: string }) | null
  contentItems: ContentItem[]
  totalItems: number
  sessionId: string
}

const ensureResponseOk = async (response: Response, fallbackMessage: string): Promise<void> => {
  if (response.ok) return

  let message = fallbackMessage
  try {
    const result = await response.json() as { message?: unknown }
    if (typeof result.message === 'string' && result.message) message = result.message
  } catch {
    // Keep the safe fallback when the server response is not JSON.
  }
  throw new Error(message)
}

const parseFormOptions = (options: FormItem['options']): FormOption[] => {
  if (Array.isArray(options)) return options
  if (typeof options !== 'string') return []

  try {
    const parsed: unknown = JSON.parse(options)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((option): option is FormOption => (
      Boolean(option)
      && typeof option === 'object'
      && typeof (option as FormOption).value === 'string'
      && typeof (option as FormOption).label === 'string'
    ))
  } catch {
    return []
  }
}

const PublicQuestionnaireAssessment: React.FC = () => {
  const { token } = useParams<{ token: string }>()
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('sessionId')
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<QuestionnaireAssessmentData | null>(null)
  // 问卷的 currentIndex 表示整体内容位置；量表内部必须使用独立索引。
  const [scaleIndex, setScaleIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, ResponseValue>>({})
  const [formAnswer, setFormAnswer] = useState<string | string[]>('')
  const [submitting, setSubmitting] = useState(false)
  
  // 记录当前题目开始显示的时间
  const itemStartTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    if (sessionId) {
      fetchAssessment()
    }
  }, [sessionId])

  // 切换题目时重置计时器
  useEffect(() => {
    itemStartTimeRef.current = Date.now()
  }, [scaleIndex])

  const fetchAssessment = async () => {
    try {
      setLoading(true)
      
      const response = await fetch(`/api/public/assessments/${sessionId}`, {
        headers: questionnaireResumeHeaders(token, sessionId),
      })
      await ensureResponseOk(response, '获取测评失败')

      const result = await response.json()
      
      if (result.data.questionnaireAssessment.status === 'COMPLETED') {
        // 已完成，跳转到结果页
        navigate(`/public/questionnaire/${token}/result?sessionId=${sessionId}`)
        return
      }

      setData(result.data)
      
      // 根据当前项类型处理
      if (result.data.currentFormItem) {
        // 当前是表单题目
        setFormAnswer('')
      } else if (result.data.currentScale?.scaleAssessmentId) {
        // 当前是量表
        fetchExistingAnswers(result.data.currentScale.scaleAssessmentId)
      }
      
    } catch (err) {
      console.error('获取测评失败', err)
      message.error('获取测评失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchExistingAnswers = async (assessmentId: string) => {
    try {
      const response = await fetch(`/api/public/assessments/${sessionId}/scale/${assessmentId}`, {
        headers: questionnaireResumeHeaders(token, sessionId),
      })
      if (response.ok) {
        const result = await response.json()
        if (result.data.answers) {
          const existingAnswers: Record<string, ResponseValue> = {}
          result.data.answers.forEach((a: any) => {
            existingAnswers[a.itemCode] = a.responseValue
          })
          setAnswers(existingAnswers)
        }
      }
    } catch (err) {
      console.error('获取已有答案失败', err)
    }
  }

  // 处理量表题目答案选择
  const handleSelectAnswer = async (value: ResponseValue) => {
    if (!data?.currentScale) return

    const items = data.currentScale.definition.items
    const item = items[scaleIndex]
    if (!item) return

    // 计算作答时间（毫秒）
    const responseTime = Date.now() - itemStartTimeRef.current

    // 更新本地状态
    setAnswers({ ...answers, [item.itemCode]: value })

    // 提交答案（包含作答时间）
    try {
      const response = await fetch(`/api/public/assessments/${sessionId}/answers`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...questionnaireResumeHeaders(token, sessionId),
        },
        body: JSON.stringify({
          scaleAssessmentId: data.currentScale.scaleAssessmentId,
          itemCode: item.itemCode,
          responseValue: value,
          responseTimeMs: responseTime,
        }),
      })
      await ensureResponseOk(response, '提交答案失败')
      
      // 如果不是最后一题，自动跳到下一题
      if (scaleIndex < items.length - 1) {
        setTimeout(() => {
          setScaleIndex((index) => index + 1)
        }, 200)
      }
    } catch (err) {
      console.error('提交答案失败', err)
      message.error('提交答案失败')
    }
  }

  const handlePrevious = () => {
    if (scaleIndex > 0) {
      setScaleIndex((index) => index - 1)
    }
  }

  const handleNext = () => {
    const items = data?.currentScale?.definition.items || []
    if (data && scaleIndex < items.length - 1) {
      setScaleIndex((index) => index + 1)
    }
  }

  // 提交表单答案并进入下一项
  const handleFormSubmit = async () => {
    if (!data?.currentFormItem) return

    const formItem = data.currentFormItem
    // 必填验证：字符串类型检查trim，数组类型检查长度
    const isEmpty = Array.isArray(formAnswer) 
      ? formAnswer.length === 0 
      : !formAnswer.trim()
    
    if (formItem.required && isEmpty) {
      message.warning('此题为必填项')
      return
    }

    try {
      setSubmitting(true)
      
      // 处理多选题答案格式：数组转JSON字符串
      const valueToSubmit: string = Array.isArray(formAnswer) 
        ? JSON.stringify(formAnswer) 
        : formAnswer
      
      // 保存表单答案
      const response = await fetch(`/api/public/assessments/${sessionId}/form-answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...questionnaireResumeHeaders(token, sessionId),
        },
        body: JSON.stringify({
          formItemId: formItem.id,
          value: valueToSubmit,
        }),
      })
      await ensureResponseOk(response, '提交失败')

      // 进入下一个内容项
      await moveToNextItem()
    } catch (err: any) {
      message.error(err.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 完成量表并进入下一项
  const handleCompleteScale = async () => {
    if (!data?.currentScale) return

    const items = data.currentScale.definition.items
    const unanswered = items.filter((item) => item.required && answers[item.itemCode] === undefined)
    if (unanswered.length > 0) {
      if (!confirm(`还有 ${unanswered.length} 道题目未作答，确定要提交吗？`)) {
        return
      }
    }

    try {
      setSubmitting(true)
      // 完成当前量表
      const response = await fetch(`/api/public/assessments/${sessionId}/scale/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...questionnaireResumeHeaders(token, sessionId),
        },
        body: JSON.stringify({
          scaleAssessmentId: data.currentScale.scaleAssessmentId,
        }),
      })
      await ensureResponseOk(response, '提交失败')

      // 进入下一个内容项
      await moveToNextItem()
    } catch (err: any) {
      message.error(err.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 移动到下一个内容项
  const moveToNextItem = async () => {
    // 重新获取测评状态
    const response = await fetch(`/api/public/assessments/${sessionId}`, {
      headers: questionnaireResumeHeaders(token, sessionId),
    })
    await ensureResponseOk(response, '获取测评失败')
    const result = await response.json()
    
    if (result.data.questionnaireAssessment.status === 'COMPLETED' ||
        result.data.questionnaireAssessment.currentIndex >= result.data.totalItems) {
      // 所有内容完成
      const completeResponse = await fetch(`/api/public/assessments/${sessionId}/complete`, {
        method: 'POST',
        headers: questionnaireResumeHeaders(token, sessionId),
      })
      await ensureResponseOk(completeResponse, '完成测评失败')
      navigate(`/public/questionnaire/${token}/result?sessionId=${sessionId}`)
    } else {
      // 切换到下一项
      setData(result.data)
      setScaleIndex(0)
      setAnswers({})
      setFormAnswer('')
      
      if (result.data.currentFormItem) {
        // 下一项是表单题目
        setFormAnswer('')
      } else if (result.data.currentScale?.scaleAssessmentId) {
        // 下一项是量表
        fetchExistingAnswers(result.data.currentScale.scaleAssessmentId)
      }
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Spin size="large" tip="正在加载测评..." />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Result
          status="error"
          title="测评不存在"
          subTitle="该测评已失效或已过期"
        />
      </div>
    )
  }

  // 渲染表单题目
  if (data.currentFormItem) {
    const formItem = data.currentFormItem
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          {/* 整体进度 */}
          <Card className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-600">
                进度：{data.questionnaireAssessment.currentIndex + 1} / {data.totalItems}
              </span>
              <span className="flex items-center gap-1 text-gray-600">
                <FileText className="w-4 h-4" />
                表单题目
              </span>
            </div>
            <Progress 
              percent={((data.questionnaireAssessment.currentIndex + 1) / data.totalItems) * 100}
              showInfo={false}
            />
          </Card>

          {/* 表单内容 */}
          <Card className="shadow-lg mb-4">
            <h3 className="text-xl font-medium mb-6">
              {formItem.label}
              <span className="ml-2 text-sm font-normal">
                {formItem.required ? (
                  <span className="text-red-500">【必答】</span>
                ) : (
                  <span className="text-gray-400">【选答】</span>
                )}
              </span>
              <span className="ml-2 text-sm font-normal text-gray-500">
                【{formItem.type === 'fill_blank' ? '填空' : 
                    formItem.type === 'single_choice' ? '单选' : 
                    formItem.type === 'multiple_choice' ? '多选' : 
                    formItem.type === 'text_input' ? '长文本' : '未知'}】
              </span>
            </h3>

            {formItem.type === 'fill_blank' && (
              <Input
                value={formAnswer}
                onChange={(e) => setFormAnswer(e.target.value)}
                placeholder={formItem.placeholder || '请输入'}
                size="large"
              />
            )}

            {formItem.type === 'text_input' && (
              <Input.TextArea
                value={formAnswer}
                onChange={(e) => setFormAnswer(e.target.value)}
                placeholder={formItem.placeholder || '请输入'}
                rows={5}
                size="large"
              />
            )}

            {formItem.type === 'single_choice' && (
              <div className="space-y-3">
                {(() => {
                  // 解析 options（兼容字符串和数组）
                  const options = parseFormOptions(formItem.options)
                  
                  return options.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setFormAnswer(option.value)}
                      className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                        formAnswer === option.value
                          ? 'border-blue-500 bg-blue-50 text-blue-600'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))
                })()}
              </div>
            )}

            {formItem.type === 'multiple_choice' && (
              <div className="space-y-3">
                {(() => {
                  // 解析 options（兼容字符串和数组）
                  const options = parseFormOptions(formItem.options)
                  
                  return options.map((option) => {
                    const currentAnswers = Array.isArray(formAnswer) ? formAnswer : []
                    const isSelected = currentAnswers.includes(option.value)
                    
                    return (
                      <button
                        key={option.value}
                        onClick={() => {
                          if (isSelected) {
                            setFormAnswer(currentAnswers.filter(v => v !== option.value))
                          } else {
                            setFormAnswer([...currentAnswers, option.value])
                          }
                        }}
                        className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                          isSelected
                            ? 'border-purple-500 bg-purple-50 text-purple-700'
                            : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        <input 
                          type="checkbox" 
                          checked={isSelected} 
                          readOnly 
                          className="mr-2"
                        />
                        {option.label}
                      </button>
                    )
                  })
                })()}
              </div>
            )}
          </Card>

          {/* 提交按钮 */}
          <div className="flex justify-end">
            <Button
              type="primary"
              size="large"
              onClick={handleFormSubmit}
              loading={submitting}
              disabled={formItem.required && (Array.isArray(formAnswer) ? formAnswer.length === 0 : !formAnswer.trim())}
              icon={<CheckCircle className="w-4 h-4 mr-1" />}
            >
              {submitting ? '提交中...' : '提交并继续'}
            </Button>
          </div>

          {/* 内容导航 */}
          <Card className="mt-6">
            <div className="text-sm text-gray-600 mb-3">内容导航</div>
            <div className="flex flex-wrap gap-2">
              {data.contentItems.map((item, idx) => (
                <button
                  key={item.id}
                  className={`w-10 h-10 rounded text-sm font-medium transition-colors ${
                    idx === data.questionnaireAssessment.currentIndex
                      ? 'bg-blue-500 text-white'
                      : item.completed
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    )
  }

  // 渲染量表题目
  if (!data.currentScale) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Result
          status="error"
          title="测评已结束"
          subTitle="该测评已失效或已过期"
        />
      </div>
    )
  }

  const items = data.currentScale.definition.items
  const currentItem = items[scaleIndex]

  const handleAnswer = async (value: number | string) => {
    try {
      await handleSelectAnswer(value)
    } catch (err: any) {
      message.error(err.message || '提交失败')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* 进度条 */}
        <Card className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-600">
              <Layers className="w-4 h-4 inline mr-1" />
              量表：{data.currentScale.name}
            </span>
            <span className="text-gray-600">
              整体进度：{data.questionnaireAssessment.currentIndex + 1} / {data.totalItems}
            </span>
          </div>
          <Progress 
            percent={((data.questionnaireAssessment.currentIndex + 1) / data.totalItems) * 100}
            showInfo={false}
          />
        </Card>

        {/* 题目卡片 */}
        <Card className="shadow-lg">
          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <span className="text-gray-500 text-sm">
                第 {scaleIndex + 1} / {items.length} 题
              </span>
            </div>

            <h3 className="text-xl font-medium mb-8">
              {currentItem.content}
            </h3>

            {/* 答题区域 */}
            <div className="space-y-3">
              {currentItem.options.map((option) => (
                <button
                  key={`${typeof option.value}:${String(option.value)}`}
                  onClick={() => handleAnswer(option.value)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                    answers[currentItem.itemCode] === option.value
                      ? 'border-blue-500 bg-blue-50 text-blue-600'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* 导航按钮 */}
          <div className="flex justify-between mt-8">
            <Button
              onClick={handlePrevious}
              disabled={scaleIndex === 0}
            >
              上一题
            </Button>
            
            {scaleIndex === items.length - 1 ? (
              <Button
                type="primary"
                onClick={handleCompleteScale}
                loading={submitting}
                icon={<CheckCircle className="w-4 h-4 mr-1" />}
              >
                {submitting ? '提交中...' : `完成量表${data.questionnaireAssessment.currentIndex + 1 < data.totalItems ? '（进入下一个内容）' : '（完成测评）'}`}
              </Button>
            ) : (
              <Button
                type="primary"
                onClick={handleNext}
              >
                下一题
              </Button>
            )}
          </div>

          {/* 题目导航 */}
          <Card className="mt-6 bg-gray-50">
            <div className="text-sm text-gray-600 mb-3">题目导航</div>
            <div className="flex flex-wrap gap-2">
              {items.map((item, index) => (
                <button
                  key={item.itemCode}
                  onClick={() => setScaleIndex(index)}
                  className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                    scaleIndex === index
                      ? 'bg-blue-500 text-white'
                      : answers[item.itemCode] !== undefined
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </Card>
        </Card>
      </div>
    </div>
  )
}

export default PublicQuestionnaireAssessment
