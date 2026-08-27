import React, { useState, useEffect } from 'react'
import { Plus, Search, Edit, Trash2, ClipboardList, FileText, Copy, CheckCircle2, Clock, BookOpen, Video, Image as ImageIcon, Download, Eye, CheckSquare, Square, MessageSquare, Users, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../api/client'
import { sessionFetch } from '../api/client'
import QuestionEditor, { Question } from '../components/QuestionEditor'
import RichTextEditor from '../components/RichTextEditor'
import MediaSelector, { MediaItem } from '../components/MediaSelector'
import TagInput from '../components/TagInput'
import TagBadge from '../components/TagBadge'
import TagFilter from '../components/TagFilter'
import { sanitizeHtml } from '../utils/sanitize'
import { normalizeImageUrl, handleImageError } from '../utils/mediaUtils'
import { buildAssignmentAttachmentUpdateFields } from '../utils/attachmentUpdate'
import type { Assignment, Course } from '../types'

interface VideoItem {
  type: 'library' | 'external' | 'upload'
  id?: string
  url: string
  title: string
  thumbnail?: string
  source?: string
}

interface ImageItem {
  url: string
  name: string
}

interface DocumentItem {
  id: string
  url: string
  title: string
  fileName?: string
}

interface AssignmentFormData {
  courseId: string
  title: string
  description: string
  content: string
  deadline: string
  questions: Question[]
  videos: VideoItem[]
  images: ImageItem[]
  documents: DocumentItem[]
  tags: string[]
}

interface Submission {
  id: string
  studentId: string
  student: {
    id: string
    username: string
    nickname: string
    avatarUrl?: string
  }
  content?: string
  answers?: Record<string, any>
  comment?: string
  status: 'DRAFT' | 'SUBMITTED' | 'GRADED'
  submittedAt: string
  reviewedAt?: string
}

const AssignmentList: React.FC = () => {
  const navigate = useNavigate()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null)
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [formData, setFormData] = useState<AssignmentFormData>({
    courseId: '',
    title: '',
    description: '',
    content: '',
    deadline: '',
    questions: [],
    videos: [],
    images: [],
    documents: [],
    tags: [],
  })
  const [showMediaSelector, setShowMediaSelector] = useState(false)
  const [mediaSelectorType, setMediaSelectorType] = useState<'video' | 'image' | 'document'>('video')
  
  // 提交列表弹窗状态
  const [showSubmissionsModal, setShowSubmissionsModal] = useState(false)
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [selectedSubmissions, setSelectedSubmissions] = useState<Set<string>>(new Set())
  const [batchComment, setBatchComment] = useState('你的作业质量很棒，再接再厉！')
  const [isBatchGrading, setIsBatchGrading] = useState(false)
  const [showBatchGradeModal, setShowBatchGradeModal] = useState(false)

  useEffect(() => {
    fetchAssignments()
    fetchCourses()
    fetchTags()
  }, [])

  const fetchAssignments = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get('/assignments')
      if (response.code === 0) {
        setAssignments(response.data.list)
      }
    } catch (error) {
      console.error('获取作业列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchCourses = async () => {
    try {
      const response = await apiClient.get('/courses')
      if (response.code === 0) {
        setCourses(response.data.list)
      }
    } catch (error) {
      console.error('获取课程列表失败:', error)
    }
  }

  const fetchTags = async () => {
    try {
      const response = await apiClient.get('/assignments/tags')
      if (response.code === 0) {
        setAvailableTags(response.data.tags)
      }
    } catch (error) {
      console.error('获取标签列表失败:', error)
    }
  }

  const fetchSubmissions = async (assignmentId: string) => {
    try {
      setSubmissionsLoading(true)
      const response = await apiClient.get(`/assignments/${assignmentId}/submissions`)
      if (response.code === 0) {
        setSubmissions(response.data.list)
        // 默认选中所有未批改的提交
        const ungraded = response.data.list.filter((s: Submission) => s.status !== 'GRADED')
        setSelectedSubmissions(new Set(ungraded.map((s: Submission) => s.id)))
      }
    } catch (error) {
      console.error('获取提交列表失败:', error)
      alert('获取提交列表失败')
    } finally {
      setSubmissionsLoading(false)
    }
  }

  // 打开提交列表弹窗
  const openSubmissionsModal = (assignment: Assignment) => {
    setSelectedAssignment(assignment)
    setShowSubmissionsModal(true)
    fetchSubmissions(assignment.id)
  }

  // 一键批量批复
  const handleBatchGrade = async () => {
    if (!selectedAssignment) return
    if (selectedSubmissions.size === 0) {
      alert('请至少选择一份作业')
      return
    }
    if (!batchComment.trim()) {
      alert('请输入评语')
      return
    }

    setIsBatchGrading(true)
    try {
      // 逐个批复选中的提交
      let successCount = 0
      for (const submissionId of selectedSubmissions) {
        try {
          const response = await apiClient.post(`/assignments/${selectedAssignment.id}/submissions/${submissionId}/grade`, {
            comment: batchComment.trim()
          })
          if (response.code === 0) {
            successCount++
          }
        } catch (err) {
          console.error(`批复失败: ${submissionId}`, err)
        }
      }
      
      alert(`批量批复完成，成功批复 ${successCount} 份作业`)
      setShowBatchGradeModal(false)
      // 刷新提交列表
      fetchSubmissions(selectedAssignment.id)
      // 清空选择
      setSelectedSubmissions(new Set())
    } catch (error: any) {
      alert(error.message || '批量批复失败')
    } finally {
      setIsBatchGrading(false)
    }
  }

  // 全选/取消全选
  const toggleSelectAll = () => {
    const ungradedSubmissions = submissions.filter(s => s.status !== 'GRADED')
    if (selectedSubmissions.size === ungradedSubmissions.length) {
      setSelectedSubmissions(new Set())
    } else {
      setSelectedSubmissions(new Set(ungradedSubmissions.map(s => s.id)))
    }
  }

  // 单个选择/取消选择
  const toggleSelectSubmission = (submissionId: string) => {
    const newSet = new Set(selectedSubmissions)
    if (newSet.has(submissionId)) {
      newSet.delete(submissionId)
    } else {
      newSet.add(submissionId)
    }
    setSelectedSubmissions(newSet)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const data = {
        courseId: formData.courseId,
        title: formData.title,
        description: formData.description,
        content: formData.content,
        deadline: formData.deadline || undefined,
        questions: formData.questions.length > 0 ? formData.questions : undefined,
        videos: formData.videos.length > 0 ? formData.videos : undefined,
        images: formData.images.length > 0 ? formData.images : undefined,
        documents: formData.documents.length > 0 ? formData.documents : undefined,
        tags: formData.tags,
      }
      const response = await apiClient.post('/assignments', data)
      if (response.code === 0) {
        setShowModal(false)
        resetForm()
        fetchAssignments()
      }
    } catch (error: any) {
      alert(error.message || '创建失败')
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingAssignment) return

    try {
      const data = {
        title: formData.title,
        description: formData.description,
        content: formData.content,
        deadline: formData.deadline || undefined,
        ...buildAssignmentAttachmentUpdateFields(formData),
        tags: formData.tags,
      }
      const response = await apiClient.put(`/assignments/${editingAssignment.id}`, data)
      if (response.code === 0) {
        setShowModal(false)
        setEditingAssignment(null)
        resetForm()
        fetchAssignments()
      }
    } catch (error: any) {
      alert(error.message || '更新失败')
    }
  }

  const handleDelete = async (assignment: Assignment) => {
    if (!window.confirm('确定要删除这个作业吗？')) return
    try {
      const response = await apiClient.delete(`/assignments/${assignment.id}`)
      if (response.code === 0) {
        fetchAssignments()
      }
    } catch (error: any) {
      alert(error.message || '删除失败')
    }
  }

  const handleClone = async (assignment: Assignment) => {
    if (!window.confirm('确定要复制这个作业吗？将清空截止时间和作答数据。')) return
    
    try {
      const response = await apiClient.post(`/assignments`, {
        courseId: assignment.courseId,
        title: `${assignment.title} (复制)`,
        description: assignment.description,
        content: assignment.content,
        questions: assignment.questions,
        videos: assignment.videos,
        images: assignment.images,
        documents: assignment.documents,
      })
      if (response.code === 0) {
        fetchAssignments()
      }
    } catch (error: any) {
      alert(error.message || '复制失败')
    }
  }

  const handleExport = async (assignment: Assignment) => {
    try {
      const response = await sessionFetch(`/api/assignments/${assignment.id}/export`)
      
      if (!response.ok) {
        throw new Error('导出失败')
      }
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${assignment.title}_提交数据.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error: any) {
      alert(error.message || '导出失败')
    }
  }

  const openCreateModal = () => {
    resetForm()
    setEditingAssignment(null)
    setShowModal(true)
  }

  const openEditModal = (assignment: Assignment) => {
    setEditingAssignment(assignment)
    setFormData({
      courseId: assignment.courseId,
      title: assignment.title,
      description: assignment.description || '',
      content: assignment.content || '',
      deadline: assignment.deadline ? new Date(assignment.deadline).toISOString().slice(0, 16) : '',
      questions: (assignment.questions as Question[]) || [],
      videos: (assignment.videos as VideoItem[]) || [],
      images: (assignment.images as ImageItem[]) || [],
      documents: (assignment.documents as DocumentItem[]) || [],
      tags: assignment.tags || [],
    })
    setShowModal(true)
  }

  const resetForm = () => {
    setFormData({
      courseId: '',
      title: '',
      description: '',
      content: '',
      deadline: '',
      questions: [],
      videos: [],
      images: [],
      documents: [],
      tags: [],
    })
  }

  const handleAddMedia = (type: 'video' | 'image' | 'document') => {
    setMediaSelectorType(type)
    setShowMediaSelector(true)
  }

  const handleMediaSelect = (item: MediaItem) => {
    if (mediaSelectorType === 'video') {
      setFormData({
        ...formData,
        videos: [...formData.videos, item as VideoItem],
      })
    } else if (mediaSelectorType === 'image') {
      setFormData({
        ...formData,
        images: [...formData.images, item as unknown as ImageItem],
      })
    } else if (mediaSelectorType === 'document') {
      setFormData({
        ...formData,
        documents: [...formData.documents, item as DocumentItem],
      })
    }
    setShowMediaSelector(false)
  }

  const removeVideo = (index: number) => {
    setFormData({
      ...formData,
      videos: formData.videos.filter((_, i) => i !== index),
    })
  }

  const removeImage = (index: number) => {
    setFormData({
      ...formData,
      images: formData.images.filter((_, i) => i !== index),
    })
  }

  const removeDocument = (index: number) => {
    setFormData({
      ...formData,
      documents: formData.documents.filter((_, i) => i !== index),
    })
  }

  const filteredAssignments = assignments.filter((a) => {
    const matchesKeyword = a.title.toLowerCase().includes(keyword.toLowerCase()) ||
                           a.course?.title?.toLowerCase().includes(keyword.toLowerCase())
    const matchesTags = selectedTags.length === 0 || 
                       selectedTags.some(tag => a.tags?.includes(tag))
    return matchesKeyword && matchesTags
  })

  const formatDeadline = (deadline?: string) => {
    if (!deadline) return '无截止时间'
    const date = new Date(deadline)
    const now = new Date()
    const isOverdue = date < now
    return (
      <span className={isOverdue ? 'text-red-500' : 'text-gray-500'}>
        <Clock className="w-3 h-3 inline mr-1" />
        {date.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        {isOverdue && ' (已截止)'}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索作业..."
            className="input pl-10 w-64"
          />
        </div>
        <button
          onClick={openCreateModal}
          className="btn-primary flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>布置作业</span>
        </button>
      </div>

      {/* Tag Filter */}
      {availableTags.length > 0 && (
        <TagFilter
          availableTags={availableTags}
          selectedTags={selectedTags}
          onChange={setSelectedTags}
          title="标签筛选"
        />
      )}

      {/* Assignment List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="text-center py-12">
          <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">暂无作业</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAssignments.map((assignment) => (
            <div key={assignment.id} className="card hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-800 mb-1 break-words">{assignment.title}</h3>
                  <div className="flex items-center space-x-2 text-sm text-gray-500 mb-2">
                    <BookOpen className="w-4 h-4" />
                    <span>{assignment.course?.title || '未知课程'}</span>
                  </div>
                  {assignment.tags && assignment.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {assignment.tags.map((tag, index) => (
                        <TagBadge key={index} tag={tag} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex space-x-1 ml-2">
                  <button
                    onClick={() => handleExport(assignment)}
                    className="p-2 text-gray-400 hover:text-green-500 hover:bg-green-50 rounded"
                    title="导出提交数据"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleClone(assignment)}
                    className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded"
                    title="复制作业"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openEditModal(assignment)}
                    className="p-2 text-gray-400 hover:text-primary hover:bg-blue-50 rounded"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(assignment)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div 
                className="text-gray-600 text-sm mb-4 line-clamp-2"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(assignment.content || assignment.description || '暂无描述') }}
              />

              <div className="flex items-center justify-between text-sm">
                <button
                  onClick={() => openSubmissionsModal(assignment)}
                  className="flex items-center space-x-1 text-primary hover:text-primary-hover"
                >
                  <FileText className="w-4 h-4" />
                  <span>{assignment._count?.submissions || 0} 份提交</span>
                  <Eye className="w-3 h-3 ml-1" />
                </button>
                <div className="text-xs">
                  {formatDeadline(assignment.deadline)}
                </div>
              </div>

              {(assignment.questions?.length || 0) > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center space-x-4 text-xs text-gray-500">
                    <span className="flex items-center">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      {assignment.questions?.length || 0} 道题目
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto py-10">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 my-auto max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">
                {editingAssignment ? '编辑作业' : '布置作业'}
              </h2>
            </div>
            
            <form onSubmit={editingAssignment ? handleUpdate : handleCreate} className="p-6 space-y-6">
              {/* Course Selection */}
              <div>
                <label className="label">选择课程 *</label>
                <select
                  value={formData.courseId}
                  onChange={(e) => setFormData({ ...formData, courseId: e.target.value })}
                  className="input w-full"
                  required
                  disabled={!!editingAssignment}
                >
                  <option value="">请选择课程</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title} (课程码: {course.courseCode})
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="label">作业标题 *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="input w-full"
                  placeholder="请输入作业标题"
                  required
                />
              </div>

              {/* Rich Text Content */}
              <div>
                <label className="label">作业内容</label>
                <RichTextEditor
                  value={formData.content}
                  onChange={(content) => setFormData({ ...formData, content })}
                  placeholder="请输入作业内容..."
                  height="150px"
                />
              </div>

              {/* Deadline */}
              <div>
                <label className="label">截止时间</label>
                <input
                  type="datetime-local"
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                  className="input w-full"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="label">标签</label>
                <TagInput
                  value={formData.tags}
                  onChange={(tags) => setFormData({ ...formData, tags })}
                  placeholder="输入标签后按回车添加"
                />
              </div>

              {/* Videos */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">视频</label>
                  <button
                    type="button"
                    onClick={() => handleAddMedia('video')}
                    className="text-sm text-primary hover:text-primary-hover flex items-center"
                  >
                    <Video className="w-4 h-4 mr-1" />
                    添加视频
                  </button>
                </div>
                {formData.videos.length > 0 && (
                  <div className="space-y-2">
                    {formData.videos.map((video, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div className="flex items-center space-x-2">
                          <Video className="w-4 h-4 text-gray-400" />
                          <span className="text-sm truncate">{video.title}</span>
                          {video.source && (
                            <span className="text-xs text-gray-500">({video.source})</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeVideo(index)}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Images */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">图片</label>
                  <button
                    type="button"
                    onClick={() => handleAddMedia('image')}
                    className="text-sm text-primary hover:text-primary-hover flex items-center"
                  >
                    <ImageIcon className="w-4 h-4 mr-1" />
                    添加图片
                  </button>
                </div>
                {formData.images.length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {formData.images.map((image, index) => {
                      const imageUrl = normalizeImageUrl(image.url)
                      return (
                        <div key={index} className="relative group">
                          <img
                            src={imageUrl}
                            alt={image.name}
                            className="w-full h-20 object-cover rounded"
                            onError={(e) => {
                              console.error('图片预览加载失败:', imageUrl)
                              handleImageError(e)
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(index)}
                            className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Documents */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">文档</label>
                  <button
                    type="button"
                    onClick={() => handleAddMedia('document')}
                    className="text-sm text-primary hover:text-primary-hover flex items-center"
                  >
                    <FileText className="w-4 h-4 mr-1" />
                    添加文档
                  </button>
                </div>
                {formData.documents.length > 0 && (
                  <div className="space-y-2">
                    {formData.documents.map((doc, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div className="flex items-center space-x-2">
                          <FileText className="w-4 h-4 text-red-500" />
                          <span className="text-sm truncate">{doc.title}</span>
                          {doc.fileName && (
                            <span className="text-xs text-gray-500">({doc.fileName})</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDocument(index)}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Questions */}
              <div>
                <label className="label">题目设置</label>
                <QuestionEditor
                  questions={formData.questions}
                  onChange={(questions) => setFormData({ ...formData, questions })}
                />
              </div>

              {/* Actions */}
              <div className="flex space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false)
                    setEditingAssignment(null)
                    resetForm()
                  }}
                  className="flex-1 btn-secondary"
                >
                  取消
                </button>
                <button type="submit" className="flex-1 btn-primary">
                  {editingAssignment ? '保存修改' : '创建作业'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Media Selector */}
      <MediaSelector
        isOpen={showMediaSelector}
        onClose={() => setShowMediaSelector(false)}
        onSelect={handleMediaSelect}
        type={mediaSelectorType}
      />

      {/* Submissions Modal */}
      {showSubmissionsModal && selectedAssignment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto py-10">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 my-auto max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">作业提交列表</h2>
                <p className="text-sm text-gray-500 mt-1">{selectedAssignment.title}</p>
              </div>
              <button
                onClick={() => {
                  setShowSubmissionsModal(false)
                  setSelectedAssignment(null)
                  setSubmissions([])
                  setSelectedSubmissions(new Set())
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6">
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-500">
                    共 {submissions.length} 份提交
                  </span>
                  <span className="text-sm text-green-600">
                    {submissions.filter(s => s.status === 'GRADED').length} 已批改
                  </span>
                  <span className="text-sm text-orange-500">
                    {submissions.filter(s => s.status !== 'GRADED').length} 待批改
                  </span>
                </div>
                {submissions.filter(s => s.status !== 'GRADED').length > 0 && (
                  <button
                    onClick={() => setShowBatchGradeModal(true)}
                    className="btn-primary flex items-center space-x-2"
                  >
                    <CheckSquare className="w-4 h-4" />
                    <span>一键批量批复</span>
                  </button>
                )}
              </div>

              {submissionsLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
              ) : submissions.length === 0 ? (
                <div className="text-center py-12">
                  <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">暂无提交</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {submissions.map((submission) => (
                    <div
                      key={submission.id}
                      className={`border rounded-lg p-4 ${
                        submission.status === 'GRADED'
                          ? 'bg-green-50 border-green-200'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                            <Users className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">
                              {submission.student.nickname || submission.student.username}
                            </p>
                            <p className="text-sm text-gray-500">
                              提交时间: {new Date(submission.submittedAt).toLocaleString('zh-CN')}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            submission.status === 'GRADED'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-orange-100 text-orange-700'
                          }`}
                        >
                          {submission.status === 'GRADED' ? '已批改' : '待批改'}
                        </span>
                      </div>

                      {/* 提交内容 */}
                      {submission.content && (
                        <div className="mt-3 p-3 bg-gray-50 rounded text-sm text-gray-700">
                          <p className="whitespace-pre-wrap">{submission.content}</p>
                        </div>
                      )}

                      {/* 选择题答案 */}
                      {submission.answers && Object.keys(submission.answers).length > 0 && (
                        <div className="mt-3">
                          <p className="text-sm font-medium text-gray-700 mb-2">选择题答案:</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(submission.answers).map(([key, value]) => (
                              <span key={key} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm">
                                {key}: {String(value)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 评语 */}
                      {submission.comment && (
                        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
                          <p className="text-sm font-medium text-green-800 mb-1">教师评语:</p>
                          <p className="text-sm text-green-700">{submission.comment}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Batch Grade Modal */}
      {showBatchGradeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold">一键批量批复</h3>
              <p className="text-sm text-gray-500 mt-1">
                已选择 {selectedSubmissions.size} 份待批改作业
              </p>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Select All */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <span className="text-sm font-medium text-gray-700">
                  待批改作业 ({submissions.filter(s => s.status !== 'GRADED').length})
                </span>
                <button
                  onClick={toggleSelectAll}
                  className="text-sm text-primary hover:text-primary-hover flex items-center space-x-1"
                >
                  {selectedSubmissions.size === submissions.filter(s => s.status !== 'GRADED').length ? (
                    <>
                      <CheckSquare className="w-4 h-4" />
                      <span>取消全选</span>
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4" />
                      <span>全选</span>
                    </>
                  )}
                </button>
              </div>

              {/* Submission List */}
              <div className="max-h-48 overflow-y-auto space-y-2 border rounded p-2">
                {submissions
                  .filter(s => s.status !== 'GRADED')
                  .map((submission) => (
                    <label
                      key={submission.id}
                      className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSubmissions.has(submission.id)}
                        onChange={() => toggleSelectSubmission(submission.id)}
                        className="w-4 h-4 text-primary rounded"
                      />
                      <span className="text-sm text-gray-700">
                        {submission.student.nickname || submission.student.username}
                      </span>
                    </label>
                  ))}
              </div>

              {/* Comment Input */}
              <div>
                <label className="label flex items-center space-x-2">
                  <MessageSquare className="w-4 h-4" />
                  <span>批复评语</span>
                </label>
                <textarea
                  value={batchComment}
                  onChange={(e) => setBatchComment(e.target.value)}
                  className="input w-full h-24"
                  placeholder="请输入评语..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  默认评语：你的作业质量很棒，再接再厉！
                </p>
              </div>

              {/* Actions */}
              <div className="flex space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowBatchGradeModal(false)}
                  className="flex-1 btn-secondary"
                  disabled={isBatchGrading}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleBatchGrade}
                  disabled={isBatchGrading || selectedSubmissions.size === 0}
                  className="flex-1 btn-primary disabled:opacity-50"
                >
                  {isBatchGrading ? '批复中...' : `确认批复 (${selectedSubmissions.size}份)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AssignmentList
