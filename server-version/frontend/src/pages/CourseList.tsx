import React, { useState, useEffect, useRef } from 'react'
import { Plus, Search, Trash2, Edit, Users, BookOpen, UserCog, Flag, Copy, PauseCircle, PlayCircle, Image as ImageIcon, X, Share2, Inbox, UserPlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import apiClient from '../api/client'
import axios from 'axios'
import type { Course, CourseShare, User } from '../types'

const CourseList: React.FC = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [courses, setCourses] = useState<Course[]>([])
  const [sharedToMe, setSharedToMe] = useState<CourseShare[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [formData, setFormData] = useState({ title: '', description: '' })
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const response = await apiClient.post('/courses', formData)
      if (response.code === 0) {
        alert(`课程创建成功！课程码: ${response.data.courseCode}`)
        setShowCreateModal(false)
        setFormData({ title: '', description: '' })
        fetchCourses()
      }
    } catch (error: any) {
      alert(error.message || '创建失败')
    }
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCourse) return

    try {
      const response = await apiClient.put(`/courses/${editingCourse.id}`, formData)
      if (response.code === 0) {
        setEditingCourse(null)
        setFormData({ title: '', description: '' })
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
    const confirmMsg = course.studentCount && course.studentCount > 0
      ? `警告：结束课程将冻结该课程的 ${course.studentCount} 名学生账号！\n\n此操作不可撤销，确定要继续吗？`
      : '确定要结束这门课程吗？\n\n此操作不可撤销。'

    if (!window.confirm(confirmMsg)) return

    try {
      const response = await apiClient.post(`/courses/${course.id}/end`)
      if (response.code === 0) {
        alert(`课程已结束，${response.data?.frozenStudents || 0} 名学生账号已冻结`)
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

      const token = localStorage.getItem('token')
      const response = await axios.post(`/api/courses/${courseId}/cover`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`,
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
  const getCourseStatusLabel = (course: Course) => {
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {/* Tab 切换 */}
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('my')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'my'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              我的课程
            </button>
            <button
              onClick={() => setActiveTab('shared')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1 ${
                activeTab === 'shared'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Inbox className="w-4 h-4" />
              <span>分享给我的</span>
              {sharedToMe.length > 0 && (
                <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {sharedToMe.length}
                </span>
              )}
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索课程..."
              className="input pl-10 w-64"
            />
          </div>
        </div>
        {activeTab === 'my' && (
          <button
            onClick={() => {
              setFormData({ title: '', description: '' })
              setShowCreateModal(true)
            }}
            className="btn-primary flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>创建课程</span>
          </button>
        )}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map((course) => {
              const status = getCourseStatusLabel(course)
              return (
                <div 
                key={course.id} 
                className="card hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/courses/${course.id}/detail`)}
              >
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
                      <p className="text-sm text-gray-500">课程码: {course.courseCode}</p>
                    </div>
                    <div className="flex space-x-1 ml-2" onClick={(e) => e.stopPropagation()}>
                      {/* 分享课程 - 仅管理员可分享自己创建的课程 v2 */}
                      {isAdmin && course.creatorId === user?.id && (
                        <button
                          onClick={() => openShareModal(course)}
                          className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg"
                          title="分享课程"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                      )}
                      {/* 复制课程 */}
                      <button
                        onClick={() => handleCloneCourse(course)}
                        className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded"
                        title="复制课程"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      {/* 停止/恢复招募 */}
                      {course.status === 'PUBLISHED' && (
                        course.isRecruiting ? (
                          <button
                            onClick={() => handleStopRecruiting(course)}
                            className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded"
                            title="停止招募"
                          >
                            <PauseCircle className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleResumeRecruiting(course)}
                            className="p-2 text-gray-400 hover:text-green-500 hover:bg-green-50 rounded"
                            title="恢复招募"
                          >
                            <PlayCircle className="w-4 h-4" />
                          </button>
                        )
                      )}
                      {/* 结束课程 */}
                      {course.status !== 'COMPLETED' && (
                        <button
                          onClick={() => handleEndCourse(course)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                          title="结束课程"
                        >
                          <Flag className="w-4 h-4" />
                        </button>
                      )}
                      {/* 编辑 */}
                      <button
                        onClick={() => openEditModal(course)}
                        className="p-2 text-gray-400 hover:text-primary hover:bg-blue-50 rounded"
                        title="编辑"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      {/* 删除 */}
                      <button
                        onClick={() => handleDelete(course)}
                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                    {course.description || '暂无描述'}
                  </p>

                  <div className="flex items-center justify-between text-sm">
                    <button
                      onClick={() => navigate(`/courses/${course.id}/students`)}
                      className="flex items-center space-x-1 hover:text-primary transition-colors"
                    >
                      <Users className="w-4 h-4" />
                      <span>{course.studentCount || 0} 名学生</span>
                    </button>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => navigate(`/courses/${course.id}/students`)}
                        className="p-1.5 text-gray-400 hover:text-primary hover:bg-blue-50 rounded"
                        title="管理学生"
                      >
                        <UserCog className="w-4 h-4" />
                      </button>
                      <span className={`px-2 py-1 rounded text-xs ${status.className}`}>
                        {status.text}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
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
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
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
                  {editingCourse ? '保存' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && sharingCourse && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
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
    </div>
  )
}

export default CourseList
