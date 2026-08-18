import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Clock, Camera, Image, Loader2, CheckCircle, Users, Eye, X, ZoomIn, FileText } from 'lucide-react'
import apiClient from '../../api/client'
import { sanitizeHtml } from '../../utils/sanitize'
import type { Checkin, CheckinSubmission, MediaItem, DocumentItem } from '../../types'
import { VideoList, ImageList } from '../../components/MediaRenderer'
import { normalizeImageUrl, handleImageError } from '../../utils/mediaUtils'
import PdfViewer from '../../components/PdfViewer'

interface OtherSubmission {
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

const CheckinSubmit: React.FC = () => {
  const { checkinId } = useParams<{ checkinId: string }>()
  const navigate = useNavigate()
  const [checkin, setCheckin] = useState<Checkin | null>(null)
  const [submission, setSubmission] = useState<CheckinSubmission | null>(null)
  const [content, setContent] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [othersSubmissions, setOthersSubmissions] = useState<OtherSubmission[]>([])
  const [showOthers, setShowOthers] = useState(false)
  const [playingVideo, setPlayingVideo] = useState<MediaItem | null>(null)
  const [previewImage, setPreviewImage] = useState<{url: string, name: string} | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(null)
  const [showPdfViewer, setShowPdfViewer] = useState(false)

  useEffect(() => {
    if (checkinId) {
      fetchCheckinDetail()
    }
  }, [checkinId])

  const fetchCheckinDetail = async () => {
    try {
      setLoading(true)
      const [checkinRes, submissionRes] = await Promise.all([
        apiClient.get(`/checkins/${checkinId}`),
        apiClient.get(`/checkins/${checkinId}/my-submission`),
      ])

      if (checkinRes.code === 0) {
        setCheckin(checkinRes.data)
        // 如果允许查看他人打卡，获取他人提交
        if (checkinRes.data.allowViewOthers) {
          fetchOthersSubmissions()
        }
      }

      if (submissionRes.code === 0 && submissionRes.data) {
        setSubmission(submissionRes.data)
        setContent(submissionRes.data.content || '')
        setImages(submissionRes.data.images || [])
      }
    } catch (error) {
      console.error('获取打卡详情失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchOthersSubmissions = async () => {
    try {
      const response = await apiClient.get(`/checkins/${checkinId}/others-submissions`)
      if (response.code === 0) {
        setOthersSubmissions(response.data.list)
      }
    } catch (error) {
      console.error('获取他人打卡失败:', error)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append('image', file)

    try {
      const response = await apiClient.post('/uploads/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      if (response.code === 0) {
        // 处理异步队列模式：需要轮询获取最终结果
        const { imageId, status, pollUrl } = response.data
        
        if (status === 'pending' && pollUrl) {
          // 轮询等待处理完成
          const maxAttempts = 30 // 最多轮询30次（约15秒）
          const pollInterval = 500 // 每500ms轮询一次
          
          for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, pollInterval))
            
            const statusResponse = await apiClient.get(pollUrl)
            
            if (statusResponse.code === 0) {
              const { status, url, error } = statusResponse.data
              
              if (status === 'completed' && url) {
                setImages([...images, url])
                return
              } else if (status === 'failed') {
                alert(error || '图片处理失败')
                return
              }
              // 继续轮询...
            }
          }
          
          alert('图片处理超时，请稍后重试')
        } else if (response.data.url) {
          // 兼容同步模式（直接返回URL）
          setImages([...images, response.data.url])
        }
      } else {
        alert('图片上传失败')
      }
    } catch (error) {
      console.error('图片上传失败:', error)
      alert('图片上传失败')
    } finally {
      setUploading(false)
    }
  }

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!checkin) return

    setSubmitting(true)
    try {
      const response = await apiClient.post(`/checkins/${checkinId}/submit`, {
        content,
        images,
      })

      if (response.code === 0) {
        alert('打卡成功！')
        fetchCheckinDetail()
      } else {
        alert(response.message || '打卡失败')
      }
    } catch (error: any) {
      alert(error.message || '打卡失败')
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

  if (!checkin) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-500">打卡不存在</p>
        <button onClick={() => navigate('/student')} className="btn-primary mt-4">
          返回
        </button>
      </div>
    )
  }

  const isOverdue = checkin.endTime ? new Date(checkin.endTime) < new Date() : false
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

      {/* Checkin Info */}
      <div className="card">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">{checkin.title}</h1>
        {checkin.description && (
          <p className="text-gray-600 mb-4">{checkin.description}</p>
        )}
        
        {/* 打卡内容 */}
        {checkin.content && (
          <div 
            className="text-gray-700 mb-4 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(checkin.content) }}
          />
        )}
        
        {/* 打卡视频 */}
        <div className="mb-4">
          <VideoList
            videos={checkin.videos}
            title="相关视频"
            watermarkText="慧育空间专属教学视频"
            className="!p-0 !shadow-none !border-0"
          />
        </div>
        
        {/* 打卡图片 */}
        <div className="mb-4">
          <ImageList
            images={checkin.images}
            title="相关图片"
            watermarkText="慧育空间专属教学图片"
            className="!p-0 !shadow-none !border-0"
          />
        </div>

        {/* 打卡文档 */}
        {checkin.documents && checkin.documents.length > 0 && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
              <FileText className="w-4 h-4 mr-2 text-red-500" />
              相关文档
            </h4>
            <div className="space-y-2">
              {checkin.documents.map((doc, index) => (
                <div
                  key={index}
                  onClick={() => {
                    setSelectedDocument(doc)
                    setShowPdfViewer(true)
                  }}
                  className="flex items-center justify-between p-2 bg-white rounded cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-gray-700">{doc.title}</span>
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
        
        <div className={`flex items-center space-x-2 text-sm ${isOverdue ? 'text-red-500' : 'text-gray-500'}`}>
          <Clock className="w-4 h-4" />
          <span>截止: {formatDate(checkin.endTime)}</span>
        </div>
      </div>

      {/* Others Submissions */}
      {checkin.allowViewOthers && othersSubmissions.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center">
              <Users className="w-5 h-5 mr-2" />
              其他同学的打卡
            </h3>
            <button
              onClick={() => setShowOthers(!showOthers)}
              className="text-sm text-primary hover:text-primary-hover flex items-center"
            >
              <Eye className="w-4 h-4 mr-1" />
              {showOthers ? '收起' : `查看 (${othersSubmissions.length})`}
            </button>
          </div>
          
          {showOthers && (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {othersSubmissions.map((other) => (
                <div key={other.id} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                      <span className="text-primary text-sm font-medium">
                        {other.student.nickname?.charAt(0) || other.student.username.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{other.student.nickname || other.student.username}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(other.createdAt).toLocaleString('zh-CN')}
                      </p>
                    </div>
                  </div>
                  
                  {other.content && (
                    <p className="text-sm text-gray-700 mb-2 whitespace-pre-wrap">{other.content}</p>
                  )}
                  
                  {other.images && other.images.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {other.images.map((imageUrl, idx) => {
                        const normalizedUrl = normalizeImageUrl(imageUrl)
                        return (
                          <div
                            key={idx}
                            onClick={() => setPreviewImage({ url: normalizedUrl, name: `图片 ${idx + 1}` })}
                            className="relative aspect-square rounded-lg overflow-hidden border hover:border-primary transition-colors cursor-pointer group"
                          >
                            <img
                              src={normalizedUrl}
                              alt={`图片 ${idx + 1}`}
                              className="w-full h-full object-cover"
                              onError={handleImageError}
                            />
                            {/* 悬停提示 */}
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <ZoomIn className="w-5 h-5 text-white" />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 图片预览弹窗 */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 p-2 text-white hover:text-gray-300 z-10"
              title="关闭"
            >
              <X className="w-6 h-6" />
            </button>
              <div className="relative">
                <img
                  src={previewImage.url}
                  alt={previewImage.name}
                  className="max-w-full max-h-[85vh] object-contain rounded-lg"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            <p className="text-white text-center mt-4 text-sm">{previewImage.name}</p>
          </div>
        </div>
      )}

      {/* Submission Form */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          {hasSubmitted ? (
            <>
              <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
              我的打卡
            </>
          ) : (
            <>
              <Camera className="w-5 h-5 mr-2" />
              去打卡
            </>
          )}
        </h3>

        {hasSubmitted ? (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-800 whitespace-pre-wrap">{submission.content}</p>
            </div>
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-4">
                {images.map((image, index) => {
                  const imageUrl = normalizeImageUrl(image)
                  return (
                    <div key={index} className="aspect-square rounded-lg overflow-hidden">
                      <img
                        src={imageUrl}
                        alt={`打卡图片 ${index + 1}`}
                        className="w-full h-full object-cover"
                        onError={handleImageError}
                      />
                    </div>
                  )
                })}
              </div>
            )}
            <p className="text-sm text-gray-500">
              打卡时间: {formatDate(submission.createdAt)}
            </p>
          </div>
        ) : isOverdue ? (
          <div className="text-center py-8">
            <p className="text-red-500">打卡已截止</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Content */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                打卡内容
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="input min-h-[120px]"
                placeholder="记录一下今天的学习内容或心得..."
                required
              />
            </div>

            {/* Images */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                上传图片
              </label>
              <div className="grid grid-cols-4 gap-4">
                {images.map((image, index) => {
                  const imageUrl = normalizeImageUrl(image)
                  return (
                  <div key={index} className="relative aspect-square rounded-lg overflow-hidden">
                    <img
                      src={imageUrl}
                      alt={`预览 ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                  )
                })}
                {images.length < 9 && (
                  <label className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
                    {uploading ? (
                      <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                    ) : (
                      <>
                        <Image className="w-6 h-6 text-gray-400 mb-1" />
                        <span className="text-xs text-gray-500">添加图片</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2">最多上传 9 张图片</p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full btn-primary flex items-center justify-center space-x-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>提交中...</span>
                </>
              ) : (
                <span>提交打卡</span>
              )}
            </button>
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

export default CheckinSubmit
