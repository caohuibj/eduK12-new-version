import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, Search, Video as VideoIcon, Trash2, Edit, Upload, X, FileVideo, AlertCircle, Loader2, CheckCircle2, Play, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import apiClient from '../api/client'
import axios from 'axios'
import type { Video } from '../types'
import SecureVideoPlayer from '../components/SecureVideoPlayer'

// 处理中视频类型
interface ProcessingVideo {
  id: string
  title: string
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
  progress: number
  errorMessage?: string
}

// 上传队列项类型
interface UploadQueueItem {
  id: string
  file: File
  title: string
  status: 'pending' | 'uploading' | 'uploaded' | 'processing' | 'completed' | 'failed'
  uploadProgress: number
  processProgress: number
  videoId?: string
  error?: string
}

const VideoLibrary: React.FC = () => {
  const { user } = useAuth()
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [showDeleted, setShowDeleted] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [videoTitle, setVideoTitle] = useState('')
  const [processingVideos, setProcessingVideos] = useState<ProcessingVideo[]>([])
  const [playingVideo, setPlayingVideo] = useState<Video | null>(null)
  const [editingVideo, setEditingVideo] = useState<Video | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])
  const [isBatchUploading, setIsBatchUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollingIntervals = useRef<Map<string, number>>(new Map())

  const isAdmin = user?.role === 'ADMIN'

  useEffect(() => {
    fetchVideos()
    // 清理轮询
    return () => {
      pollingIntervals.current.forEach((interval) => clearInterval(interval))
      pollingIntervals.current.clear()
    }
  }, [page, keyword, showDeleted])

  const fetchVideos = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      })
      if (keyword) {
        params.set('keyword', keyword)
      }
      if (showDeleted) {
        params.set('includeDeleted', 'true')
      }
      const response = await apiClient.get(`/videos?${params.toString()}`)
      if (response.code === 0) {
        setVideos(response.data.list)
        setTotal(response.data.total)
        setTotalPages(response.data.totalPages)
      }
    } catch (error) {
      console.error('获取视频列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    setKeyword(searchKeyword)
    setPage(1)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const newItems: UploadQueueItem[] = []
    const allowedTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
    const maxSize = 500 * 1024 * 1024

    Array.from(files).forEach((file) => {
      if (!allowedTypes.includes(file.type)) {
        return
      }
      if (file.size > maxSize) {
        return
      }
      newItems.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        title: file.name.replace(/\.[^/.]+$/, ''),
        status: 'pending',
        uploadProgress: 0,
        processProgress: 0,
      })
    })

    if (newItems.length === 0) {
      setUploadError('没有有效的视频文件（支持 MP4、WebM、OGG、MOV，最大 500MB）')
      return
    }

    setUploadQueue((prev) => [...prev, ...newItems])
    setUploadError('')
    setShowUploadModal(true)
  }

  const uploadSingleFile = async (item: UploadQueueItem): Promise<boolean> => {
    const updateItem = (updates: Partial<UploadQueueItem>) => {
      setUploadQueue((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, ...updates } : i))
      )
    }

    try {
      updateItem({ status: 'uploading', uploadProgress: 0 })

      const formData = new FormData()
      formData.append('video', item.file)
      formData.append('title', item.title)

      const token = localStorage.getItem('token')

      const response = await axios.post('/api/videos/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`,
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            updateItem({ uploadProgress: progress })
          }
        },
      })

      if (response.data.code === 0) {
        const { id } = response.data.data
        updateItem({ status: 'processing', videoId: id, uploadProgress: 100 })
        startPollingQueueItem(item.id, id)
        return true
      } else {
        updateItem({ status: 'failed', error: response.data.message || '上传失败' })
        return false
      }
    } catch (error: any) {
      updateItem({ status: 'failed', error: error.message || '上传失败' })
      return false
    }
  }

  const startPollingQueueItem = (queueId: string, videoId: string) => {
    const interval = window.setInterval(async () => {
      try {
        const response = await apiClient.get(`/videos/${videoId}/status`)
        if (response.code === 0) {
          const { status, progress, errorMessage } = response.data
          
          setUploadQueue((prev) =>
            prev.map((item) =>
              item.id === queueId
                ? {
                    ...item,
                    status: status === 'COMPLETED' ? 'completed' : 'processing',
                    processProgress: progress || 0,
                    error: errorMessage,
                  }
                : item
            )
          )

          if (status === 'COMPLETED' || status === 'FAILED') {
            clearInterval(interval)
            pollingIntervals.current.delete(queueId)
            if (status === 'COMPLETED') {
              fetchVideos()
            }
          }
        }
      } catch (error) {
        console.error('轮询状态失败:', error)
      }
    }, 3000)

    pollingIntervals.current.set(queueId, interval)
  }

  const handleBatchUpload = async () => {
    const pendingItems = uploadQueue.filter((item) => item.status === 'pending')
    if (pendingItems.length === 0) return

    setIsBatchUploading(true)

    for (const item of pendingItems) {
      await uploadSingleFile(item)
    }

    setIsBatchUploading(false)
  }

  const removeFromQueue = (id: string) => {
    const interval = pollingIntervals.current.get(id)
    if (interval) {
      clearInterval(interval)
      pollingIntervals.current.delete(id)
    }
    setUploadQueue((prev) => prev.filter((item) => item.id !== id))
  }

  const clearCompletedFromQueue = () => {
    uploadQueue
      .filter((item) => item.status === 'completed' || item.status === 'failed')
      .forEach((item) => {
        const interval = pollingIntervals.current.get(item.id)
        if (interval) {
          clearInterval(interval)
          pollingIntervals.current.delete(item.id)
        }
      })
    setUploadQueue((prev) => prev.filter((item) => item.status !== 'completed' && item.status !== 'failed'))
  }

  const handleUpload = async () => {
    if (!selectedFile || !videoTitle.trim()) {
      setUploadError('请选择文件并输入视频标题')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)
    setUploadError('')

    try {
      const formData = new FormData()
      formData.append('video', selectedFile)
      formData.append('title', videoTitle.trim())

      const token = localStorage.getItem('token')
      
      const response = await axios.post('/api/videos/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`,
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            setUploadProgress(progress)
          }
        },
      })

      if (response.data.code === 0) {
        const { id, title, status, message } = response.data.data
        
        // 添加到处理中列表
        setProcessingVideos(prev => [...prev, {
          id,
          title,
          status: status || 'PENDING',
          progress: 0
        }])
        
        setShowUploadModal(false)
        setSelectedFile(null)
        setVideoTitle('')
        setUploadProgress(0)
        
        // 开始轮询处理状态
        startPollingStatus(id)
        
        // 提示用户
        alert(message || '视频上传成功，正在后台处理中...')
        
        // 刷新视频列表
        fetchVideos()
      } else {
        setUploadError(response.data.message || '上传失败')
      }
    } catch (error: any) {
      setUploadError(error.response?.data?.message || error.message || '上传失败')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (video: Video) => {
    if (!window.confirm(`确定要删除视频「${video.title}」吗？`)) return
    
    try {
      const response = await apiClient.delete(`/videos/${video.id}`)
      if (response.code === 0) {
        fetchVideos()
      }
    } catch (error: any) {
      alert(error.message || '删除失败')
    }
  }

  const handleEdit = async () => {
    if (!editingVideo || !editTitle.trim()) return
    
    setIsUpdating(true)
    try {
      const response = await apiClient.put(`/videos/${editingVideo.id}`, { title: editTitle.trim() })
      if (response.code === 0) {
        setEditingVideo(null)
        setEditTitle('')
        fetchVideos()
      } else {
        alert(response.message || '更新失败')
      }
    } catch (error: any) {
      alert(error.message || '更新失败')
    } finally {
      setIsUpdating(false)
    }
  }

  const openEditModal = (video: Video) => {
    setEditingVideo(video)
    setEditTitle(video.title)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // 轮询视频处理状态
  const startPollingStatus = useCallback((videoId: string) => {
    if (pollingIntervals.current.has(videoId)) return

    const interval = window.setInterval(async () => {
      try {
        const response = await apiClient.get(`/videos/${videoId}/status`)
        if (response.code === 0) {
          const { status, progress, errorMessage, processedUrl } = response.data
          
          setProcessingVideos(prev => 
            prev.map(v => 
              v.id === videoId 
                ? { ...v, status, progress, errorMessage }
                : v
            )
          )
          
          // 处理完成或失败，停止轮询
          if (status === 'COMPLETED' || status === 'FAILED') {
            clearInterval(interval)
            pollingIntervals.current.delete(videoId)
            
            if (status === 'COMPLETED') {
              // 从处理列表移除
              setTimeout(() => {
                setProcessingVideos(prev => prev.filter(v => v.id !== videoId))
                fetchVideos() // 刷新列表显示处理后的视频
              }, 3000)
            }
          }
        }
      } catch (error) {
        console.error('获取视频状态失败:', error)
      }
    }, 3000) // 每3秒查询一次

    pollingIntervals.current.set(videoId, interval)

    // 5分钟后自动停止轮询
    setTimeout(() => {
      if (pollingIntervals.current.has(videoId)) {
        clearInterval(interval)
        pollingIntervals.current.delete(videoId)
      }
    }, 5 * 60 * 1000)
  }, [fetchVideos])

  // 获取状态显示文本和颜色
  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'PENDING':
        return { text: '等待处理', color: 'text-gray-500', bg: 'bg-gray-100' }
      case 'PROCESSING':
        return { text: '处理中', color: 'text-blue-500', bg: 'bg-blue-100' }
      case 'COMPLETED':
        return { text: '已完成', color: 'text-green-500', bg: 'bg-green-100' }
      case 'FAILED':
        return { text: '处理失败', color: 'text-red-500', bg: 'bg-red-100' }
      default:
        return { text: '未知', color: 'text-gray-500', bg: 'bg-gray-100' }
    }
  }

  const displayVideos = videos

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="搜索视频..."
              className="input pl-10 w-64"
            />
          </div>
          <button onClick={handleSearch} className="btn-secondary">
            搜索
          </button>
          {isAdmin && (
            <label className="flex items-center space-x-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => {
                  setShowDeleted(e.target.checked)
                  setPage(1)
                }}
                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span>显示已删除</span>
            </label>
          )}
        </div>
        <button
          onClick={() => {
            setShowUploadModal(true)
            setUploadError('')
            setSelectedFile(null)
            setVideoTitle('')
            setUploadProgress(0)
          }}
          className="btn-primary flex items-center space-x-2"
        >
          <Upload className="w-4 h-4" />
          <span>上传视频</span>
        </button>
      </div>

      {/* Processing Videos */}
      {processingVideos.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-3 flex items-center">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            处理中的视频 ({processingVideos.length})
          </h3>
          <div className="space-y-3">
            {processingVideos.map((video) => {
              const statusDisplay = getStatusDisplay(video.status)
              return (
                <div key={video.id} className="bg-white rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm truncate flex-1">{video.title}</span>
                    <span className={`text-xs px-2 py-1 rounded ${statusDisplay.bg} ${statusDisplay.color}`}>
                      {statusDisplay.text}
                    </span>
                  </div>
                  
                  {video.status === 'PROCESSING' && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>转码进度</span>
                        <span>{video.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${video.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  {video.status === 'COMPLETED' && (
                    <div className="flex items-center text-green-600 text-xs">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      处理完成，正在刷新...
                    </div>
                  )}
                  
                  {video.status === 'FAILED' && (
                    <div className="text-red-500 text-xs">
                      处理失败: {video.errorMessage || '未知错误'}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Video Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : displayVideos.length === 0 ? (
        <div className="text-center py-12">
          <VideoIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">暂无视频</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayVideos.map((video) => {
            // @ts-expect-error - isProcessed 是后端返回但尚未进入旧版前端类型的字段
            const isProcessed = video.isProcessed || (video as any).status === 'COMPLETED'
            return (
            <div key={video.id} className="card hover:shadow-lg transition-shadow">
              {/* Video Thumbnail */}
              <div className="aspect-video bg-gray-900 rounded-lg mb-4 flex items-center justify-center relative group">
                <VideoIcon className="w-12 h-12 text-gray-600" />
                {/* 处理状态标签 */}
                {(video as any).status && (video as any).status !== 'COMPLETED' && (
                  <div className="absolute top-2 left-2 px-2 py-1 bg-yellow-500 text-white text-xs rounded">
                    {(video as any).status === 'PENDING' ? '等待处理' : '处理中'}
                  </div>
                )}
                {/* 已处理标签 */}
                {isProcessed && (
                  <div className="absolute top-2 right-2 px-2 py-1 bg-green-500 text-white text-xs rounded flex items-center">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {(video as any).resolution || '480p'}
                  </div>
                )}
                {video.url && (
                  <button
                    onClick={() => setPlayingVideo(video)}
                    className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all"
                  >
                    <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                      <Play className="w-6 h-6 mr-2" />
                      点击播放
                    </span>
                  </button>
                )}
              </div>

              {/* Video Info */}
              <h3 className="text-lg font-semibold text-gray-800 mb-2 break-words">{video.title}</h3>
              
              <div className="space-y-1 text-sm text-gray-500 mb-4">
                <div className="flex items-center space-x-2">
                  <FileVideo className="w-4 h-4" />
                  <span>{formatFileSize(video.fileSize)}</span>
                </div>
                <div>格式: {video.mimeType?.split('/')[1]?.toUpperCase() || '未知'}</div>
                <div>使用 {video.usageCount} 次</div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t">
                <button 
                  onClick={() => openEditModal(video)}
                  className="text-primary hover:text-primary-hover text-sm"
                >
                  编辑标题
                </button>
                {(isAdmin || video.teacherId === user?.id) && (
                  <button
                    onClick={() => handleDelete(video)}
                    className="p-1 text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )})}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <div className="text-sm text-gray-500">
            共 {total} 个视频，第 {page}/{totalPages} 页
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 5) {
                pageNum = i + 1
              } else if (page <= 3) {
                pageNum = i + 1
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i
              } else {
                pageNum = page - 2 + i
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-8 h-8 rounded-lg text-sm ${
                    pageNum === page
                      ? 'bg-primary text-white'
                      : 'border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </button>
              )
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                批量上传视频 {uploadQueue.length > 0 && `(${uploadQueue.length} 个文件)`}
              </h2>
              <button
                onClick={() => !isBatchUploading && setShowUploadModal(false)}
                className="text-gray-400 hover:text-gray-600"
                disabled={isBatchUploading}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              {/* Add Files Button */}
              <div
                onClick={() => !isBatchUploading && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors border-gray-300 hover:border-primary ${isBatchUploading ? 'pointer-events-none opacity-50' : ''}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/ogg,video/quicktime"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={isBatchUploading}
                />
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">点击添加视频文件（支持多选）</p>
                <p className="text-sm text-gray-400 mt-1">
                  支持 MP4、WebM、OGG、MOV 格式，最大 500MB
                </p>
              </div>

              {/* Upload Queue */}
              {uploadQueue.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-700">上传队列</h3>
                    <div className="flex space-x-2">
                      <button
                        onClick={clearCompletedFromQueue}
                        className="text-sm text-gray-500 hover:text-gray-700"
                        disabled={isBatchUploading}
                      >
                        清除已完成
                      </button>
                    </div>
                  </div>
                  
                  {uploadQueue.map((item) => (
                    <div key={item.id} className="border rounded-lg p-3 bg-gray-50">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <VideoIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="font-medium text-sm truncate">{item.title}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{formatFileSize(item.file.size)}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          {item.status === 'pending' && (
                            <button
                              onClick={() => removeFromQueue(item.id)}
                              className="text-gray-400 hover:text-red-500"
                              disabled={isBatchUploading}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                          {item.status === 'completed' && (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                          )}
                          {item.status === 'failed' && (
                            <AlertCircle className="w-5 h-5 text-red-500" />
                          )}
                          {(item.status === 'uploading' || item.status === 'processing') && (
                            <Loader2 className="w-5 h-5 text-primary animate-spin" />
                          )}
                        </div>
                      </div>
                      
                      {/* Status */}
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span>
                          {item.status === 'pending' && '等待上传'}
                          {item.status === 'uploading' && '上传中...'}
                          {item.status === 'uploaded' && '上传完成'}
                          {item.status === 'processing' && '处理中...'}
                          {item.status === 'completed' && '完成'}
                          {item.status === 'failed' && (item.error || '失败')}
                        </span>
                        <span>
                          {item.status === 'uploading' && `${item.uploadProgress}%`}
                          {item.status === 'processing' && `${item.processProgress}%`}
                        </span>
                      </div>
                      
                      {/* Progress Bar */}
                      {(item.status === 'uploading' || item.status === 'processing') && (
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all duration-300 ${
                              item.status === 'uploading' ? 'bg-blue-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${item.status === 'uploading' ? item.uploadProgress : item.processProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Error */}
              {uploadError && (
                <div className="flex items-start space-x-2 text-red-600 text-sm bg-red-50 p-3 rounded">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 border-t flex space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowUploadModal(false)
                  setUploadQueue([])
                  setUploadError('')
                }}
                className="flex-1 btn-secondary"
                disabled={isBatchUploading}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleBatchUpload}
                disabled={uploadQueue.filter(i => i.status === 'pending').length === 0 || isBatchUploading}
                className="flex-1 btn-primary disabled:opacity-50"
              >
                {isBatchUploading ? '上传中...' : `开始上传 (${uploadQueue.filter(i => i.status === 'pending').length} 个文件)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Player Modal */}
      {playingVideo && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
          <div className="bg-black rounded-lg overflow-hidden max-w-5xl w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-white font-medium truncate flex-1 mr-4">
                {playingVideo.title}
              </h3>
              <button
                onClick={() => setPlayingVideo(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4">
              <SecureVideoPlayer
                src={playingVideo.url || `/uploads/videos/${playingVideo.fileName}`}
                title={playingVideo.title}
                userId={user?.id}
                watermarkText="慧育空间专属教学资料"
                className="w-full"
              />
            </div>
          </div>
        </div>
      )}

      {/* Edit Video Modal */}
      {editingVideo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">编辑视频标题</h3>
              <button
                onClick={() => {
                  setEditingVideo(null)
                  setEditTitle('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">视频标题</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="input w-full"
                  placeholder="请输入视频标题"
                  disabled={isUpdating}
                />
              </div>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingVideo(null)
                    setEditTitle('')
                  }}
                  className="flex-1 btn-secondary"
                  disabled={isUpdating}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleEdit}
                  disabled={!editTitle.trim() || isUpdating}
                  className="flex-1 btn-primary disabled:opacity-50"
                >
                  {isUpdating ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VideoLibrary
