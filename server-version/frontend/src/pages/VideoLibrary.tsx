import { useLatestRequest, requestError } from '../components/shared-ui/useLatestRequest'
import ModalSurface from '../components/shared-ui/ModalSurface'
import { useEditorGuard } from '../components/shared-ui/useEditorGuard'
import React, { useState, useEffect, useRef } from 'react'
import { Plus, Search, Video as VideoIcon, Trash2, Edit, Upload, X, FileVideo, AlertCircle, Loader2, CheckCircle2, Play, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import apiClient from '../api/client'
import { ensureCsrfToken } from '../api/client'
import { sessionAxios } from '../api/client'
import type { Video } from '../types'
import SecureVideoPlayer from '../components/SecureVideoPlayer'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../components/product-ui'
import { useStaffFeedback } from '../components/staff-ui/useStaffFeedback'

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
  const { feedback, confirm, info } = useStaffFeedback()
  const showMessage = (message: unknown) => info('操作提示', String(message || '操作完成'))
  const ask = (message: string) => confirm({ title: '确认操作', body: message, confirmLabel: '确认' })
  const { user } = useAuth()
  const [videos, setVideos] = useState<Video[]>([])
  const { loading, error: listError, run: runList, invalidate: invalidateList } = useLatestRequest()
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
  const pollingEpoch = useRef(new Map<string, number>())

  const isAdmin = user?.role === 'ADMIN'
  const listQuery = useRef({ page, keyword, showDeleted })
  listQuery.current = { page, keyword, showDeleted }
  const retrying = useRef(new Set<string>())
  const [retryingIds, setRetryingIds] = useState<string[]>([])

  const uploadGuard = useEditorGuard({ open: showUploadModal, value: uploadQueue.filter(item => item.status === 'pending' || item.status === 'failed').map(item => ({ id: item.id, title: item.title })), externalBusy: isBatchUploading, onClose: () => { setShowUploadModal(false); setUploadQueue([]); setUploadError('') } })
  const renameGuard = useEditorGuard({ open: Boolean(editingVideo), value: editTitle, externalBusy: isUpdating, onClose: () => { setEditingVideo(null); setEditTitle('') } })

  useEffect(() => {
    void fetchVideos()
    return invalidateList
  }, [page, keyword, showDeleted])

  useEffect(() => () => {
    pollingIntervals.current.forEach(interval => clearInterval(interval))
    pollingIntervals.current.clear()
    pollingEpoch.current.forEach((epoch, key) => pollingEpoch.current.set(key, epoch + 1))
  }, [])

  const fetchVideos = () => runList(async () => {
    const current = listQuery.current
    const params = new URLSearchParams({ page: String(current.page), pageSize: String(pageSize) })
    if (current.keyword) params.set('keyword', current.keyword)
    if (current.showDeleted) params.set('includeDeleted', 'true')
    const response = await apiClient.get(`/videos?${params.toString()}`)
    if (response.code !== 0) throw new Error(response.message || '获取视频列表失败')
    return response.data
  }, data => {
    setVideos(data.list)
    setTotal(data.total)
    setTotalPages(data.totalPages)
  }, '获取视频列表失败，请重试')

  const refreshVideos = useRef(fetchVideos)
  refreshVideos.current = fetchVideos

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
      updateItem({ status: 'uploading', uploadProgress: 0, error: undefined })

      const formData = new FormData()
      formData.append('video', item.file)
      formData.append('title', item.title)

      const csrfToken = await ensureCsrfToken()
      const response = await sessionAxios.post('/videos/upload', formData, {
        withCredentials: true,
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            updateItem({ uploadProgress: progress })
          }
        },
      })

      if (response.data.code === 0) {
        const { id, status } = response.data.data
        updateItem({ status: status === 'FAILED' ? 'failed' : 'processing', videoId: id, uploadProgress: 100, error: status === 'FAILED' ? '文件已上传，但转码启动失败，请重新转码' : undefined })
        if (status !== 'FAILED') startPollingQueueItem(item.id, id)
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

  const checkQueueStatus = async (queueId: string, videoId: string) => {
    const epoch = (pollingEpoch.current.get(queueId) ?? 0) + 1
    pollingEpoch.current.set(queueId, epoch)
    try {
      const response = await apiClient.get(`/videos/${videoId}/status`)
      if (pollingEpoch.current.get(queueId) !== epoch) return
      if (response.code !== 0) throw new Error(response.message || '获取处理状态失败')
      const { status, progress, errorMessage } = response.data
      setUploadQueue(prev => prev.map(item => item.id === queueId ? { ...item,
        status: status === 'COMPLETED' ? 'completed' : status === 'FAILED' ? 'failed' : 'processing',
        processProgress: progress || 0, error: status === 'FAILED' ? errorMessage || '转码失败，请重新转码' : undefined,
      } : item))
      if (status === 'COMPLETED' || status === 'FAILED') {
        const interval = pollingIntervals.current.get(queueId)
        if (interval) clearInterval(interval)
        pollingIntervals.current.delete(queueId)
        void refreshVideos.current()
      }
    } catch (error) {
      if (pollingEpoch.current.get(queueId) !== epoch) return
      setUploadQueue(prev => prev.map(item => item.id === queueId ? { ...item, error: requestError(error, '暂时无法读取转码状态，请刷新处理状态') } : item))
    }
  }

  const startPollingQueueItem = (queueId: string, videoId: string) => {
    const previous = pollingIntervals.current.get(queueId)
    if (previous) clearInterval(previous)
    let checking = false
    const interval = window.setInterval(async () => {
      if (checking) return
      checking = true
      try { await checkQueueStatus(queueId, videoId) } finally { checking = false }
    }, 3000)
    pollingIntervals.current.set(queueId, interval)
  }

  const retryTranscode = async (videoId: string, queueId?: string) => {
    if (retrying.current.has(videoId)) return
    if (queueId && !uploadGuard.begin()) return
    const key = queueId ?? videoId
    pollingEpoch.current.set(key, (pollingEpoch.current.get(key) ?? 0) + 1)
    const interval = pollingIntervals.current.get(key)
    if (interval) clearInterval(interval)
    pollingIntervals.current.delete(key)
    retrying.current.add(videoId)
    setRetryingIds([...retrying.current])
    try {
      const response = await apiClient.post(`/videos/${videoId}/retry`)
      if (response.code !== 0) throw new Error(response.message || '重新转码失败')
      if (queueId) {
        setUploadQueue(prev => prev.map(item => item.id === queueId ? { ...item, status: 'processing', processProgress: 0, error: undefined } : item))
        startPollingQueueItem(queueId, videoId)
      }
      if (!queueId) {
        const title = videos.find(item => item.id === videoId)?.title || '视频'
        setProcessingVideos(prev => prev.some(item => item.id === videoId)
          ? prev.map(item => item.id === videoId ? { ...item, status: 'PENDING', progress: 0, errorMessage: undefined } : item)
          : [...prev, { id: videoId, title, status: 'PENDING', progress: 0 }])
        startPollingStatus(videoId)
      }
      void refreshVideos.current()
    } catch (error) {
      const message = requestError(error, '重新转码失败，请刷新状态后重试')
      if (queueId) setUploadQueue(prev => prev.map(item => item.id === queueId ? { ...item, error: message } : item))
      else showMessage(message)
    } finally {
      retrying.current.delete(videoId)
      setRetryingIds([...retrying.current])
      if (queueId) uploadGuard.finish()
    }
  }

  const retryUpload = async (item: UploadQueueItem) => {
    if (item.videoId || !uploadGuard.begin()) return
    setIsBatchUploading(true)
    try { await uploadSingleFile(item) }
    finally { setIsBatchUploading(false); uploadGuard.finish() }
  }

  const handleBatchUpload = async () => {
    const pendingItems = uploadQueue.filter((item) => item.status === 'pending')
    if (pendingItems.length === 0) return

    if (!uploadGuard.begin()) return
    setIsBatchUploading(true)
    try {

    for (const item of pendingItems) {
      await uploadSingleFile(item)
    }

    } finally {
      setIsBatchUploading(false)
      uploadGuard.finish()
    }
  }

  const removeFromQueue = (id: string) => {
    pollingEpoch.current.set(id, (pollingEpoch.current.get(id) ?? 0) + 1)
    const interval = pollingIntervals.current.get(id)
    if (interval) {
      clearInterval(interval)
      pollingIntervals.current.delete(id)
    }
    setUploadQueue((prev) => prev.filter((item) => item.id !== id))
  }

  const clearCompletedFromQueue = () => {
    uploadQueue
      .filter((item) => item.status === 'completed')
      .forEach((item) => {
        const interval = pollingIntervals.current.get(item.id)
        if (interval) {
          clearInterval(interval)
          pollingIntervals.current.delete(item.id)
        }
      })
    setUploadQueue((prev) => prev.filter((item) => item.status !== 'completed'))
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

      const csrfToken = await ensureCsrfToken()
      const response = await sessionAxios.post('/videos/upload', formData, {
        withCredentials: true,
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
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
        showMessage(message || '视频上传成功，正在后台处理中...')
        
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
    if (!await ask(`确定要删除视频「${video.title}」吗？`)) return
    
    try {
      const response = await apiClient.delete(`/videos/${video.id}`)
      if (response.code === 0) {
        fetchVideos()
      }
    } catch (error: any) {
      showMessage(error.message || '删除失败')
    }
  }

  const handleEdit = async () => {
    if (!editingVideo || !editTitle.trim()) return
    
    if (!renameGuard.begin()) return
    setIsUpdating(true)
    try {
      const response = await apiClient.put(`/videos/${editingVideo.id}`, { title: editTitle.trim() })
      if (response.code === 0) {
        setEditingVideo(null)
        setEditTitle('')
        fetchVideos()
      } else {
        renameGuard.fail(String(response.message || '更新失败'))
      }
    } catch (error: any) {
      renameGuard.fail(String(error.message || '更新失败'))
    } finally {
      renameGuard.finish()
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

  const checkProcessingStatus = async (videoId: string) => {
    const epoch = (pollingEpoch.current.get(videoId) ?? 0) + 1
    pollingEpoch.current.set(videoId, epoch)
    try {
      const response = await apiClient.get(`/videos/${videoId}/status`)
      if (pollingEpoch.current.get(videoId) !== epoch) return
      if (response.code !== 0) throw new Error(response.message || '获取处理状态失败')
      const { status, progress, errorMessage } = response.data
      setProcessingVideos(prev => prev.map(item => item.id === videoId ? { ...item, status, progress, errorMessage } : item))
      if (status === 'COMPLETED' || status === 'FAILED') {
        const interval = pollingIntervals.current.get(videoId)
        if (interval) clearInterval(interval)
        pollingIntervals.current.delete(videoId)
        if (status === 'COMPLETED') setProcessingVideos(prev => prev.filter(item => item.id !== videoId))
        void refreshVideos.current()
      }
    } catch (error) {
      if (pollingEpoch.current.get(videoId) !== epoch) return
      setProcessingVideos(prev => prev.map(item => item.id === videoId ? { ...item, errorMessage: requestError(error, '暂时无法读取转码状态，请刷新处理状态') } : item))
    }
  }

  const startPollingStatus = (videoId: string) => {
    if (pollingIntervals.current.has(videoId)) return
    let checking = false
    const interval = window.setInterval(async () => {
      if (checking) return
      checking = true
      try { await checkProcessingStatus(videoId) } finally { checking = false }
    }, 3000)
    pollingIntervals.current.set(videoId, interval)
  }

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
    <ProductPage width="management" className="space-y-6">
      {feedback}
      <PageHeader title="视频库" description="上传、处理和复用课堂与测评视频。" actions={<ProductButton variant="primary" onClick={() => { setShowUploadModal(true); setUploadError(''); setSelectedFile(null); setVideoTitle(''); setUploadProgress(0) }}><Upload className="w-4 h-4" aria-hidden="true" />上传视频</ProductButton>} />
      <div className="staff-toolbar">
        <div className="flex flex-wrap items-center gap-3"><label className="staff-search-field"><Search className="w-4 h-4" aria-hidden="true" /><span className="sr-only">搜索视频</span><input type="search" value={searchKeyword} onChange={e=>setSearchKeyword(e.target.value)} onKeyDown={handleSearchKeyDown} placeholder="搜索视频" /></label><ProductButton onClick={handleSearch}>搜索</ProductButton>{isAdmin && <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showDeleted} onChange={e=>{setShowDeleted(e.target.checked);setPage(1)}} />显示已删除</label>}</div>
        <span className="staff-help">{loading || listError ? '数量暂不可用' : `共 ${total} 个视频`}</span>
      </div>
      {/* Processing Videos */}
      {processingVideos.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-3 flex items-center">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            视频处理状态 ({processingVideos.length})
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
                  
                  {video.errorMessage && video.status !== 'FAILED' && <div className="text-red-600 text-sm" role="alert">{video.errorMessage}</div>}
                  <ProductButton onClick={() => void checkProcessingStatus(video.id)} disabled={retryingIds.includes(video.id)}>刷新处理状态</ProductButton>
                  {video.status === 'FAILED' && <div className="text-red-500 text-xs">处理失败: {video.errorMessage || '未知错误'}<ProductButton disabled={retryingIds.includes(video.id)} onClick={() => void retryTranscode(video.id)}>重新转码</ProductButton></div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Video Grid */}
      {loading ? (
        <ProductStatus kind="pending" title="正在加载视频">正在读取视频及处理状态。</ProductStatus>
      ) : listError ? <ProductStatus kind="error" title="视频列表加载失败" announce="assertive" actions={<ProductButton onClick={() => void fetchVideos()}>重试</ProductButton>}>{listError}</ProductStatus> : displayVideos.length === 0 ? (
        <ProductStatus kind="info" title="暂无视频">上传第一段视频后，可以在课程、作业和测评中复用。</ProductStatus>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayVideos.map((video) => {
            // @ts-expect-error - isProcessed 是后端返回但尚未进入旧版前端类型的字段
            const isProcessed = video.isProcessed || (video as any).status === 'COMPLETED'
            return (
            <div key={video.id} className="staff-panel staff-panel--padded hover:shadow-lg transition-shadow">
              {(video as any).status === 'FAILED' && !(video as any).isDeleted && <div className="mb-3 text-red-600 text-sm">转码失败，原始视频仍保留。<ProductButton disabled={retryingIds.includes(video.id)} onClick={() => void retryTranscode(video.id)}>重新转码</ProductButton></div>}
              {/* Video Thumbnail */}
              <div className="aspect-video bg-gray-900 rounded-lg mb-4 flex items-center justify-center relative group">
                <VideoIcon className="w-12 h-12 text-gray-600" />
                {/* 处理状态标签 */}
                {(video as any).status && (video as any).status !== 'COMPLETED' && (
                  <div className="absolute top-2 left-2 px-2 py-1 bg-yellow-500 text-white text-xs rounded">
                    {getStatusDisplay((video as any).status).text}
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
                    aria-label={`预览 ${video.title}`}
                    className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all focus-visible:bg-black/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                  >
                    <span className="text-white opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center">
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
                  className="text-action hover:text-action-hover text-sm"
                >
                  编辑标题
                </button>
                {(isAdmin || video.teacherId === user?.id) && (
                  <button
                    onClick={() => handleDelete(video)}
                    aria-label={`删除视频 ${video.title}`}
                    title={`删除视频 ${video.title}`}
                    className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md text-red-400 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
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
      {!loading && !listError && totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <div className="text-sm text-gray-500">
            {loading || listError ? '数量暂不可用' : `共 ${total} 个视频`}，第 {page}/{totalPages} 页
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
                      ? 'bg-action text-white'
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
        <ModalSurface open onClose={uploadGuard.close} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col" tabIndex={-1} role="dialog" aria-modal="true" aria-label={"批量上传视频"}><fieldset disabled={uploadGuard.busy} className="contents">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                批量上传视频 {uploadQueue.length > 0 && `(${uploadQueue.length} 个文件)`}
              </h2>
              <button
                onClick={uploadGuard.close}
                className="text-gray-400 hover:text-gray-600"
                disabled={uploadGuard.busy} aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              {/* Add Files Button */}
              <div
                role="button" tabIndex={isBatchUploading ? -1 : 0} aria-label="添加视频文件" aria-disabled={isBatchUploading}
                onKeyDown={event => { if (!isBatchUploading && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); fileInputRef.current?.click() } }}
                onClick={() => !isBatchUploading && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors border-gray-300 hover:border-action ${isBatchUploading ? 'pointer-events-none opacity-50' : ''}`}
              >
                <input
                  ref={fileInputRef}
                  onClick={event => event.stopPropagation()}
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
                          {(item.status === 'pending' || item.status === 'failed') && (
                            <button
                              onClick={() => removeFromQueue(item.id)}
                              className="text-gray-400 hover:text-red-500"
                              disabled={uploadGuard.busy} aria-label={`移除 ${item.title}`}
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
                            <Loader2 className="w-5 h-5 text-action animate-spin" />
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
                      
                      {item.status === 'failed' && <ProductButton disabled={uploadGuard.busy || Boolean(item.videoId && retryingIds.includes(item.videoId))} onClick={() => item.videoId ? void retryTranscode(item.videoId, item.id) : void retryUpload(item)}>{item.videoId ? '重新转码' : '重新上传'}</ProductButton>}
                      {item.error && item.status !== 'failed' && <div className="text-red-600 text-sm" role="alert">{item.error}</div>}
                      {item.videoId && (item.status === 'failed' || item.status === 'processing') && <ProductButton disabled={uploadGuard.busy} onClick={() => void checkQueueStatus(item.id, item.videoId!)}>刷新处理状态</ProductButton>}
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
                onClick={uploadGuard.close}
                className="flex-1 hui-button hui-button--secondary"
                disabled={isBatchUploading}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleBatchUpload}
                disabled={uploadQueue.filter(i => i.status === 'pending').length === 0 || isBatchUploading}
                className="flex-1 hui-button hui-button--primary disabled:opacity-50"
              >
                {isBatchUploading ? '上传中...' : `开始上传 (${uploadQueue.filter(i => i.status === 'pending').length} 个文件)`}
              </button>
            </div>
          </fieldset></div>
        </ModalSurface>
      )}

      {/* Video Player Modal */}
      {playingVideo && (
        <ModalSurface open onClose={() => setPlayingVideo(null)} className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4" dismissOnBackdrop>
          <div className="bg-black rounded-lg overflow-hidden max-w-5xl w-full" tabIndex={-1} role="dialog" aria-modal="true" aria-label={playingVideo.title + "预览"}>
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-white font-medium truncate flex-1 mr-4">
                {playingVideo.title}
              </h3>
              <button
                onClick={() => setPlayingVideo(null)}
                className="text-gray-400 hover:text-white" aria-label="关闭"
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
        </ModalSurface>
      )}

      {/* Edit Video Modal */}
      {editingVideo && (
        <ModalSurface open onClose={renameGuard.close} className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4" tabIndex={-1} role="dialog" aria-modal="true" aria-label={"编辑视频标题"}>{renameGuard.error}<fieldset disabled={renameGuard.busy} className="contents">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">编辑视频标题</h3>
              <button
                onClick={renameGuard.close}
                className="text-gray-400 hover:text-gray-600" aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="VideoLibrary-field-1" className="label">视频标题</label>
                <input id="VideoLibrary-field-1"
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
                  onClick={renameGuard.close}
                  className="flex-1 hui-button hui-button--secondary"
                  disabled={isUpdating}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleEdit}
                  disabled={!editTitle.trim() || isUpdating}
                  className="flex-1 hui-button hui-button--primary disabled:opacity-50"
                >
                  {isUpdating ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </fieldset></div>
        </ModalSurface>
      )}
      {uploadGuard.confirmation}
      {renameGuard.confirmation}
    </ProductPage>
  )
}

export default VideoLibrary
