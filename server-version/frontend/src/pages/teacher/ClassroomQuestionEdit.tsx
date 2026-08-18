import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { ArrowLeft, Plus, Trash2, Save, GripVertical } from 'lucide-react'

interface Question {
  id: string
  questionIndex: number
  questionContent: any
  timeLimit: number | null
  startedAt: string | null
  endedAt: string | null
  _count?: {
    answers: number
  }
}

interface Classroom {
  id: string
  name: string
  code: string
  status: string
  course: {
    id: string
    title: string
  }
}

type QuestionType = 'single_choice' | 'multiple_choice' | 'fill_blank'

interface QuestionFormData {
  type: QuestionType
  question: string
  options?: { value: string; label: string }[]
  correctAnswer?: string | string[]
  timeLimit: number
}

const defaultQuestionData: QuestionFormData = {
  type: 'single_choice',
  question: '',
  options: [
    { value: 'A', label: '' },
    { value: 'B', label: '' },
    { value: 'C', label: '' },
    { value: 'D', label: '' },
  ],
  timeLimit: 60,
}

const ClassroomQuestionEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)
  const [formData, setFormData] = useState<QuestionFormData>(defaultQuestionData)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [id])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [classroomRes, questionsRes] = await Promise.all([
        apiClient.get<Classroom>(`/classrooms/${id}`),
        apiClient.get<Question[]>(`/classrooms/${id}/questions`),
      ])

      if (classroomRes.code === 0) {
        setClassroom(classroomRes.data)
      }

      if (questionsRes.code === 0) {
        setQuestions(questionsRes.data)
      }
    } catch (err: any) {
      setError(err.message || '加载数据失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateQuestion = () => {
    // 使用一个临时对象表示新题目
    setEditingQuestion({ id: 'new' } as any)
    setFormData(defaultQuestionData)
  }

  const handleEditQuestion = (question: Question) => {
    setEditingQuestion(question)
    setFormData({
      type: question.questionContent.type || 'single_choice',
      question: question.questionContent.question || '',
      options: question.questionContent.options || defaultQuestionData.options,
      correctAnswer: question.questionContent.correctAnswer,
      timeLimit: question.timeLimit || 60,
    })
  }

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('确定要删除这道题目吗？')) {
      return
    }

    try {
      const response = await apiClient.delete(`/classrooms/${id}/questions/${questionId}`)
      if (response.code === 0) {
        setQuestions(questions.filter((q) => q.id !== questionId))
      } else {
        alert(response.message)
      }
    } catch (err: any) {
      alert(err.message || '删除失败')
    }
  }

  const handleSaveQuestion = async () => {
    if (!formData.question.trim()) {
      setError('题目内容不能为空')
      return
    }

    if (formData.type !== 'fill_blank' && formData.options) {
      const hasEmptyOption = formData.options.some((opt) => !opt.label.trim())
      if (hasEmptyOption) {
        setError('选项内容不能为空')
        return
      }
    }

    try {
      setSaving(true)
      setError(null)

      const questionContent = {
        type: formData.type,
        question: formData.question,
        options: formData.type !== 'fill_blank' ? formData.options : undefined,
        correctAnswer: formData.correctAnswer,
      }

      if (editingQuestion?.id && editingQuestion.id !== 'new') {
        // 更新题目
        const response = await apiClient.put(`/classrooms/${id}/questions/${editingQuestion.id}`, {
          questionContent,
          timeLimit: formData.timeLimit,
        })

        if (response.code === 0) {
          setQuestions(questions.map((q) => (q.id === editingQuestion.id ? response.data : q)))
          setEditingQuestion(null)
        } else {
          setError(response.message)
        }
      } else {
        // 创建题目
        const response = await apiClient.post(`/classrooms/${id}/questions`, {
          questionContent,
          timeLimit: formData.timeLimit,
        })

        if (response.code === 0) {
          setQuestions([...questions, response.data])
          setEditingQuestion(null)
        } else {
          setError(response.message)
        }
      }
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleAddOption = () => {
    const nextValue = String.fromCharCode(65 + (formData.options?.length || 0))
    setFormData({
      ...formData,
      options: [...(formData.options || []), { value: nextValue, label: '' }],
    })
  }

  const handleRemoveOption = (index: number) => {
    if (formData.options && formData.options.length > 2) {
      const newOptions = formData.options.filter((_, i) => i !== index)
      setFormData({
        ...formData,
        options: newOptions,
      })
    }
  }

  const handleCancelEdit = () => {
    setEditingQuestion(null)
    setFormData(defaultQuestionData)
    setError(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (!classroom) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          <p>课堂不存在</p>
          <Link to="/teacher/classrooms" className="text-primary hover:underline mt-2 inline-block">
            返回列表
          </Link>
        </div>
      </div>
    )
  }

  if (classroom.status === 'ENDED') {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          <p>已结束的课堂不能编辑题目</p>
          <Link to="/teacher/classrooms" className="text-primary hover:underline mt-2 inline-block">
            返回列表
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          to={`/teacher/classrooms/${id}/control`}
          className="inline-flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回控制面板
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{classroom.name}</h1>
            <p className="text-sm text-gray-500 mt-1">
              课程: {classroom.course.title} | 课堂码: {classroom.code}
            </p>
          </div>
          {!editingQuestion && (
            <button
              onClick={handleCreateQuestion}
              className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
            >
              <Plus className="w-4 h-4 mr-2" />
              添加题目
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
        )}
      </div>

      {editingQuestion && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {editingQuestion.id ? '编辑题目' : '添加题目'}
          </h2>

          <div className="space-y-4">
            {/* 题目类型 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">题目类型</label>
              <select
                value={formData.type}
                onChange={(e) => {
                  const type = e.target.value as QuestionType
                  setFormData({
                    ...formData,
                    type,
                    options: type !== 'fill_blank' ? formData.options : undefined,
                  })
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="single_choice">单选题</option>
                <option value="multiple_choice">多选题</option>
                <option value="fill_blank">填空题</option>
              </select>
            </div>

            {/* 题目内容 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">题目内容</label>
              <textarea
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                rows={3}
                placeholder="请输入题目内容"
              />
            </div>

            {/* 选项（单选/多选） */}
            {formData.type !== 'fill_blank' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">选项</label>
                <div className="space-y-2">
                  {formData.options?.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="w-8 text-center font-medium text-gray-700">
                        {option.value}
                      </span>
                      <input
                        type="text"
                        value={option.label}
                        onChange={(e) => {
                          const newOptions = [...(formData.options || [])]
                          newOptions[index] = { ...option, label: e.target.value }
                          setFormData({ ...formData, options: newOptions })
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder={`选项 ${option.value}`}
                      />
                      <button
                        onClick={() => handleRemoveOption(index)}
                        disabled={(formData.options?.length || 0) <= 2}
                        className="p-2 text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleAddOption}
                  className="mt-2 text-sm text-primary hover:text-primary/80"
                >
                  + 添加选项
                </button>
              </div>
            )}

            {/* 答题时限 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                答题时限（秒）
              </label>
              <input
                type="number"
                value={formData.timeLimit}
                onChange={(e) => setFormData({ ...formData, timeLimit: parseInt(e.target.value) || 60 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                min={10}
                max={600}
              />
            </div>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={handleSaveQuestion}
                disabled={saving}
                className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 题目列表 */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-900">题目列表</h2>
        </div>

        {questions.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p>暂无题目，点击上方"添加题目"按钮创建</p>
          </div>
        ) : (
          <div className="divide-y">
            {questions.map((question, index) => (
              <div
                key={question.id}
                className="p-4 hover:bg-gray-50 flex items-start justify-between"
              >
                <div className="flex items-start gap-3 flex-1">
                  <GripVertical className="w-5 h-5 text-gray-400 mt-1 cursor-move" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">第 {index + 1} 题</span>
                      <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                        {question.questionContent.type === 'single_choice'
                          ? '单选题'
                          : question.questionContent.type === 'multiple_choice'
                          ? '多选题'
                          : '填空题'}
                      </span>
                      {question.timeLimit && (
                        <span className="text-xs text-gray-500">{question.timeLimit}秒</span>
                      )}
                    </div>
                    <p className="text-gray-700 mb-2">{question.questionContent.question}</p>
                    {question.questionContent.options && (
                      <div className="space-y-1 text-sm text-gray-600">
                        {question.questionContent.options.map((opt: any, i: number) => (
                          <div key={i}>
                            {opt.value}. {opt.label}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!question.startedAt && (
                    <>
                      <button
                        onClick={() => handleEditQuestion(question)}
                        className="px-3 py-1 text-sm text-primary hover:text-primary/80"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDeleteQuestion(question.id)}
                        className="px-3 py-1 text-sm text-red-600 hover:text-red-800"
                      >
                        删除
                      </button>
                    </>
                  )}
                  {question.startedAt && (
                    <span className="text-xs text-gray-500">
                      {question._count?.answers || 0} 人已答
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ClassroomQuestionEdit
