import React, { useState, useEffect, useRef } from 'react'
import { Plus, Search, Trash2, Edit, Users, BookOpen, UserCog, Flag, Copy, PauseCircle, PlayCircle, Image as ImageIcon, X, Share2, Inbox, UserPlus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import apiClient from '../api/client'
import { ensureCsrfToken } from '../api/client'
import { sessionAxios } from '../api/client'
import type { Course, CourseShare, User } from '../types'
import { PageHeader, ProductButton, ProductPage } from '../components/product-ui'
import MoreActions from '../components/staff-ui/MoreActions'

const CourseList: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [courses, setCourses] = useState<Course[]>([])
  const [sharedToMe, setSharedToMe] = useState<CourseShare[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [formData, setFormData] = useState({ title: '', description: '', isLibrary: false })
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string>('')
  const [isUploadingCover, setIsUploadingCover] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // 分享相关状态
  const [showShareModal, setShowShareModal] = useState(false)
  const [sharingCourse, setSharingCourse] = useState<Course | null>(null)
  const [userList, setUserList] = useState<User[]>([])
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [userKeyword, setUserKeyword] = useState('')
  const [activeTab, setActiveTab] = useState<'my' | 'shared'>('my')

  const isAdmin = user?.role === 'ADMIN'

  useEffect(() => {
    fetchCourses()
    fetchSharedToMe()
  }, [])

  const fetchCourses = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get('/courses')
      if (response.code === 0) {
        setCourses(response.data.list)
      }
    } catch (error) {
      console.error('获取课程列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchSharedToMe = async () => {
    try {
      const response = await apiClient.get('/courses/shared-to-me')
      if (response.code === 0) {
        setSharedToMe(response.data.list)
      }
    } catch (error) {
      console.error('获取分享列表失败:', error)
    }
  }

  const coursePayload = () => {
    const payload: { title: string; description: string; isLibrary?: boolean } = {
      title: formData.title,
      description: formData.description,
    }
    if (isAdmin) payload.isLibrary = formData.isLibrary
    return payload
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const response = await apiClient.post('/courses', coursePayload())
      if (response.code === 0) {
        alert(`课程创建成功！课程码: ${response.data.courseCode}`)
        setShowCreateModal(false)
        setFormData({ title: '', description: '', isLibrary: false })
        fetchCourses()
      }
    } catch (error: any) {
      alert(error.message || '创建失败')
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCourse) return
    if (isAdmin && formData.isLibrary && !editingCourse.isLibrary) {
      if (!window.confirm('标记为库课程后将停止招募，学生无法加入或作答。确定继续？')) return
    }

    try {
      const response = await apiClient.put(`/courses/${editingCourse.id}`, coursePayload())
      if (response.code === 0) {
        setEditingCourse(null)
        setFormData({ title: '', description: '', isLibrary: false })
        fetchCourses()
      }
    } catch (error: any) {
      alert(error.message || '更新失败')
    }
  }

  const handleDelete = async (course: Course) => {
    const hasStudents = course.studentCount && course.studentCount > 0
    const confirmMsg = hasStudents
      ? `警告：该课程有 ${course.studentCount} 名学生！\n\n确定要删除吗？`
      : '确定要删除这门课程吗？'

    if (!window.confirm(confirmMsg)) return

    try {
      const response = await apiClient.delete(`/courses/${course.id}`)
      if (response.code === 0) {
        fetchCourses()
      }
    } catch (error: any) {
      alert(error.message || '删除失败')
    }
  }

  const handleEndCourse = async (course: Course) => {
    const confirmMsg = '确定要结束这门课程吗？\n\n结束后将停止招募，已加入的学生账号不会被冻结，他们仍可登录并参加其他课程。此操作不可撤销。'

    if (!window.confirm(confirmMsg)) return

    try {
      const response = await apiClient.post(`/courses/${course.id}/end`)
      if (response.code === 0) {
        alert(response.message || '课程已结束')
        fetchCourses()
      }
    } catch (error: any) {
      alert(error.message || '结束课程失败')
    }
  }

  const handleStopRecruiting = async (course: Course) => {
    if (!window.confirm(`确定要停止课程「${course.title}」的招募吗？\n\n停止后，新学生将无法通过课程码加入，但已加入的学生不受影响。`)) {
      return
    }

    try {
      const response = await apiClient.post(`/courses/${course.id}/stop-recruiting`)
      if (response.code === 0) {
        alert('课程已停止招募')
        fetchCourses()
      }
    } catch (error: any) {
      alert(error.message || '操作失败')
    }
  }

  const handleResumeRecruiting = async (course: Course) => {
    if (!window.confirm(`确定要恢复课程「${course.title}」的招募吗？`)) {
      return
    }

    try {
      const response = await apiClient.post(`/courses/${course.id}/resume-recruiting`)
      if (response.code === 0) {
        alert('课程已恢复招募')
        fetchCourses()
      }
    } catch (error: any) {
      alert(error.message || '操作失败')
    }
  }

  const handleCloneCourse = async (course: Course) => {
    if (!window.confirm(`确定要复制课程「${course.title}」吗？\n\n将复制课程、作业和打卡内容（不含学生数据和作答信息），新课程将以草稿状态创建。`)) {
      return
    }

    try {
      const response = await apiClient.post(`/courses/${course.id}/clone`)
      if (response.code === 0) {
        alert(`课程复制成功！新课程码: ${response.data.courseCode}`)
        fetchCourses()
      }
    } catch (error: any) {
      alert(error.message || '复制失败')
    }
  }

  // 打开分享弹窗
  const openShareModal = async (course: Course) => {
    setSharingCourse(course)
    setSelectedUsers([])
    setUserKeyword('')
    setShowShareModal(true)
    // 获取用户列表（教师和管理员）
    try {
      const response = await apiClient.get('/users')
      if (response.code === 0) {
        const filteredUsers = response.data.list.filter(
          (u: User) => (u.role === 'TEACHER' || u.role === 'ADMIN') && u.id !== user?.id
        )
        setUserList(filteredUsers)
      }
    } catch (error) {
      console.error('获取用户列表失败:', error)
    }
  }

  // 分享课程
  const handleShare = async () => {
    if (!sharingCourse || selectedUsers.length === 0) {
      alert('请选择要分享的用户')
      return
    }

    try {
      const response = await apiClient.post(`/courses/${sharingCourse.id}/share`, {
        userIds: selectedUsers
      })
      if (response.code === 0) {
        alert(`成功分享给 ${response.data.sharedCount} 位用户`)
        setShowShareModal(false)
        setSharingCourse(null)
        setSelectedUsers([])
      }
    } catch (error: any) {
      alert(error.message || '分享失败')
    }
  }

  // 取消分享
  const handleRemoveShare = async (shareId: string) => {
    if (!window.confirm('确定要取消分享吗？')) return

    try {
      const response = await apiClient.delete(`/courses/share/${shareId}`)
      if (response.code === 0) {
        fetchSharedToMe()
      }
    } catch (error: any) {
      alert(error.message || '取消分享失败')
    }
  }

  // 从分享复制课程
  const handleCloneFromShare = async (share: CourseShare) => {
    if (!window.confirm(`确定要复制课程「${share.course?.title}」吗？\n\n将复制课程、作业和打卡内容，新课程将以草稿状态创建。`)) {
      return
    }

    try {
      const response = await apiClient.post(`/courses/share/${share.id}/clone`)
      if (response.code === 0) {
        alert(`课程复制成功！新课程码: ${response.data.courseCode}`)
        fetchCourses()
        setActiveTab('my')
      }
    } catch (error: any) {
      alert(error.message || '复制失败')
    }
  }

  // 过滤用户列表
  const filteredUserList = userList.filter(
    (u) => u.username.toLowerCase().includes(userKeyword.toLowerCase()) ||
           (u.nickname && u.nickname.toLowerCase().includes(userKeyword.toLowerCase()))
  )

  const openEditModal = (course: Course) => {
    setEditingCourse(course)
    setFormData({
      title: course.title,
      description: course.description || '',
      isLibrary: Boolean(course.isLibrary),
    })
    setCoverPreview(course.coverUrl || '')
    setCoverFile(null)
  }

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      alert('只支持 JPG、PNG、WebP、GIF 格式的图片')
      return
    }

    // 验证文件大小 (5MB)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      alert('文件大小不能超过 5MB')
      return
    }

    setCoverFile(file)
    // 创建预览
    const reader = new FileReader()
    reader.onload = (e) => {
      setCoverPreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleCoverUpload = async (courseId: string) => {
    if (!coverFile) return

    setIsUploadingCover(true)
    try {
      const formData = new FormData()
      formData.append('cover', coverFile)

      const csrfToken = await ensureCsrfToken()
      const response = await sessionAxios.post(`/courses/${courseId}/cover`, formData, {
        withCredentials: true,
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
      })

      if (response.data.code === 0) {
        alert('封面上传成功')
        fetchCourses()
        // 更新当前编辑的课程封面
        if (editingCourse) {
          setEditingCourse({
            ...editingCourse,
            coverUrl: response.data.data.coverUrl
          })
        }
      } else {
        alert(response.data.message || '上传失败')
      }
    } catch (error: any) {
      alert(error.response?.data?.message || error.message || '上传失败')
    } finally {
      setIsUploadingCover(false)
    }
  }

  const clearCover = () => {
    setCoverFile(null)
    setCoverPreview('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const filteredCourses = courses.filter(
    (course) =>
      course.title.toLowerCase().includes(keyword.toLowerCase()) ||
      course.courseCode.includes(keyword)
  )

  // 获取课程状态标签
  const canMarkLibrary = (course?: Course | null) => {
    if (!isAdmin) return false
    if (!course) return true
    return course.creator?.role === 'ADMIN' || course.creatorId === user?.id
  }

  const getCourseStatusLabel = (course: Course) => {
    if (course.isLibrary) {
      return { text: '库课程', className: 'bg-indigo-100 text-indigo-700' }
    }
    if (course.status === 'COMPLETED') {
      return { text: '已完结', className: 'bg-gray-100 text-gray-700' }
    }
    if (course.status === 'DRAFT') {
      return { text: '草稿', className: 'bg-yellow-100 text-yellow-700' }
    }
    // PUBLISHED
    if (course.isRecruiting) {
      return { text: '招募中', className: 'bg-green-100 text-green-700' }
    }
    return { text: '停止招募', className: 'bg-orange-100 text-orange-700' }
  }

  return (
    <ProductPage width="management" className="space-y-6">
      <PageHeader title="课程管理" description="管理授课课程、学生入口和课程生命周期。" actions={activeTab === 'my' ? <ProductButton variant="primary" onClick={() => { setFormData({ title: '', description: '', isLibrary: false }); setShowCreateModal(true) }}><Plus className="w-4 h-4" aria-hidden="true" />创建课程</ProductButton> : undefined} />
      <div className="staff-toolbar">
        <div className="staff-segmented" role="group" aria-label="课程范围">
          <button type="button" aria-pressed={activeTab === 'my'} onClick={() => setActiveTab('my')}>我的课程</button>
          <button type="button" aria-pressed={activeTab === 'shared'} onClick={() => setActiveTab('shared')}>分享给我的{sharedToMe.length > 0 ? `（${sharedToMe.length}）` : ''}</button>
        </div>
        <label className="staff-search-field"><Search className="w-4 h-4" aria-hidden="true" /><span className="sr-only">搜索课程</span><input type="search" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索课程名称或课程码" /></label>
      </div>
      {/* Course Grid */}
      {activeTab === 'my' ? (
        loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">暂无课程</p>
          </div>
        ) : (
          <div className="staff-course-grid">
            {filteredCourses.map(course => {
              const status = getCourseStatusLabel(course)
              return <article key={course.id} className="staff-course-card">
                {course.coverUrl ? <img src={course.coverUrl} alt="" className="staff-course-cover" /> : <div className="staff-course-cover staff-course-cover--placeholder"><BookOpen className="w-8 h-8" aria-hidden="true" /></div>}
                <div className="staff-course-card__body">
                  <div className="staff-course-card__heading">
                    <div><h2><Link to={`/courses/${course.id}/detail`}>{course.title}</Link></h2><p>课程码：{course.courseCode}</p></div>
                    <span className={`staff-badge ${course.status === 'PUBLISHED' && course.isRecruiting ? 'staff-badge--success' : course.status === 'COMPLETED' ? '' : 'staff-badge--warning'}`}>{status.text}</span>
                  </div>
                  <p className="staff-course-description">{course.description || '暂无课程描述'}</p>
                  <div className="staff-course-meta"><span><Users className="w-4 h-4" aria-hidden="true" />{course.studentCount || 0} 名学生</span>{course.isLibrary && <span>库课程</span>}</div>
                  <div className="staff-course-actions">
                    <Link className="staff-primary-link" to={`/courses/${course.id}/detail`}>进入课程</Link>
                    <Link className="staff-secondary-link" to={`/courses/${course.id}/students`}>管理学生</Link>
                    <MoreActions label={`${course.title} 的更多操作`}>
                      {isAdmin && course.creatorId === user?.id && <button type="button" onClick={() => void openShareModal(course)}>分享课程</button>}
                      <button type="button" onClick={() => void handleCloneCourse(course)}>复制课程</button>
                      {course.status === 'PUBLISHED' && !course.isLibrary && (course.isRecruiting ? <button type="button" onClick={() => void handleStopRecruiting(course)}>停止招募</button> : <button type="button" onClick={() => void handleResumeRecruiting(course)}>恢复招募</button>)}
                      <button type="button" onClick={() => openEditModal(course)}>编辑课程</button>
                      {course.status !== 'COMPLETED' && <button type="button" className="staff-danger-action" onClick={() => void handleEndCourse(course)}>结束课程</button>}
                      <button type="button" className="staff-danger-action" onClick={() => void handleDelete(course)}>删除课程</button>
                    </MoreActions>
                  </div>
                </div>
              </article>
            })}
          </div>
      ) : (
        /* 分享给我的列表 */
        sharedToMe.length === 0 ? (
          <div className="text-center py-12">
            <Inbox className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">暂无分享的课程</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sharedToMe.map((share) => {
              const course = share.course!
              return (
                <div key={share.id} className="card hover:shadow-lg transition-shadow">
                  {/* 课程封面 */}
                  {course.coverUrl && (
                    <div className="w-full h-32 mb-4 rounded-lg overflow-hidden bg-gray-100">
                      <img
                        src={course.coverUrl}
                        alt={course.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-800 mb-1 break-words" title={course.title}>{course.title}</h3>
                      <p className="text-sm text-gray-500">
                        分享者: {share.sharer?.nickname || share.sharer?.username}
                      </p>
                    </div>
                    <div className="flex space-x-1 ml-2">
                      {/* 复制课程 */}
                      <button
                        onClick={() => handleCloneFromShare(share)}
                        className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded"
                        title="复制到我的课程"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      {/* 取消分享 */}
                      <button
                        onClick={() => handleRemoveShare(share.id)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                        title="移除"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                    {course.description || '暂无描述'}
                  </p>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">
                      分享时间: {new Date(share.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => handleCloneFromShare(share)}
                      className="btn-primary text-sm py-1 px-3 flex items-center space-x-1"
                    >
                      <Copy className="w-4 h-4" />
                      <span>复制使用</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Create/Edit Modal */}
      {(showCreateModal || editingCourse) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6" role="dialog" aria-modal="true" aria-label={editingCourse ? '编辑课程' : '创建课程'}>
            <h2 className="text-xl font-semibold mb-4">
              {editingCourse ? '编辑课程' : '创建课程'}
            </h2>
            <form onSubmit={editingCourse ? handleUpdate : handleCreate} className="space-y-4">
              {/* 课程封面 */}
              {editingCourse && (
                <div>
                  <label className="label">课程封面</label>
                  <div className="space-y-2">
                    {/* 封面预览 */}
                    {(coverPreview || editingCourse.coverUrl) ? (
                      <div className="relative w-full h-32 bg-gray-100 rounded-lg overflow-hidden">
                        <img
                          src={coverPreview || editingCourse.coverUrl}
                          alt="课程封面"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={clearCover}
                          className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-32 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-gray-100 transition-colors"
                      >
                        <ImageIcon className="w-8 h-8 text-gray-400 mb-2" />
                        <span className="text-sm text-gray-500">点击上传封面</span>
                        <span className="text-xs text-gray-400 mt-1">支持 JPG、PNG、WebP，最大 5MB</span>
                      </div>
                    )}
                    
                    {/* 文件输入和操作按钮 */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleCoverSelect}
                      className="hidden"
                    />
                    
                    {(coverPreview || editingCourse.coverUrl) && (
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
                        >
                          更换封面
                        </button>
                        {coverFile && (
                          <button
                            type="button"
                            onClick={() => handleCoverUpload(editingCourse.id)}
                            disabled={isUploadingCover}
                            className="flex-1 py-2 px-4 bg-primary text-white rounded hover:bg-primary-hover disabled:opacity-50 text-sm"
                          >
                            {isUploadingCover ? '上传中...' : '保存封面'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="label">课程标题 *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="input"
                  placeholder="请输入课程标题"
                  required
                />
              </div>
              <div>
                <label className="label">课程描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input h-24 resize-none"
                  placeholder="请输入课程描述（可选）"
                />
              </div>
              {canMarkLibrary(editingCourse) && (
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={formData.isLibrary}
                    onChange={(e) => setFormData({ ...formData, isLibrary: e.target.checked })}
                  />
                  <span>
                    标记为库课程
                    <span className="block text-xs text-gray-500 mt-1">学生不可见、不可加入。管理员可在其上预编可复制的综合测评模板。</span>
                  </span>
                </label>
              )}
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false)
                    setEditingCourse(null)
                    setCoverFile(null)
                    setCoverPreview('')
                  }}
                  className="flex-1 btn-secondary"
                >
                  取消
                </button>
                <button type="submit" className="flex-1 btn-primary">
                  {editingCourse ? '保存修改' : '创建课程'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && sharingCourse && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4" role="dialog" aria-modal="true" aria-label={`分享课程「${sharingCourse.title}」`}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">分享课程「{sharingCourse.title}」</h3>
              <button
                onClick={() => {
                  setShowShareModal(false)
                  setSharingCourse(null)
                  setSelectedUsers([])
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* 搜索用户 */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  value={userKeyword}
                  onChange={(e) => setUserKeyword(e.target.value)}
                  placeholder="搜索用户名或昵称..."
                  className="input pl-9 w-full"
                />
              </div>

              {/* 用户列表 */}
              <div className="max-h-64 overflow-y-auto border rounded-lg">
                {filteredUserList.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <UserPlus className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p>暂无可分享的用户</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredUserList.map((u) => (
                      <label
                        key={u.id}
                        className="flex items-center p-3 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(u.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUsers([...selectedUsers, u.id])
                            } else {
                              setSelectedUsers(selectedUsers.filter((id) => id !== u.id))
                            }
                          }}
                          className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                        />
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-800">
                            {u.nickname || u.username}
                          </p>
                          <p className="text-xs text-gray-500">
                            {u.username} · {u.role === 'TEACHER' ? '教师' : '管理员'}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* 已选择数量 */}
              {selectedUsers.length > 0 && (
                <p className="text-sm text-gray-600">
                  已选择 <span className="font-medium text-primary">{selectedUsers.length}</span> 位用户
                </p>
              )}
            </div>

            <div className="flex space-x-3 p-4 border-t">
              <button
                onClick={() => {
                  setShowShareModal(false)
                  setSharingCourse(null)
                  setSelectedUsers([])
                }}
                className="flex-1 btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleShare}
                disabled={selectedUsers.length === 0}
                className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确认分享
              </button>
            </div>
          </div>
        </div>
      )}
    </ProductPage>
  )
}

export default CourseList
