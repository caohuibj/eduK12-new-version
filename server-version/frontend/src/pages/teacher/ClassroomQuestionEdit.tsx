import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import apiClient from '../../api/client'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
import { Plus, Trash2, Save } from 'lucide-react'

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
      <ProductPage width="management">
        <ProductStatus kind="pending" title="正在加载课堂题目">正在读取课堂与题目配置。</ProductStatus>
      </ProductPage>
    )
  }

  if (!classroom) {
    return (
      <ProductPage width="management">
        <ProductStatus
          kind="error"
          title="课堂不可用"
          actions={<Link to="/teacher/classrooms" className="staff-secondary-link">返回课堂列表</Link>}
        >
          {error || '课堂不存在，或当前账户无法访问。'}
        </ProductStatus>
      </ProductPage>
    )
  }

  if (classroom.status === 'ENDED') {
    return (
      <ProductPage width="management">
        <ProductStatus
          kind="info"
          title="课堂已经结束"
          actions={<Link to="/teacher/classrooms" className="staff-secondary-link">返回课堂列表</Link>}
        >
          已结束的课堂不能继续编辑题目。
        </ProductStatus>
      </ProductPage>
    )
  }

  return (
    <ProductPage width="management" className="staff-editor-page space-y-6 classroom-question-editor">
      <PageHeader
        title={classroom.name}
        description={`${classroom.course.title} · 课堂码 ${classroom.code} · 题目管理`}
        actions={
          <div className="staff-inline-actions">
            <Link to={`/teacher/classrooms/${id}/control`} className="staff-secondary-link">返回控制面板</Link>
            {!editingQuestion && (
              <ProductButton variant="primary" onClick={handleCreateQuestion}>
                <Plus className="w-4 h-4" aria-hidden="true" />
                添加题目
              </ProductButton>
            )}
          </div>
        }
      />

      {error && <ProductStatus kind="error" title="题目无法保存">{error}</ProductStatus>}

      {editingQuestion && (
        <section className="staff-panel" aria-labelledby="classroom-question-form-title">
          <div className="staff-panel__header">
            <div>
              <h2 id="classroom-question-form-title">{editingQuestion.id === 'new' ? '添加题目' : '编辑题目'}</h2>
              <p>设置题型、内容、选项与答题时限。</p>
            </div>
          </div>

          <div className="staff-panel__body staff-form">
            <label className="staff-field">
              <span>题目类型</span>
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
              >
                <option value="single_choice">单选题</option>
                <option value="multiple_choice">多选题</option>
                <option value="fill_blank">填空题</option>
              </select>
            </label>

            <label className="staff-field">
              <span>题目内容</span>
              <textarea
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                rows={3}
                placeholder="请输入题目内容"
              />
            </label>

            {formData.type !== 'fill_blank' && (
              <div className="staff-field">
                <span>选项</span>
                <div className="classroom-question-options">
                  {formData.options?.map((option, index) => (
                    <div key={index} className="classroom-question-option">
                      <span className="classroom-question-option__key">{option.value}</span>
                      <input
                        type="text"
                        value={option.label}
                        onChange={(e) => {
                          const newOptions = [...(formData.options || [])]
                          newOptions[index] = { ...option, label: e.target.value }
                          setFormData({ ...formData, options: newOptions })
                        }}
                        placeholder={`选项 ${option.value}`}
                        aria-label={`选项 ${option.value}`}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(index)}
                        disabled={(formData.options?.length || 0) <= 2}
                        className="staff-icon-button classroom-question-option__remove"
                        aria-label={`删除选项 ${option.value}`}
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
                <div>
                  <ProductButton onClick={handleAddOption}>
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    添加选项
                  </ProductButton>
                </div>
              </div>
            )}

            <label className="staff-field">
              <span>答题时限（秒）</span>
              <input
                type="number"
                value={formData.timeLimit}
                onChange={(e) => setFormData({ ...formData, timeLimit: parseInt(e.target.value) || 60 })}
                min={10}
                max={600}
              />
              <span className="staff-field__hint">可设置 10–600 秒。</span>
            </label>
          </div>

          <div className="classroom-question-editor__actions">
            <ProductButton onClick={handleCancelEdit}>取消</ProductButton>
            <ProductButton variant="primary" onClick={handleSaveQuestion} disabled={saving}>
              <Save className="w-4 h-4" aria-hidden="true" />
              {saving ? '保存中...' : '保存'}
            </ProductButton>
          </div>
        </section>
      )}

      <section className="staff-panel" aria-labelledby="classroom-question-list-title">
        <div className="staff-panel__header">
          <div>
            <h2 id="classroom-question-list-title">题目列表</h2>
            <p>共 {questions.length} 道题；已经开始作答的题目保持只读。</p>
          </div>
          {!editingQuestion && questions.length > 0 && (
            <ProductButton onClick={handleCreateQuestion}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              添加题目
            </ProductButton>
          )}
        </div>

        <div className="staff-panel__body">
          {questions.length === 0 ? (
            <ProductStatus
              kind="info"
              title="暂无题目"
              actions={<ProductButton variant="primary" onClick={handleCreateQuestion}>添加第一道题</ProductButton>}
            >
              添加题目后即可在课堂控制面板中按顺序发起互动。
            </ProductStatus>
          ) : (
            <div className="classroom-question-list">
              {questions.map((question, index) => (
                <article key={question.id} className="classroom-question-card">
                  <div className="classroom-question-card__main">
                    <div className="classroom-question-card__heading">
                      <strong>第 {index + 1} 题</strong>
                      <span className="staff-badge">
                        {question.questionContent.type === 'single_choice'
                          ? '单选题'
                          : question.questionContent.type === 'multiple_choice'
                          ? '多选题'
                          : '填空题'}
                      </span>
                      {question.timeLimit && <span className="staff-muted">{question.timeLimit} 秒</span>}
                    </div>
                    <p>{question.questionContent.question}</p>
                    {question.questionContent.options && (
                      <div className="classroom-question-card__options">
                        {question.questionContent.options.map((opt: any, i: number) => (
                          <span key={i}>{opt.value}. {opt.label}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="staff-row-actions">
                    {!question.startedAt ? (
                      <>
                        <ProductButton onClick={() => handleEditQuestion(question)}>编辑</ProductButton>
                        <ProductButton variant="danger" onClick={() => handleDeleteQuestion(question.id)}>删除</ProductButton>
                      </>
                    ) : (
                      <span className="staff-badge staff-badge--success">{question._count?.answers || 0} 人已答</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </ProductPage>
  )
}

export default ClassroomQuestionEdit
