import { formatLocalDateTime } from '../../utils/dateTime'
import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, FileText, Loader2, FileText as FileIcon } from 'lucide-react'
import apiClient from '../../api/client'
import type { Assignment, Submission, MediaItem, DocumentItem } from '../../types'
import { VideoList, ImageList } from '../../components/MediaRenderer'
import PdfViewer from '../../components/PdfViewer'
import { assignmentChoiceValues, formatAssignmentAnswer, readAssignmentAnswer } from '../../utils/answerLabels'
import { sanitizeHtml } from '../../utils/sanitize'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../../components/product-ui'
import {
  createIdempotencyKey,
  fingerprintIdempotencyPayload,
  submissionErrorMessage,
  shouldClearIdempotencyKey,
} from '../../utils/idempotency'

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
  const [formError, setFormError] = useState('')
  const [playingVideo, setPlayingVideo] = useState<MediaItem | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(null)
  const [showPdfViewer, setShowPdfViewer] = useState(false)
  const submitIdempotencyKeyRef = useRef<{ key: string; fingerprint: string } | null>(null)
  const submitInFlightRef = useRef(false)

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
              const answer = readAssignmentAnswer(answers, q, idx)
              if (!answer) return
              
              if (q.type === 'single_choice') {
                optionsArray[idx] = String(answer)
              } else if (q.type === 'multiple_choice') {
                multiOptions[idx] = assignmentChoiceValues(answer)
              } else if (q.type === 'text') {
                textAns[idx] = String(answer)
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
    if (!assignment || submitInFlightRef.current) return

    setFormError('')
    const questions = assignment.questions ?? []
    const missing = questions.findIndex((question, index) =>
      question.type === 'text' ? !textAnswers[index]?.trim() :
      question.type === 'multiple_choice' ? !multipleOptions[index]?.length : !selectedOptions[index])
    if (missing >= 0) { setFormError(`请完成题目${missing + 1}后再提交。`); return }
    if (!questions.length && !content.trim()) { setFormError('请填写作答内容后再提交。'); return }

    submitInFlightRef.current = true
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

      const payload = {
        content,
        answers: Object.keys(answers).length > 0 ? answers : undefined,
      }
      const fingerprint = fingerprintIdempotencyPayload(payload)
      const cached = submitIdempotencyKeyRef.current
      const idempotencyKey = cached && cached.fingerprint === fingerprint
        ? cached.key
        : createIdempotencyKey()
      submitIdempotencyKeyRef.current = { key: idempotencyKey, fingerprint }
      const requestPayload = {
        ...payload,
        // Revision is a concurrency guard, not part of the logical payload
        // fingerprint. A retry of the same content keeps its key and fails
        // closed if another writer advanced the submission in the meantime.
        expectedRevision: submission?.revision ?? 0,
      }
      const response = await apiClient.post(`/assignments/${assignmentId}/submit`, {
        ...requestPayload,
      }, {
        headers: { 'Idempotency-Key': idempotencyKey },
      })

      if (response.code === 0) {
        submitIdempotencyKeyRef.current = null
        const isUpdate = submission !== null
        alert(isUpdate ? '修改成功！' : '提交成功！')
        setIsEditing(false)
        fetchAssignmentDetail()
      } else {
        submitIdempotencyKeyRef.current = null
        alert(response.message || '提交失败')
      }
    } catch (error: any) {
      // Only an explicit, non-retryable 4xx rejection invalidates this key.
      // Network errors, timeouts and 5xx responses may follow a committed
      // write, so retain the key for an idempotent retry of the same payload.
      if (shouldClearIdempotencyKey(error)) {
        submitIdempotencyKeyRef.current = null
      }
      alert(submissionErrorMessage(error, '提交失败'))
    } finally {
      submitInFlightRef.current = false
      setSubmitting(false)
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return '无'
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return '无效日期'
      return formatLocalDateTime(dateString)
    } catch {
      return '无效日期'
    }
  }

  if (loading) {
    return (
      <ProductPage width="reading" className="hui-student-page hui-student-submission">
        <ProductStatus kind="pending" title="正在加载作业">正在读取作业内容与已有提交。</ProductStatus>
      </ProductPage>
    )
  }

  if (!assignment) {
    return (
      <ProductPage width="reading" className="hui-student-page hui-student-submission">
        <ProductStatus
          kind="warning"
          title="作业不存在"
          actions={<ProductButton variant="primary" onClick={() => navigate('/student')}>返回学生首页</ProductButton>}
        >
          当前作业可能已被移除，或您没有访问权限。
        </ProductStatus>
      </ProductPage>
    )
  }

  const isOverdue = assignment.deadline ? new Date(assignment.deadline) < new Date() : false
  const hasSubmitted = !!submission

  return (
    <ProductPage width="reading" className="hui-student-page hui-student-submission hui-assignment-submit">
      <ProductButton className="student-submit-back" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        返回
      </ProductButton>

      <PageHeader
        title={assignment.title}
        description={assignment.description || '查看作业要求并完成本次提交。'}
      />

      <section className="student-submit-info" aria-label="作业说明">
        {assignment.content && (
          <div
            className="student-submit-richtext prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(assignment.content) }}
          />
        )}
        <div className={`student-submit-deadline ${isOverdue ? 'student-submit-deadline--closed' : ''}`}>
          <Clock className="w-4 h-4" aria-hidden="true" />
          <span>截止时间：{formatDate(assignment.deadline)}</span>
        </div>
      </section>

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
        <section className="card student-submit-panel">
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
                <span className="text-xs text-action">点击查看</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {assignment.documents.some(doc => doc.allowDownload !== false) ? '提示：点击可在线预览文档，也可下载保存' : '提示：点击可在线预览文档'}
          </p>
        </section>
      )}

      {/* Submission Form */}
      <section className="card student-submit-panel">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <FileText className="w-5 h-5 mr-2" />
          {hasSubmitted && !isEditing ? '我的提交' : (isOverdue ? '作业已截止' : '提交作业')}
        </h3>

        {hasSubmitted && !isEditing ? (
          <div className="space-y-4">
            {assignment.questions?.map((question, index) => (
              <div className="student-submit-response" key={question.id || index}>
                <h4 className="font-medium text-gray-800">{index + 1}. {question.question}</h4>
                <p className="text-sm text-gray-500">{question.type === 'text' ? '主观题答案' : question.type === 'multiple_choice' ? '多选题答案' : '单选题答案'}</p>
                <p className="text-gray-800 whitespace-pre-wrap">{formatAssignmentAnswer(assignment.questions, String(index),
                  readAssignmentAnswer(submission.answers, question, index))}</p>
              </div>
            ))}
            {submission.content && <div className="student-submit-response">
              <h4 className="font-medium text-gray-800">{assignment.questions?.length ? '补充说明' : '作答内容'}</h4>
              <p className="text-gray-800 whitespace-pre-wrap">{submission.content}</p>
            </div>}
            {submission.comment && (
              <div className="student-submit-feedback">
                <h4 className="text-sm font-semibold text-blue-800 mb-2">教师评语</h4>
                <p className="text-blue-700">{submission.comment}</p>
              </div>
            )}
            <p className="text-sm text-gray-500">
              提交时间: {formatDate(submission.submittedAt)}
            </p>
            {!isOverdue && (
              <button
                onClick={() => { setFormError(''); setIsEditing(true) }}
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
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {formError && <p role="alert" className="text-red-600">{formError}</p>}
            {/* Quiz Options */}
            {assignment.questions && assignment.questions.length > 0 && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 mb-2">请完成以下题目：</p>
                {(assignment.questions as any[]).map((question: any, index: number) => (
                  <div key={index} className="student-submit-question">
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
                            className="student-submit-option"
                          >
                            <input
                              type="radio"
                              name={`question-${index}`}
                              value={option.key || option.text || option}
                              checked={selectedOptions[index] === (option.key || option.text || option)}
                              onChange={() => handleOptionSelect(index, option.key || option.text || option)}
                              className="w-4 h-4 text-action"
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
                            className="student-submit-option"
                          >
                            <input
                              type="checkbox"
                              name={`question-${index}`}
                              value={option.key || option.text || option}
                              checked={(multipleOptions[index] || []).includes(option.key || option.text || option)}
                              onChange={() => handleMultipleOptionToggle(index, option.key || option.text || option)}
                              className="w-4 h-4 text-action rounded"
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
                          aria-label={`题目${index + 1}：${question.question}`}
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
              <label htmlFor="assignment-note" className="block text-sm font-medium text-gray-700 mb-2">
                {assignment.questions?.length ? '补充说明（选填）' : '作答内容'}
              </label>
              {assignment.questions?.length ? <p id="assignment-note-help" className="text-sm text-gray-500 mb-2">题目答案已在上方填写，可在这里补充说明，无需重复作答。</p> : null}
              <textarea
                id="assignment-note"
                aria-describedby={assignment.questions?.length ? 'assignment-note-help' : undefined}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="input min-h-[200px]"
                placeholder={assignment.questions?.length ? '可填写补充说明' : '请输入作答内容'}
                required={!assignment.questions?.length}
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
                  setFormError('')
                  if (submission) {
                    setContent(submission.content || '')
                    if (submission.answers && typeof submission.answers === 'object' && assignment) {
                      const answers = submission.answers as Record<string, string>
                      const optionsArray: string[] = []
                      const multiOptions: Record<number, string[]> = {}
                      const textAns: Record<number, string> = {}
                      
                      assignment.questions?.forEach((q: any, idx: number) => {
                        const answer = readAssignmentAnswer(answers, q, idx)
                        if (!answer) return
                        
                        if (q.type === 'single_choice') {
                          optionsArray[idx] = String(answer)
                        } else if (q.type === 'multiple_choice') {
                          multiOptions[idx] = assignmentChoiceValues(answer)
                        } else if (q.type === 'text') {
                          textAns[idx] = String(answer)
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
      </section>

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
          allowDownload={selectedDocument.allowDownload}
        />
      )}

    </ProductPage>
  )
}

export default AssignmentSubmit
