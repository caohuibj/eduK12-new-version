import React, { useState } from 'react'
import { Plus, Trash2, GripVertical, CheckCircle2, Circle, AlignLeft, ListTodo, CheckSquare } from 'lucide-react'

export interface Question {
  id: string
  type: 'single_choice' | 'multiple_choice' | 'text'
  question: string
  options?: {
    key: string
    text: string
    points?: number  // 单选题每个选项的分数
  }[]
}

interface QuestionEditorProps {
  questions: Question[]
  onChange: (questions: Question[]) => void
}

const QuestionEditor: React.FC<QuestionEditorProps> = ({ questions, onChange }) => {
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null)

  const generateId = () => Math.random().toString(36).substring(2, 9)

  const addQuestion = (type: 'single_choice' | 'multiple_choice' | 'text') => {
    const newQuestion: Question = {
      id: generateId(),
      type,
      question: type === 'text' ? '新的主观题' : '新的选择题',
      options: type === 'single_choice' ? [
        { key: 'A', text: '选项A', points: 0 },
        { key: 'B', text: '选项B', points: 0 },
        { key: 'C', text: '选项C', points: 0 },
        { key: 'D', text: '选项D', points: 0 },
      ] : type === 'multiple_choice' ? [
        { key: 'A', text: '选项A' },
        { key: 'B', text: '选项B' },
        { key: 'C', text: '选项C' },
        { key: 'D', text: '选项D' },
      ] : undefined,
    }
    onChange([...questions, newQuestion])
    setEditingQuestion(newQuestion.id)
  }

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    onChange(questions.map(q => q.id === id ? { ...q, ...updates } : q))
  }

  const deleteQuestion = (id: string) => {
    if (window.confirm('确定要删除这道题目吗？')) {
      onChange(questions.filter(q => q.id !== id))
    }
  }

  const moveQuestion = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 0) {
      const newQuestions = [...questions]
      ;[newQuestions[index], newQuestions[index - 1]] = [newQuestions[index - 1], newQuestions[index]]
      onChange(newQuestions)
    } else if (direction === 'down' && index < questions.length - 1) {
      const newQuestions = [...questions]
      ;[newQuestions[index], newQuestions[index + 1]] = [newQuestions[index + 1], newQuestions[index]]
      onChange(newQuestions)
    }
  }

  const addOption = (questionId: string) => {
    const question = questions.find(q => q.id === questionId)
    if (!question || !question.options) return

    const nextKey = String.fromCharCode(65 + question.options.length) // A, B, C...
    const newOption = question.type === 'single_choice' 
      ? { key: nextKey, text: `选项${nextKey}`, points: 0 }
      : { key: nextKey, text: `选项${nextKey}` }
    updateQuestion(questionId, {
      options: [...question.options, newOption]
    })
  }

  const updateOption = (questionId: string, key: string, updates: { text?: string; points?: number }) => {
    const question = questions.find(q => q.id === questionId)
    if (!question || !question.options) return

    updateQuestion(questionId, {
      options: question.options.map(opt => 
        opt.key === key ? { ...opt, ...updates } : opt
      )
    })
  }

  const deleteOption = (questionId: string, key: string) => {
    const question = questions.find(q => q.id === questionId)
    if (!question || !question.options || question.options.length <= 2) {
      alert('选择题至少需要2个选项')
      return
    }

    updateQuestion(questionId, {
      options: question.options.filter(opt => opt.key !== key)
    })
  }

  return (
    <div className="space-y-4">
      {/* Add Question Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => addQuestion('single_choice')}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <ListTodo className="w-4 h-4" />
          <span>添加单选题</span>
        </button>
        <button
          type="button"
          onClick={() => addQuestion('multiple_choice')}
          className="flex items-center space-x-2 px-4 py-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors"
        >
          <CheckSquare className="w-4 h-4" />
          <span>添加多选题</span>
        </button>
        <button
          type="button"
          onClick={() => addQuestion('text')}
          className="flex items-center space-x-2 px-4 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
        >
          <AlignLeft className="w-4 h-4" />
          <span>添加主观题</span>
        </button>
      </div>

      {/* Questions List */}
      {questions.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
          <p className="text-gray-500">还没有题目，点击上方按钮添加</p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((question, index) => (
            <div
              key={question.id}
              className={`border rounded-lg p-4 ${editingQuestion === question.id ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200'}`}
            >
              {/* Question Header */}
              <div className="flex items-start space-x-3">
                <div className="flex flex-col items-center space-y-1 pt-1">
                  <button
                    type="button"
                    onClick={() => moveQuestion(index, 'up')}
                    disabled={index === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <GripVertical className="w-4 h-4 text-gray-400" />
                  <button
                    type="button"
                    onClick={() => moveQuestion(index, 'down')}
                    disabled={index === questions.length - 1}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>

                <div className="flex-1">
                  {/* Question Title */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-500">题目 {index + 1}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        question.type === 'single_choice' 
                          ? 'bg-blue-100 text-blue-700' 
                          : question.type === 'multiple_choice'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {question.type === 'single_choice' ? '单选题' : question.type === 'multiple_choice' ? '多选题' : '主观题'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteQuestion(question.id)}
                      className="text-red-400 hover:text-red-600 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Question Text */}
                  <textarea
                    value={question.question}
                    onChange={(e) => updateQuestion(question.id, { question: e.target.value })}
                    placeholder="请输入题目内容..."
                    className="input w-full mb-3"
                    rows={2}
                  />

                  {/* Options for Single Choice */}
                  {question.type === 'single_choice' && question.options && (
                    <div className="space-y-2 ml-4">
                      {question.options.map((option) => (
                        <div key={option.key} className="flex items-center space-x-3">
                          <span className="font-medium text-gray-600 w-6">{option.key}.</span>
                          <input
                            type="text"
                            value={option.text}
                            onChange={(e) => updateOption(question.id, option.key, { text: e.target.value })}
                            className="input flex-1"
                            placeholder={`选项 ${option.key}`}
                          />
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-500">分值:</span>
                            <input
                              type="number"
                              value={option.points || 0}
                              onChange={(e) => updateOption(question.id, option.key, { points: parseInt(e.target.value) || 0 })}
                              className="input w-16 text-center"
                              min={0}
                              max={100}
                            />
                          </div>
                          {question.options!.length > 2 && (
                            <button
                              type="button"
                              onClick={() => deleteOption(question.id, option.key)}
                              className="text-red-400 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addOption(question.id)}
                        className="text-sm text-blue-600 hover:text-blue-700 mt-2"
                      >
                        + 添加选项
                      </button>
                      <p className="text-xs text-gray-500 mt-1">
                        为每个选项设置分值，学生选择该选项即获得对应分数
                      </p>
                    </div>
                  )}

                  {/* Options for Multiple Choice */}
                  {question.type === 'multiple_choice' && question.options && (
                    <div className="space-y-2 ml-4">
                      {question.options.map((option) => (
                        <div key={option.key} className="flex items-center space-x-3">
                          <CheckSquare className="w-5 h-5 text-purple-400" />
                          <span className="font-medium text-gray-600 w-6">{option.key}.</span>
                          <input
                            type="text"
                            value={option.text}
                            onChange={(e) => updateOption(question.id, option.key, { text: e.target.value })}
                            className="input flex-1"
                            placeholder={`选项 ${option.key}`}
                          />
                          {question.options!.length > 2 && (
                            <button
                              type="button"
                              onClick={() => deleteOption(question.id, option.key)}
                              className="text-red-400 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addOption(question.id)}
                        className="text-sm text-purple-600 hover:text-purple-700 mt-2"
                      >
                        + 添加选项
                      </button>
                      <p className="text-xs text-gray-500 mt-1">
                        多选题不设置分值，仅记录学生选择的选项
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default QuestionEditor
