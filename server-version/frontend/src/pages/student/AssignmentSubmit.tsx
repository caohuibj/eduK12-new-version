import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, FileText, Loader2, FileText as FileIcon } from 'lucide-react'
import apiClient from '../../api/client'
import type { Assignment, Submission, MediaItem, DocumentItem } from '../../types'
import { VideoList, ImageList } from '../../components/MediaRenderer'
import PdfViewer from '../../components/PdfViewer'
import { sanitizeHtml } from '../../utils/sanitize'

const AssignmentSubmit: React.FC = () => {
  const { assignmentId } = useParams<{ assignmentId: string }>()
  const navigate = useNavigate()
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [content, setContent] = useState('')
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [multipleOptions, setMultipleOptions] = useState<Record<number, string[]>>({})
  const [textAnswers, setTextAnswers] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [playingVideo, setPlayingVideo] = useState<MediaItem | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(null)
  const [showPdfViewer, setShowPdfViewer] = useState(false)

  useEffect(() => {
    if (assignmentId) {
      fetchAssignmentDetail()
    }
  }, [assignmentId])

  const fetchAssignmentDetail = async () => {
    try {
      setLoading(true)
      const [assignmentRes, submissionRes] = await Promise.all([
        apiClient.get(`/assignments/${assignmentId}`),
        apiClient.get(`/assignments/${assignmentId}/my-submission`),
      ])

      if (assignmentRes.code === 0) {
        setAssignment(assignmentRes.data)
      }

      if (submissionRes.code === 0 && submissionRes.data) {
        setSubmission(submissionRes.data)
        setContent(submissionRes.data.content || '')
        
        if (submissionRes.data.answers && typeof submissionRes.data.answers === 'object') {
          const answers = submissionRes.data.answers as Record<string, string>
          const optionsArray: string[] = []
          const multiOptions: Record<number, string[]> = {}
          const textAns: Record<number, string> = {}
          
          if (assignmentRes.data?.questions) {
            assignmentRes.data.questions.forEach((q: any, idx: number) => {
              const answer = answers[idx.toString()]
              if (!answer) return
              
              if (q.type === 'single_choice') {
                optionsArray[idx] = answer
              } else if (q.type === 'multiple_choice') {
                multiOptions[idx] = answer.split(',')
              } else if (q.type === 'text') {
                textAns[idx] = answer
              }
            })
          }
          
          setSelectedOptions(optionsArray)
          setMultipleOptions(multiOptions)
          setTextAnswers(textAns)
        }
      }
    } catch (error) {
      console.error('获取作业详情失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOptionSelect = (index: number, option: string) => {
    const newOptions = [...selectedOptions]
    newOptions[index] = option
    setSelectedOptions(newOptions)
  }

  const handleMultipleOptionToggle = (index: number, option: string) => {
    const current = multipleOptions[index] || []
    const newOptions = current.includes(option)
      ? current.filter(o => o !== option)
      : [...current, option]
    setMultipleOptions({ ...multipleOptions, [index]: newOptions })
  }

  const handleTextAnswerChange = (index: number, value: string) => {
    setTextAnswers({ ...textAnswers, [index]: value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assignment) return

    setSubmitting(true)
    try {
      const answers: Record<string, string> = {}
      
      if (assignment.questions) {
        assignment.questions.forEach((question: any, index: number) => {
          if (question.type === 'single_choice' && selectedOptions[index]) {
            answers[`${index}`] = selectedOptions[index]
          } else if (question.type === 'multiple_choice' && multipleOptions[index]?.length > 0) {
            answers[`${index}`] = multipleOptions[index].join(',')
          } else if (question.type === 'text' && textAnswers[index]) {
            answers[`${index}`] = textAnswers[index]
          }
        })
      }

      const response = await apiClient.post(`/assignments/${assignmentId}/submit`, {
        content,
        answers: Object.keys(answers).length > 0 ? answers : undefined,
      })

      if (response.code === 0) {
        const isUpdate = submission !== null
        alert(isUpdate ? '修改成功！' : '提交成功！')
        setIsEditing(false)
        fetchAssignmentDetail()
      } else {
        alert(response.message || '提交失败')
      }
    } catch (error: any) {
      alert(error.message || '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return '无'
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return '无效日期'
      return date.toLocaleString('zh-CN')
    } catch {
      return '无效日期'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!assignment) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">作业不存在</p>
        <button onClick={() => navigate('/student')} className="btn-primary mt-4">
          返回
        </button>
      </div>
    )
  }

  const isOverdue = assignment.deadline ? new Date(assignment.deadline) < new Date() : false
  const hasSubmitted = !!submission

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center text-gray-600 hover:text-primary transition-colors"
      >
        <ArrowLeft className="w-5 h-5 mr-1" />
        返回
      </button>

      {/* Assignment Info */}
      <div className="card">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">{assignment.title}</h1>
        {assignment.description && (
          <p className="text-gray-600 mb-4">{assignment.description}</p>
        )}
        {/* 作业内容 - 富文本 */}
        {assignment.content && (
          <div 
            className="text-gray-700 mb-4 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(assignment.content) }}
          />
        )}
        <div className={`flex items-center space-x-2 text-sm ${isOverdue ? 'text-red-500' : 'text-gray-500'}`}>
          <Clock className="w-4 h-4" />
          <span>截止: {formatDate(assignment.deadline)}</span>
        </div>
      </div>

      {/* Video Attachments */}
      <VideoList
        videos={assignment.videos}
        title="关联视频"
        watermarkText="慧育空间专属教学视频"
      />

      {/* Image Attachments */}
      <ImageList
        images={assignment.images}
        title="相关图片"
        watermarkText="慧育空间专属教学图片"
      />

      {/* Document Attachments */}
      {assignment.documents && assignment.documents.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
            <FileIcon className="w-5 h-5 mr-2 text-red-500" />
            相关文档
          </h3>
          <div className="space-y-2">
            {assignment.documents.map((doc, index) => (
              <div
                key={index}
                onClick={() => {
                  setSelectedDocument(doc)
                  setShowPdfViewer(true)
                }}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <FileIcon className="w-5 h-5 text-red-500" />
                  <span className="text-gray-700">{doc.title}</span>
                  {doc.fileName && (
                    <span className="text-xs text-gray-500">({doc.fileName})</span>
                  )}
                </div>
                <span className="text-xs text-primary">点击查看</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            提示：点击可在线预览文档，也可下载保存
          </p>
        </div>
      )}

      {/* Submission Form */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <FileText className="w-5 h-5 mr-2" />
          {hasSubmitted && !isEditing ? '我的提交' : (isOverdue ? '作业已截止' : '提交作业')}
        </h3>

        {hasSubmitted && !isEditing ? (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-800 whitespace-pre-wrap">{submission.content}</p>
            </div>
            {submission.comment && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-800 mb-2">教师评语</h4>
                <p className="text-blue-700">{submission.comment}</p>
              </div>
            )}
            <p className="text-sm text-gray-500">
              提交时间: {formatDate(submission.submittedAt)}
            </p>
            {!isOverdue && (
              <button
                onClick={() => setIsEditing(true)}
                className="w-full btn-secondary flex items-center justify-center space-x-2"
              >
                <span>修改作业</span>
              </button>
            )}
          </div>
        ) : isOverdue ? (
          <div className="text-center py-8">
            <p className="text-red-500">作业已截止，无法提交</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Quiz Options */}
            {assignment.questions && assignment.questions.length > 0 && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 mb-2">请完成以下题目：</p>
                {(assignment.questions as any[]).map((question: any, index: number) => (
                  <div key={index} className="border rounded-lg p-4">
                    <p className="font-medium text-gray-800 mb-3">
                      {index + 1}. {question.question}
                      {question.type === 'single_choice' && <span className="text-xs text-gray-500 ml-2">(单选题)</span>}
                      {question.type === 'multiple_choice' && <span className="text-xs text-gray-500 ml-2">(多选题)</span>}
                      {question.type === 'text' && <span className="text-xs text-gray-500 ml-2">(文字题)</span>}
                    </p>
                    
                    {/* 单选题 */}
                    {question.type === 'single_choice' && (
                      <div className="space-y-2">
                        {question.options?.map((option: any) => (
                          <label
                            key={option.key || option.text || option}
                            className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="radio"
                              name={`question-${index}`}
                              value={option.key || option.text || option}
                              checked={selectedOptions[index] === (option.key || option.text || option)}
                              onChange={() => handleOptionSelect(index, option.key || option.text || option)}
                              className="w-4 h-4 text-primary"
                            />
                            <span className="text-gray-700">{option.text || option}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* 多选题 */}
                    {question.type === 'multiple_choice' && (
                      <div className="space-y-2">
                        {question.options?.map((option: any) => (
                          <label
                            key={option.key || option.text || option}
                            className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              name={`question-${index}`}
                              value={option.key || option.text || option}
                              checked={(multipleOptions[index] || []).includes(option.key || option.text || option)}
                              onChange={() => handleMultipleOptionToggle(index, option.key || option.text || option)}
                              className="w-4 h-4 text-primary rounded"
                            />
                            <span className="text-gray-700">{option.text || option}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* 文字题/主观题 */}
                    {question.type === 'text' && (
                      <div>
                        <textarea
                          value={textAnswers[index] || ''}
                          onChange={(e) => handleTextAnswerChange(index, e.target.value)}
                          className="input min-h-[120px]"
                          placeholder="请输入你的答案..."
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Text Content */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                作答内容
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="input min-h-[200px]"
                placeholder="请输入你的答案..."
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full btn-primary flex items-center justify-center space-x-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{submission ? '保存中...' : '提交中...'}</span>
                </>
              ) : (
                <span>{submission ? '保存修改' : '提交作业'}</span>
              )}
            </button>
            {isEditing && (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false)
                  if (submission) {
                    setContent(submission.content || '')
                    if (submission.answers && typeof submission.answers === 'object' && assignment) {
                      const answers = submission.answers as Record<string, string>
                      const optionsArray: string[] = []
                      const multiOptions: Record<number, string[]> = {}
                      const textAns: Record<number, string> = {}
                      
                      assignment.questions?.forEach((q: any, idx: number) => {
                        const answer = answers[idx.toString()]
                        if (!answer) return
                        
                        if (q.type === 'single_choice') {
                          optionsArray[idx] = answer
                        } else if (q.type === 'multiple_choice') {
                          multiOptions[idx] = answer.split(',')
                        } else if (q.type === 'text') {
                          textAns[idx] = answer
                        }
                      })
                      
                      setSelectedOptions(optionsArray)
                      setMultipleOptions(multiOptions)
                      setTextAnswers(textAns)
                    }
                  }
                }}
                className="w-full btn-secondary mt-2"
              >
                取消修改
              </button>
            )}
          </form>
        )}
      </div>

      {/* PDF Viewer */}
      {selectedDocument && (
        <PdfViewer
          isOpen={showPdfViewer}
          onClose={() => {
            setShowPdfViewer(false)
            setSelectedDocument(null)
          }}
          url={selectedDocument.url}
          title={selectedDocument.title}
        />
      )}

    </div>
  )
}

export default AssignmentSubmit
