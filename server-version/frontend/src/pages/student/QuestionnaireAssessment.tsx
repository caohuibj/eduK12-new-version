import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import apiClient from '../../api/client'
import { ChevronLeft, ChevronRight, CheckCircle, FileText, Layers } from 'lucide-react'

type ResponseValue = string | number

interface ScaleRunnerItem {
  itemCode: string
  content: string
  type: string
  required: boolean
  sortOrder: number
  responseSetKey: string
  randomizeOptions: boolean
  options: Array<{ value: ResponseValue; label: string }>
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
  type: 'fill_blank' | 'single_choice' | 'multiple_choice' | 'text_input' | 'year_month'
  label: string
  placeholder: string | null
  required: boolean
  position: number
  options: Array<{ value: string; label: string }> | null
  contextKey?: string | null
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
    context?: { status: 'collecting' | 'frozen'; frozenAt: string | null }
  }
  currentFormItem: FormItem | null
  currentScale: (Scale & { scaleAssessmentId: string }) | null
  totalItems: number
  contentItems: ContentItem[]
  scaleAssessments?: Array<{ id: string; scaleId: string }>
}

const QuestionnaireAssessment: React.FC = () => {
  const { questionnaireId } = useParams<{ questionnaireId: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<QuestionnaireAssessmentData | null>(null)
  // 问卷的 currentIndex 表示整体内容位置；量表内部必须使用独立索引。
  const [scaleIndex, setScaleIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, ResponseValue>>({})
  const [formAnswer, setFormAnswer] = useState<string | string[]>('')
  const [submitting, setSubmitting] = useState(false)

  const freezeContextBeforeScale = async (assessmentId: string) => {
    const response = await apiClient.post<{ status: 'frozen'; frozenAt: string }>(`/questionnaires/assessments/${assessmentId}/context/freeze`)
    if (response.code !== 0 || !response.data) throw new Error(response.message || '人口学上下文冻结失败')
    return response.data
  }
  
  // 记录当前题目开始显示的时间
  const itemStartTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    startAssessment()
  }, [questionnaireId])

  // 切换题目时重置计时器
  useEffect(() => {
    itemStartTimeRef.current = Date.now()
  }, [scaleIndex])

  const startAssessment = async () => {
    try {
      // 先检查是否已经完成过该问卷
      const availableResponse = await apiClient.get<{ list: Array<{ id: string; completed: boolean; assessmentId: string | null }> }>('/questionnaires/available')
      if (availableResponse.code === 0) {
        const existingRecord = availableResponse.data.list.find(q => q.id === questionnaireId)
        if (existingRecord && existingRecord.completed && existingRecord.assessmentId) {
          // 已完成，直接跳转到结果页
          navigate(`/student/questionnaires/result/${existingRecord.assessmentId}`)
          return
        }
      }

      const response = await apiClient.post<QuestionnaireAssessmentData>(
        `/questionnaires/${questionnaireId}/assessments`
      )

      if (response.code === 0) {
        // 如果测评已完成，跳转到结果页
        if (response.data.questionnaireAssessment.status === 'COMPLETED') {
          navigate(`/student/questionnaires/result/${response.data.questionnaireAssessment.id}`)
          return
        }
        
        // 如果问卷已完成（所有内容为空），完成问卷并跳转
        if (response.data.contentItems?.length === 0 || 
            response.data.questionnaireAssessment.currentIndex >= response.data.totalItems) {
          await apiClient.post(`/questionnaires/assessments/${response.data.questionnaireAssessment.id}/complete`)
          navigate(`/student/questionnaires/result/${response.data.questionnaireAssessment.id}`)
          return
        }

        let nextData = response.data
        if (response.data.currentScale?.scaleAssessmentId) {
          const frozen = await freezeContextBeforeScale(response.data.questionnaireAssessment.id)
          nextData = {
            ...response.data,
            questionnaireAssessment: {
              ...response.data.questionnaireAssessment,
              context: { status: 'frozen', frozenAt: frozen.frozenAt },
            },
          }
        }
        setData(nextData)
        
        // 根据当前项类型处理
        if (nextData.currentFormItem) {
          // 当前是表单题目
          setFormAnswer('')
        } else if (nextData.currentScale?.scaleAssessmentId) {
          // 当前是量表
          fetchExistingAnswers(nextData.currentScale.scaleAssessmentId)
        }
      }
    } catch (err) {
      console.error('开始问卷测评失败', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchExistingAnswers = async (assessmentId: string) => {
    try {
      const response = await apiClient.get(`/scales/assessments/${assessmentId}`)
      if (response.code === 0 && response.data.answers) {
        const existingAnswers: Record<string, ResponseValue> = {}
        response.data.answers.forEach((a: any) => {
          existingAnswers[a.itemCode] = a.responseValue
        })
        setAnswers(existingAnswers)
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
      await apiClient.patch(`/scales/assessments/${data.currentScale.scaleAssessmentId}/answers`, {
        itemCode: item.itemCode,
        responseValue: value,
        responseTimeMs: responseTime,
      })
      
      // 如果不是最后一题，自动跳到下一题
      if (scaleIndex < items.length - 1) {
        setTimeout(() => {
          setScaleIndex((index) => index + 1)
        }, 200)
      }
    } catch (err) {
      console.error('提交答案失败', err)
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
      alert('此题为必填项')
      return
    }

    try {
      setSubmitting(true)
      
      // 处理多选题答案格式：数组转JSON字符串
      const valueToSubmit: string = Array.isArray(formAnswer) 
        ? JSON.stringify(formAnswer) 
        : formAnswer
      
      // 保存表单答案
      await apiClient.post(`/questionnaires/assessments/${data.questionnaireAssessment.id}/form-answers`, {
        formItemId: formItem.id,
        value: valueToSubmit,
      })

      // 进入下一个内容项
      await moveToNextItem()
    } catch (err: any) {
      alert(err.message || '提交失败')
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
      await apiClient.post(`/scales/assessments/${data.currentScale.scaleAssessmentId}/complete`)

      // 进入下一个内容项
      await moveToNextItem()
    } catch (err: any) {
      alert(err.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 移动到下一个内容项
  const moveToNextItem = async () => {
    if (!data) return

    // 重新获取测评状态
    const statusResponse = await apiClient.get<QuestionnaireAssessmentData>(
      `/questionnaires/assessments/${data.questionnaireAssessment.id}`
    )

    if (statusResponse.code === 0) {
      const qa = statusResponse.data.questionnaireAssessment
      
      if (qa.status === 'COMPLETED' || qa.currentIndex >= statusResponse.data.totalItems) {
        // 所有内容完成
        await apiClient.post(`/questionnaires/assessments/${data.questionnaireAssessment.id}/complete`)
        navigate(`/student/questionnaires/result/${data.questionnaireAssessment.id}`)
      } else {
        // 切换到下一项
        let nextData = statusResponse.data
        if (statusResponse.data.currentScale?.scaleAssessmentId) {
          const frozen = await freezeContextBeforeScale(data.questionnaireAssessment.id)
          nextData = {
            ...statusResponse.data,
            questionnaireAssessment: {
              ...statusResponse.data.questionnaireAssessment,
              context: { status: 'frozen', frozenAt: frozen.frozenAt },
            },
          }
        }
        setData(nextData)
        setScaleIndex(0)
        setAnswers({})
        setFormAnswer('')
        
        if (nextData.currentFormItem) {
          // 下一项是表单题目
          setFormAnswer('')
        } else if (nextData.currentScale?.scaleAssessmentId) {
          // 下一项是量表
          fetchExistingAnswers(nextData.currentScale.scaleAssessmentId)
        }
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">问卷不存在或未发布</p>
      </div>
    )
  }

  // 渲染表单题目
  if (data.currentFormItem) {
    const formItem = data.currentFormItem
    return (
      <div className="max-w-2xl mx-auto">
        {/* 整体进度 */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>整体进度：{data.questionnaireAssessment.currentIndex + 1} / {data.totalItems}</span>
            <span className="flex items-center gap-1">
              <FileText className="w-4 h-4" />
              表单题目
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${((data.questionnaireAssessment.currentIndex + 1) / data.totalItems) * 100}%` }}
            />
          </div>
        </div>

        {/* 表单内容 */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-6">
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
                  formItem.type === 'text_input' ? '长文本' :
                  formItem.type === 'year_month' ? '年月' : '未知'}】
            </span>
          </h2>

          {formItem.type === 'fill_blank' && (
            <input
              type="text"
              value={formAnswer}
              onChange={(e) => setFormAnswer(e.target.value)}
              placeholder={formItem.placeholder || '请输入'}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary focus:border-primary"
            />
          )}

          {formItem.type === 'text_input' && (
            <textarea
              value={formAnswer}
              onChange={(e) => setFormAnswer(e.target.value)}
              placeholder={formItem.placeholder || '请输入'}
              rows={5}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary focus:border-primary"
            />
          )}

          {formItem.type === 'year_month' && (
            <input
              type="month"
              value={typeof formAnswer === 'string' ? formAnswer : ''}
              onChange={(e) => setFormAnswer(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary focus:border-primary"
            />
          )}

          {formItem.contextKey && (
            <p className="text-sm text-gray-500 mt-3">此字段用于本次问卷的测评参考；进入量表后将冻结，并由同一问卷中的后续量表共享。</p>
          )}

          {formItem.type === 'single_choice' && (
            <div className="space-y-3">
              {(formItem.options || []).map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFormAnswer(option.value)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                    formAnswer === option.value
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {formItem.type === 'multiple_choice' && (
            <div className="space-y-3">
              {(formItem.options || []).map((option) => {
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
              })}
            </div>
          )}
        </div>

        {/* 导航 */}
        <div className="flex justify-end">
          <button
            onClick={handleFormSubmit}
            disabled={submitting || (formItem.required && (Array.isArray(formAnswer) ? formAnswer.length === 0 : !formAnswer.trim()))}
            className="flex items-center px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            <CheckCircle className="w-5 h-5 mr-1" />
            {submitting ? '提交中...' : '提交并继续'}
          </button>
        </div>

        {/* 内容导航 */}
        <div className="mt-6 bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-3">内容导航</div>
          <div className="flex flex-wrap gap-2">
            {data.contentItems.map((item, index) => (
              <div
                key={`${item.type}-${item.id}`}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm ${
                  index === data.questionnaireAssessment.currentIndex
                    ? 'bg-primary text-white'
                    : item.completed
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {item.type === 'form' ? (
                  <FileText className="w-3 h-3" />
                ) : (
                  <Layers className="w-3 h-3" />
                )}
                {index + 1}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // 渲染量表题目
  if (data.currentScale) {
    const items = data.currentScale.definition.items
    if (items.length === 0) {
      return (
        <div className="text-center py-12">
          <p className="text-gray-500">量表题目加载失败</p>
        </div>
      )
    }

    const currentItem = items[scaleIndex]
    const selectedValue = currentItem ? answers[currentItem.itemCode] : undefined
    const scaleProgress = Math.round((Object.keys(answers).length / items.length) * 100)

    return (
      <div className="max-w-2xl mx-auto">
        {/* 整体进度 */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>整体进度：{data.questionnaireAssessment.currentIndex + 1} / {data.totalItems}</span>
            <span className="flex items-center gap-1">
              <Layers className="w-4 h-4" />
              {data.currentScale.name}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all"
              style={{ width: `${((data.questionnaireAssessment.currentIndex + scaleProgress / 100) / data.totalItems) * 100}%` }}
            />
          </div>
        </div>

        {/* 当前量表进度 */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>当前量表进度</span>
            <span>{Object.keys(answers).length} / {items.length}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: `${scaleProgress}%` }}
            />
          </div>
        </div>

        {/* 题目 */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="text-sm text-gray-500 mb-2">
            第 {scaleIndex + 1} 题 / 共 {items.length} 题
          </div>
          <h2 className="text-lg font-medium text-gray-900 mb-6">
            {currentItem?.content}
          </h2>

          {/* 选项 */}
          <div className="space-y-3">
            {(currentItem?.options || []).map((option) => (
              <button
                key={`${typeof option.value}:${String(option.value)}`}
                onClick={() => handleSelectAnswer(option.value)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                  selectedValue === option.value
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* 导航 */}
        <div className="flex justify-between">
          <button
            onClick={handlePrevious}
            disabled={scaleIndex === 0}
            className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            上一题
          </button>

          {scaleIndex === items.length - 1 ? (
            <button
              onClick={handleCompleteScale}
              disabled={submitting}
              className="flex items-center px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              <CheckCircle className="w-5 h-5 mr-1" />
              {submitting ? '提交中...' : '完成量表'}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
            >
              下一题
              <ChevronRight className="w-5 h-5 ml-1" />
            </button>
          )}
        </div>

        {/* 题目导航 */}
        <div className="mt-6 bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600 mb-3">题目导航</div>
          <div className="flex flex-wrap gap-2">
            {items.map((item, index) => (
              <button
                key={item.itemCode}
                onClick={() => setScaleIndex(index)}
                className={`w-8 h-8 rounded text-sm font-medium ${
                  scaleIndex === index
                    ? 'bg-primary text-white'
                    : answers[item.itemCode] !== undefined
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="text-center py-12">
      <p className="text-gray-500">加载失败</p>
    </div>
  )
}

export default QuestionnaireAssessment
