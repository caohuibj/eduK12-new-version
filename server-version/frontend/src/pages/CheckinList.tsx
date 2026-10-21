import { CatalogFilters, CatalogPagination } from '../training/TrainingCatalogControls'
import { useCatalogQuery } from '../training/useCatalogQuery'
import { useCursorList } from '../hooks/useCursorList'
import { isTrainingHost } from '../training/context'
import { useEditorGuard } from '../components/shared-ui/useEditorGuard'
import ModalSurface from '../components/shared-ui/ModalSurface'
import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Camera, Trash2, Users, Video, Image as ImageIcon, Download, X, FileText } from 'lucide-react'
import apiClient from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { resolveTrainingCoursePrefill } from '../training/resolveCoursePrefill'
import { sessionFetch } from '../api/client'
import RichTextEditor from '../components/RichTextEditor'
import MediaSelector, { MediaItem } from '../components/MediaSelector'
import TagBadge from '../components/TagBadge'
import TagInput from '../components/TagInput'
import CheckinTokenManager from '../components/CheckinTokenManager'
import {} from '../utils/sanitize'
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

// A changed deep-link/auth identity must never display the previous record or editor.
const CheckinList: React.FC = () => {
  const { user } = useAuth()
  const [params] = useSearchParams()
  return <CheckinListContent key={JSON.stringify([user?.id, user?.role, params.get('courseId'), params.get('id')])} />
}

const CheckinListContent: React.FC = () => {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedCourseId = searchParams.get('courseId')
  const focusId = searchParams.get('id')
  const { feedback, confirm, success, error: showError, info } = useStaffFeedback()
  const showMessage = (message: unknown) => info('操作提示', String(message || '操作完成'))
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const mounted = useRef(true)
  const loadSequence = useRef(0)
  const detailSequence = useRef(0)
  const [openingDetail,setOpeningDetail]=useState(false)
  const catalog = useCatalogQuery()
  const [filterRevision,setFilterRevision]=useState(0)
  const [total, setTotal] = useState(0)
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
  
  // 提交列表弹窗状态
  const [showSubmissionsModal, setShowSubmissionsModal] = useState(false)
  const [selectedCheckin, setSelectedCheckin] = useState<Checkin | null>(null)
  const { list: submissions, loading: submissionsLoading, error: submissionsError, total: submissionsTotal, more: moreSubmissions, refresh: refreshSubmissions, hasMore: moreSubmissionsAvailable } = useCursorList<CheckinSubmission>(showSubmissionsModal && selectedCheckin ? `/checkins/${selectedCheckin.id}/submissions` : null)

  useEffect(() => {
    mounted.current = true
    void fetchCourses()
    return () => { mounted.current = false; loadSequence.current++ }
  }, [])

  useEffect(() => { void fetchCheckins(); return () => { loadSequence.current++ } }, [catalog.params, focusId, requestedCourseId])

  // Permit a course page to open the existing check-in editor with its
  // course preselected. Never accept a course not in the authorized roster.
  useEffect(() => {
    const requested = searchParams.get('courseId')
    if (searchParams.get('create') !== 'true' || !requested) return
    if (!courses.some(course => course.id === requested)) return
    setEditingCheckin(null)
    setFormData({
      courseId: requested,
      title: '',
      content: '',
      videos: [],
      images: [],
      documents: [],
      endTime: '',
      allowViewOthers: false,
      tags: [],
    })
    setShowModal(true)
    const next = new URLSearchParams(searchParams)
    next.delete('create')
    setSearchParams(next, { replace: true })
  }, [courses, searchParams, setSearchParams])

  useEffect(() => {
    if (loading || !focusId) return
    const element = document.getElementById(`checkin-record-${focusId}`)
    if (!element) return
    element.scrollIntoView({ block: 'center' })
    element.focus()
  }, [loading, focusId])

  const fetchCheckins = async () => {
    if (!mounted.current) return
    const request = ++loadSequence.current
    setLoading(true)
    setLoadError(null)
    setCheckins([])
    try {
      if (focusId) {
        // Resolve the authorized record directly, including records beyond list page 1.
        const detailPath = `/checkins/${encodeURIComponent(focusId)}` + (requestedCourseId ? `?courseId=${encodeURIComponent(requestedCourseId)}` : '')
        const response = await apiClient.get<Checkin>(detailPath)
        if (request !== loadSequence.current) return
        if (response.code !== 0 || !response.data) throw new Error(response.message || '无法读取打卡')
        const record = response.data
        if (record.id !== focusId || !record.courseId
          || (requestedCourseId && record.courseId !== requestedCourseId)
          || record.course?.id !== record.courseId
          || (user?.role === 'TEACHER' && record.course?.creatorId !== user.id)) {
          throw new Error('无法管理此课程的打卡')
        }
        setCheckins([record])
      } else {
        const path = '/checkins?view=summary&' + catalog.params + (requestedCourseId ? `&courseId=${encodeURIComponent(requestedCourseId)}` : '')
        const response = await apiClient.get<{ list: Checkin[]; total: number }>(path)
        if (request !== loadSequence.current) return
        if (response.code !== 0) throw new Error(response.message || '获取打卡列表失败')
        setCheckins(response.data.list)
        setTotal(response.data.total ?? response.data.list.length)
      }
    } catch (error) {
      if (request !== loadSequence.current) return
      setCheckins([])
      setLoadError(error instanceof Error ? error.message : '获取打卡列表失败')
    } finally {
      if (request === loadSequence.current) setLoading(false)
    }
  }

  const fetchCourses = async () => {
    try {
      const response = await apiClient.get<{ list: Course[] }>('/courses')
      if (response.code === 0) {
        const list = response.data.list
        const appended = searchParams.get('create') === 'true'
          ? await resolveTrainingCoursePrefill({
            courseId: searchParams.get('courseId'),
            userId: user?.id,
            knownIds: list.map(course => course.id),
          }) : null
        if (mounted.current) setCourses(appended ? [...list, appended] : list)
      }
    } catch (error) {
      console.error('获取课程列表失败:', error)
    }
  }


  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editorGuard.begin()) return
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
      if (response.code !== 0) throw new Error(response.message || '保存失败')
      if (response.code === 0) {
        setShowModal(false)
        resetForm()
        setFilterRevision(value=>value+1)
        if (focusId || requestedCourseId !== data.courseId || ['search','tags','from','to','page'].some(key=>searchParams.has(key))) {
          const next=new URLSearchParams(searchParams)
          for(const key of ['id','create','search','tags','from','to','page'])next.delete(key)
          next.set('courseId',data.courseId);setSearchParams(next,{replace:true})
        } else void fetchCheckins()
      }
    } catch (error: any) {
      editorGuard.fail(String(error.message || '创建失败'))
    } finally {
      editorGuard.finish()
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCheckin) return

    if (!editorGuard.begin()) return
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
      if (response.code !== 0) throw new Error(response.message || '保存失败')
      if (response.code === 0) {
        setShowModal(false)
        setEditingCheckin(null)
        resetForm()
        fetchCheckins()
      }
    } catch (error: any) {
      editorGuard.fail(String(error.message || '更新失败'))
    } finally {
      editorGuard.finish()
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
      const full = await loadFullRecord(checkin)
      if (!full) return
      checkin = full
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
      showMessage(error.message || '导出失败')
    }
  }

  // 打开提交列表弹窗
  const openSubmissionsModal = (checkin: Checkin) => {
    setSelectedCheckin(checkin)
    setShowSubmissionsModal(true)
  }

  const openCreateModal = () => {
    resetForm()
    setEditingCheckin(null)
    setShowModal(true)
  }

  const loadFullRecord = async (row: Checkin): Promise<Checkin | null> => {
    const token=++detailSequence.current
    if (!(row as Checkin & {summary?:boolean}).summary) return mounted.current ? row : null
    setOpeningDetail(true)
    const sequence = loadSequence.current
    try {
      const response = await apiClient.get<Checkin>(`/checkins/${encodeURIComponent(row.id)}?courseId=${encodeURIComponent(row.courseId)}`)
      if (!mounted.current || sequence !== loadSequence.current || token !== detailSequence.current) return null
      const record = response.data
      if (response.code !== 0 || !record || record.id !== row.id || record.courseId !== row.courseId || record.course?.id !== row.courseId || (user?.role === 'TEACHER' && record.course.creatorId !== user.id)) throw new Error(response.message || '无法读取完整内容')
      return record
    } catch (cause) { if(mounted.current && token===detailSequence.current) showError('读取失败', cause instanceof Error ? cause.message : '请重试'); return null }
    finally { if(mounted.current && token===detailSequence.current)setOpeningDetail(false) }
  }

  const openEditModal = async (row: Checkin) => {
    const checkin = await loadFullRecord(row)
    if (!checkin) return
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

  const filteredCheckins = checkins

  const closeEditor = () => {
    setShowModal(false)
    setEditingCheckin(null)
    resetForm()
  }

  const closeSubmissions = () => {
    setShowSubmissionsModal(false)
    setSelectedCheckin(null)
  }

  const editorGuard = useEditorGuard({ open: showModal, value: formData, onClose: closeEditor })

  return (
    <ProductPage width="management" className="space-y-6">
      <PageHeader title="打卡管理" description="集中查看课程打卡、参与情况和截止时间。" actions={<ProductButton variant="primary" onClick={openCreateModal}><Plus className="w-4 h-4" aria-hidden="true" />创建打卡</ProductButton>} />
      {feedback}
      {openingDetail && <p role="status">正在读取打卡完整内容…</p>}
      {!focusId && <CatalogFilters key={filterRevision+catalog.stateKey} selection={catalog.selection} onApply={catalog.apply} deadline label="打卡"/>}
      {loading ? <ProductStatus kind="pending" title="正在加载打卡">正在读取打卡和参与概况。</ProductStatus>
      : loadError ? <ProductStatus kind="error" title="打卡列表加载失败" actions={<ProductButton onClick={() => void fetchCheckins()}>重试</ProductButton>}>{loadError}</ProductStatus>
      : filteredCheckins.length === 0 ? <ProductStatus kind="info" title="暂无匹配打卡">可以调整筛选条件，或创建第一项打卡。</ProductStatus>
      : <div className={`staff-table-container ${isTrainingHost() ? "staff-record-table" : ""}`}><table className="staff-table"><thead><tr><th>打卡</th><th>课程</th><th>截止时间</th><th>参与</th><th>公开参与</th><th className="text-right">操作</th></tr></thead><tbody>
        {filteredCheckins.map(checkin=><tr id={`checkin-record-${checkin.id}`} tabIndex={-1} key={checkin.id} className={focusId===checkin.id?'staff-target-row':''}>
          <td><button type="button" className="staff-record-button" onClick={()=>openEditModal(checkin)}>{checkin.title}</button>{checkin.tags?.length?<div className="staff-inline-tags">{checkin.tags.slice(0,2).map((tag,index)=><TagBadge key={index} tag={tag}/>)}</div>:null}</td>
          <td data-label="课程" className="staff-record-course">{checkin.course?.title || '未知课程'}</td>
          <td data-label="截止时间">{checkin.endTime ? new Date(checkin.endTime).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '无截止时间'}</td>
          <td data-label="参与"><button type="button" className="staff-text-action" onClick={()=>openSubmissionsModal(checkin)}>{checkin._count?.submissions || 0} 人参与</button></td>
          <td data-label="公开参与"><span className={`staff-badge ${checkin.allowAnonymous?'staff-badge--success':''}`}>{checkin.allowAnonymous?'已开启':'未开启'}</span></td>
          <td><div className="staff-table-actions"><ProductButton onClick={()=>openSubmissionsModal(checkin)}>查看提交</ProductButton><MoreActions label={`${checkin.title} 的更多操作`}><CheckinTokenManager checkinId={checkin.id} checkinTitle={checkin.title} allowAnonymous={checkin.allowAnonymous||false} onAllowAnonymousChange={value=>setCheckins(current=>current.map(item=>item.id===checkin.id?{...item,allowAnonymous:value}:item))}/><button type="button" onClick={()=>void handleExport(checkin)}>导出数据</button><button type="button" onClick={()=>void handleClone(checkin)}>复制打卡</button><button type="button" onClick={()=>openEditModal(checkin)}>编辑打卡</button><button type="button" className="staff-danger-action" onClick={()=>void handleDelete(checkin)}>删除打卡</button></MoreActions></div></td>
        </tr>)}
      </tbody></table></div>}
      {!focusId && <CatalogPagination selection={catalog.selection} onApply={catalog.apply} total={total} loading={loading} label="打卡"/>}
      {/* Create/Edit Modal */}
      {showModal && (
        <ModalSurface open onClose={editorGuard.close} className="staff-modal-backdrop">
          <form onSubmit={editingCheckin ? handleUpdate : handleCreate} className="staff-dialog" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="checkin-editor-title" aria-busy={editorGuard.busy}>
            {editorGuard.error}<fieldset disabled={editorGuard.busy} className="contents">
            <div className="staff-dialog__header">
              <div>
                <h2 id="checkin-editor-title">{editingCheckin ? '编辑打卡' : '创建打卡'}</h2>
                <p className="training-editor-scroll-note">向下滚动查看完整设置</p>
                <p className="staff-dialog__description">设置课程、截止时间、参与方式与附件。</p>
              </div>
            </div>
            
            <div {...(editorGuard.busy ? { inert: '' } : {})} className="staff-dialog__body staff-form">
              {/* Course Selection */}
              <div>
                <label htmlFor="CheckinList-field-101" className="label">选择课程 *</label>
                <select id="CheckinList-field-101"
                  value={formData.courseId}
                  onChange={(e) => setFormData({ ...formData, courseId: e.target.value })}
                  className="input w-full"
                  required
                  disabled={!!editingCheckin}
                >
                  <option value="">请选择课程</option>
                  {editingCheckin?.course && !courses.some(course => course.id === editingCheckin.courseId) && <option value={editingCheckin.courseId}>{editingCheckin.course.title}</option>}
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title} (课程码: {course.courseCode})
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label htmlFor="CheckinList-field-102" className="label">打卡标题 *</label>
                <input id="CheckinList-field-102"
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
                <label htmlFor="CheckinList-field-103" className="label">截止时间</label>
                <input id="CheckinList-field-103"
                  type="datetime-local"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className="input w-full"
                />
                <p className="text-xs text-gray-500 mt-1">{isTrainingHost() ? '设置后，学员需在截止时间前完成打卡' : '设置后，学生需在截止时间前完成打卡'}</p>
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
                  className="w-4 h-4 text-action rounded"
                />
                <label htmlFor="allowViewOthers" className="text-sm text-gray-700">
                  {isTrainingHost() ? '允许学员查看其他人的打卡内容' : '允许学生查看其他人的打卡内容'}
                </label>
              </div>

              {/* Videos */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">视频</label>
                  <button
                    type="button"
                    onClick={() => handleAddMedia('video')}
                    className="text-sm text-action hover:text-action-hover flex items-center"
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
                    className="text-sm text-action hover:text-action-hover flex items-center"
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
                    className="text-sm text-action hover:text-action-hover flex items-center"
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
            </div>
            <div className="staff-dialog__actions">
              <ProductButton
                type="button"
                onClick={editorGuard.close}
              >
                取消
              </ProductButton>
              <ProductButton type="submit" variant="primary">
                {editorGuard.busy ? '保存中...' : editingCheckin ? '保存修改' : '创建打卡'}
              </ProductButton>
            </div>
            </fieldset>
          </form>
        </ModalSurface>
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
        <ModalSurface open onClose={closeSubmissions} className="staff-modal-backdrop">
          <div className="staff-dialog staff-dialog--wide" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="checkin-submissions-title">
            <div className="staff-dialog__header">
              <div>
                <h2 id="checkin-submissions-title">打卡提交列表</h2>
                <p className="staff-dialog__description">{selectedCheckin.title}</p>
              </div>
              <div className="staff-inline-actions">
                <ProductButton onClick={() => handleExport(selectedCheckin)}>
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>导出数据</span>
                </ProductButton>
                <button
                  onClick={closeSubmissions}
                  className="staff-icon-button"
                  aria-label="关闭打卡提交列表"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
            </div>
            
            <div className="staff-dialog__body">
              {/* Stats */}
              <div className="staff-toolbar staff-submission-toolbar">
                <span className="text-sm text-gray-500">
                  共 {submissionsTotal ?? submissions.length} 人提交
                </span>
              </div>

              {submissionsLoading && submissions.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-action"></div>
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
                          <div className="w-10 h-10 bg-action/10 rounded-full flex items-center justify-center">
                            <Users className="w-5 h-5 text-action" />
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
                                  className="relative aspect-square rounded-lg overflow-hidden border hover:border-action transition-colors"
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
            {submissionsError && <p role="alert">{submissionsError}<button type="button" onClick={() => void refreshSubmissions()}>重试</button></p>}
            {moreSubmissionsAvailable && <ProductButton disabled={submissionsLoading} onClick={() => void moreSubmissions()}>{submissionsLoading ? '加载中…' : '加载更多提交'}</ProductButton>}
          </div>
        </ModalSurface>
      )}
      {editorGuard.confirmation}
    </ProductPage>
  )
}

export default CheckinList
