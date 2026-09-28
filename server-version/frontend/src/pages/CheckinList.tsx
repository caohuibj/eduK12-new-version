import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, Camera, Trash2, Edit, Copy, Users, BookOpen, CheckCircle2, Video, Image as ImageIcon, Download, Eye, X, FileText, Share2 } from 'lucide-react'
import apiClient from '../api/client'
import { sessionFetch } from '../api/client'
import RichTextEditor from '../components/RichTextEditor'
import MediaSelector, { MediaItem } from '../components/MediaSelector'
import TagBadge from '../components/TagBadge'
import TagFilter from '../components/TagFilter'
import TagInput from '../components/TagInput'
import CheckinTokenManager from '../components/CheckinTokenManager'
import { sanitizeHtml } from '../utils/sanitize'
import { normalizeImageUrl, handleImageError } from '../utils/mediaUtils'
import { buildAttachmentUpdateFields } from '../utils/attachmentUpdate'
import type { Checkin, Course } from '../types'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../components/product-ui'
import MoreActions from '../components/staff-ui/MoreActions'
import { useStaffFeedback } from '../components/staff-ui/useStaffFeedback'

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

interface CheckinFormData {
  courseId: string
  title: string
  content: string
  videos: VideoItem[]
  images: ImageItem[]
  documents: DocumentItem[]
  endTime: string
  allowViewOthers: boolean
  tags: string[]
}

interface CheckinSubmission {
  id: string
  studentId: string
  student: {
    id: string
    username: string
    nickname: string
    avatarUrl?: string
  }
  content?: string
  images?: string[]  // 后端返回字符串数组
  createdAt: string
}

const CheckinList: React.FC = () => {
  const [searchParams] = useSearchParams()
  const focusId = searchParams.get('id')
  const { feedback, confirm, success, error: showError } = useStaffFeedback()
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingCheckin, setEditingCheckin] = useState<Checkin | null>(null)
  const [formData, setFormData] = useState<CheckinFormData>({
    courseId: '',
    title: '',
    content: '',
    videos: [],
    images: [],
    documents: [],
    endTime: '',
    allowViewOthers: false,
    tags: [],
  })
  const [showMediaSelector, setShowMediaSelector] = useState(false)
  const [mediaSelectorType, setMediaSelectorType] = useState<'video' | 'image' | 'document'>('video')
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  
  // 提交列表弹窗状态
  const [showSubmissionsModal, setShowSubmissionsModal] = useState(false)
  const [selectedCheckin, setSelectedCheckin] = useState<Checkin | null>(null)
  const [submissions, setSubmissions] = useState<CheckinSubmission[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)

  useEffect(() => {
    fetchCheckins()
    fetchCourses()
    fetchTags()
  }, [])

  useEffect(() => {
    if (loading || !focusId) return
    const element = document.getElementById(`checkin-record-${focusId}`)
    if (!element) return
    element.scrollIntoView({ block: 'center' })
    element.focus()
  }, [loading, focusId])

  const fetchCheckins = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get('/checkins')
      if (response.code === 0) {
        setCheckins(response.data.list)
      }
    } catch (error) {
      console.error('获取打卡列表失败:', error)
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
      const response = await apiClient.get('/checkins/tags')
      if (response.code === 0) {
        setAvailableTags(response.data.tags)
      }
    } catch (error) {
      console.error('获取标签列表失败:', error)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const data = {
        courseId: formData.courseId,
        title: formData.title,
        description: '',
        content: formData.content,
        videos: formData.videos.length > 0 ? formData.videos : undefined,
        images: formData.images.length > 0 ? formData.images : undefined,
        documents: formData.documents.length > 0 ? formData.documents : undefined,
        endTime: formData.endTime || undefined,
        allowViewOthers: formData.allowViewOthers,
        tags: formData.tags,
      }
      const response = await apiClient.post('/checkins', data)
      if (response.code === 0) {
        setShowModal(false)
        resetForm()
        fetchCheckins()
      }
    } catch (error: any) {
      alert(error.message || '创建失败')
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCheckin) return

    try {
      const data = {
        title: formData.title,
        description: '',
        content: formData.content,
        ...buildAttachmentUpdateFields(formData),
        endTime: formData.endTime || undefined,
        allowViewOthers: formData.allowViewOthers,
        tags: formData.tags,
      }
      const response = await apiClient.put(`/checkins/${editingCheckin.id}`, data)
      if (response.code === 0) {
        setShowModal(false)
        setEditingCheckin(null)
        resetForm()
        fetchCheckins()
      }
    } catch (error: any) {
      alert(error.message || '更新失败')
    }
  }

  const handleDelete = async (checkin: Checkin) => {
    if (!(await confirm({ title: `删除打卡「${checkin.title}」？`, body: '删除后将无法继续提交；已有业务约束仍由服务器检查。', confirmLabel: '删除打卡', danger: true }))) return
    try {
      const response = await apiClient.delete(`/checkins/${checkin.id}`)
      if (response.code === 0) {
        success('打卡已删除')
        fetchCheckins()
      }
    } catch (error: any) {
      showError('删除打卡失败', error.message || '请稍后重试')
    }
  }

  const handleClone = async (checkin: Checkin) => {
    if (!(await confirm({ title: `复制打卡「${checkin.title}」？`, body: '将创建独立副本，原打卡和历史提交不会改变。', confirmLabel: '复制打卡' }))) return
    try {
      // 确保 videos 和 images 是数组格式
      let videos = checkin.videos
      let images = checkin.images
      
      // 如果是字符串，尝试解析为 JSON
      if (typeof videos === 'string') {
        try { videos = JSON.parse(videos) } catch { videos = [] }
      }
      if (typeof images === 'string') {
        try { images = JSON.parse(images) } catch { images = [] }
      }
      
      const response = await apiClient.post('/checkins', {
        courseId: checkin.courseId,
        title: `${checkin.title} (复制)`,
        description: checkin.description || '',
        content: checkin.content || '',
        videos: videos || [],
        images: images || [],
        documents: checkin.documents || [],
        allowViewOthers: checkin.allowViewOthers || false,
      })
      if (response.code === 0) {
        success('打卡已复制')
        fetchCheckins()
      }
    } catch (error: any) {
      showError('复制打卡失败', error.message || '请稍后重试')
    }
  }

  const handleExport = async (checkin: Checkin) => {
    try {
      const response = await sessionFetch(`/api/checkins/${checkin.id}/export`)
      
      if (!response.ok) {
        throw new Error('导出失败')
      }
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${checkin.title}_打卡数据.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error: any) {
      alert(error.message || '导出失败')
    }
  }

  // 打开提交列表弹窗
  const openSubmissionsModal = (checkin: Checkin) => {
    setSelectedCheckin(checkin)
    setShowSubmissionsModal(true)
    fetchSubmissions(checkin.id)
  }

  const fetchSubmissions = async (checkinId: string) => {
    try {
      setSubmissionsLoading(true)
      const response = await apiClient.get(`/checkins/${checkinId}/submissions`)
      if (response.code === 0) {
        setSubmissions(response.data.list)
      }
    } catch (error) {
      console.error('获取提交列表失败:', error)
      alert('获取提交列表失败')
    } finally {
      setSubmissionsLoading(false)
    }
  }

  const openCreateModal = () => {
    resetForm()
    setEditingCheckin(null)
    setShowModal(true)
  }

  const openEditModal = (checkin: Checkin) => {
    setEditingCheckin(checkin)
    setFormData({
      courseId: checkin.courseId,
      title: checkin.title,
      content: checkin.content || '',
      videos: (checkin.videos as VideoItem[]) || [],
      images: (checkin.images as ImageItem[]) || [],
      documents: (checkin.documents as DocumentItem[]) || [],
      endTime: checkin.endTime ? new Date(checkin.endTime).toISOString().slice(0, 16) : '',
      allowViewOthers: checkin.allowViewOthers || false,
      tags: checkin.tags || [],
    })
    setShowModal(true)
  }

  const resetForm = () => {
    setFormData({
      courseId: '',
      title: '',
      content: '',
      videos: [],
      images: [],
      documents: [],
      endTime: '',
      allowViewOthers: false,
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

  const filteredCheckins = checkins.filter((c) => {
    const matchesKeyword = c.title.toLowerCase().includes(keyword.toLowerCase()) ||
                           c.course?.title?.toLowerCase().includes(keyword.toLowerCase())
    const matchesTags = selectedTags.length === 0 || 
                       selectedTags.some(tag => c.tags?.includes(tag))
    return matchesKeyword && matchesTags
  })

  return (
    <ProductPage width="management" className="space-y-6">
      <PageHeader title="打卡管理" description="集中查看课程打卡、参与情况和截止时间。" actions={<ProductButton variant="primary" onClick={openCreateModal}><Plus className="w-4 h-4" aria-hidden="true" />创建打卡</ProductButton>} />
      {feedback}
      <div className="staff-toolbar"><label className="staff-search-field"><Search className="w-4 h-4" aria-hidden="true" /><span className="sr-only">搜索打卡</span><input type="search" value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="搜索打卡或课程" /></label><span className="staff-help">共 {filteredCheckins.length} 个打卡</span></div>
      {availableTags.length > 0 && <TagFilter availableTags={availableTags} selectedTags={selectedTags} onChange={setSelectedTags} title="标签筛选" />}
      {loading ? <ProductStatus kind="pending" title="正在加载打卡">正在读取打卡和参与概况。</ProductStatus>
      : filteredCheckins.length === 0 ? <ProductStatus kind="info" title="暂无匹配打卡">可以调整筛选条件，或创建第一项打卡。</ProductStatus>
      : <div className="staff-table-container"><table className="staff-table"><thead><tr><th>打卡</th><th>课程</th><th>截止时间</th><th>参与</th><th>公开参与</th><th className="text-right">操作</th></tr></thead><tbody>
        {filteredCheckins.map(checkin=><tr id={`checkin-record-${checkin.id}`} tabIndex={-1} key={checkin.id} className={focusId===checkin.id?'staff-target-row':''}>
          <td><button type="button" className="staff-record-button" onClick={()=>openEditModal(checkin)}>{checkin.title}</button>{checkin.tags?.length?<div className="staff-inline-tags">{checkin.tags.slice(0,2).map((tag,index)=><TagBadge key={index} tag={tag}/>)}</div>:null}</td>
          <td>{checkin.course?.title || '未知课程'}</td>
          <td>{checkin.endTime ? new Date(checkin.endTime).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '无截止时间'}</td>
          <td><button type="button" className="staff-text-action" onClick={()=>openSubmissionsModal(checkin)}>{checkin._count?.submissions || 0} 人参与</button></td>
          <td><span className={`staff-badge ${checkin.allowAnonymous?'staff-badge--success':''}`}>{checkin.allowAnonymous?'已开启':'未开启'}</span></td>
          <td><div className="staff-table-actions"><ProductButton onClick={()=>openSubmissionsModal(checkin)}>查看提交</ProductButton><MoreActions label={`${checkin.title} 的更多操作`}><CheckinTokenManager checkinId={checkin.id} checkinTitle={checkin.title} allowAnonymous={checkin.allowAnonymous||false} onAllowAnonymousChange={value=>setCheckins(current=>current.map(item=>item.id===checkin.id?{...item,allowAnonymous:value}:item))}/><button type="button" onClick={()=>void handleExport(checkin)}>导出数据</button><button type="button" onClick={()=>void handleClone(checkin)}>复制打卡</button><button type="button" onClick={()=>openEditModal(checkin)}>编辑打卡</button><button type="button" className="staff-danger-action" onClick={()=>void handleDelete(checkin)}>删除打卡</button></MoreActions></div></td>
        </tr>)}
      </tbody></table></div>}
      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto py-10">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 my-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">
                {editingCheckin ? '编辑打卡' : '创建打卡'}
              </h2>
            </div>
            
            <form onSubmit={editingCheckin ? handleUpdate : handleCreate} className="p-6 space-y-4">
              {/* Course Selection */}
              <div>
                <label className="label">选择课程 *</label>
                <select
                  value={formData.courseId}
                  onChange={(e) => setFormData({ ...formData, courseId: e.target.value })}
                  className="input w-full"
                  required
                  disabled={!!editingCheckin}
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
                <label className="label">打卡标题 *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="input w-full"
                  placeholder="请输入打卡标题"
                  required
                />
              </div>

              {/* Rich Text Content */}
              <div>
                <label className="label">打卡内容</label>
                <RichTextEditor
                  value={formData.content}
                  onChange={(content) => setFormData({ ...formData, content })}
                  placeholder="请输入打卡内容..."
                  height="150px"
                />
              </div>

              {/* End Time */}
              <div>
                <label className="label">截止时间</label>
                <input
                  type="datetime-local"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className="input w-full"
                />
                <p className="text-xs text-gray-500 mt-1">设置后，学生需在截止时间前完成打卡</p>
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

              {/* Allow View Others */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="allowViewOthers"
                  checked={formData.allowViewOthers}
                  onChange={(e) => setFormData({ ...formData, allowViewOthers: e.target.checked })}
                  className="w-4 h-4 text-primary rounded"
                />
                <label htmlFor="allowViewOthers" className="text-sm text-gray-700">
                  允许学生查看其他人的打卡内容
                </label>
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
                            onError={handleImageError}
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

              {/* Actions */}
              <div className="flex space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false)
                    setEditingCheckin(null)
                    resetForm()
                  }}
                  className="flex-1 btn-secondary"
                >
                  取消
                </button>
                <button type="submit" className="flex-1 btn-primary">
                  {editingCheckin ? '保存修改' : '创建打卡'}
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
      {showSubmissionsModal && selectedCheckin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto py-10">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 my-auto max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">打卡提交列表</h2>
                <p className="text-sm text-gray-500 mt-1">{selectedCheckin.title}</p>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => handleExport(selectedCheckin)}
                  className="btn-secondary flex items-center space-x-2"
                >
                  <Download className="w-4 h-4" />
                  <span>导出数据</span>
                </button>
                <button
                  onClick={() => {
                    setShowSubmissionsModal(false)
                    setSelectedCheckin(null)
                    setSubmissions([])
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              {/* Stats */}
              <div className="flex items-center space-x-4 mb-4">
                <span className="text-sm text-gray-500">
                  共 {submissions.length} 人提交
                </span>
              </div>

              {submissionsLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
              ) : submissions.length === 0 ? (
                <div className="text-center py-12">
                  <Camera className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">暂无提交</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {submissions.map((submission) => (
                    <div
                      key={submission.id}
                      className="border rounded-lg p-4 bg-white border-gray-200"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                            <Users className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-800">
                              {submission.student.nickname || submission.student.username}
                            </p>
                            <p className="text-sm text-gray-500">
                              提交时间: {new Date(submission.createdAt).toLocaleString('zh-CN')}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* 提交内容 */}
                      {submission.content && (
                        <div className="mt-3 p-3 bg-gray-50 rounded text-sm text-gray-700">
                          <p className="whitespace-pre-wrap">{submission.content}</p>
                        </div>
                      )}

                      {/* 提交图片 */}
                      {submission.images && submission.images.length > 0 && (
                        <div className="mt-3">
                          <p className="text-sm font-medium text-gray-700 mb-2">提交图片:</p>
                          <div className="grid grid-cols-4 gap-2">
                            {submission.images.map((imageUrl, index) => {
                              const normalizedUrl = normalizeImageUrl(imageUrl)
                              return (
                                <a
                                  key={index}
                                  href={normalizedUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="relative aspect-square rounded-lg overflow-hidden border hover:border-primary transition-colors"
                                >
                                  <img
                                    src={normalizedUrl}
                                    alt={`提交图片 ${index + 1}`}
                                    className="w-full h-full object-cover"
                                    onError={handleImageError}
                                  />
                                </a>
                              )
                            })}
                          </div>
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
    </ProductPage>
  )
}

export default CheckinList
