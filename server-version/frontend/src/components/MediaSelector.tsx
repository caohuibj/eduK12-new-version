import React, { useState, useEffect, useRef } from 'react'
import { X, Video, Image as ImageIcon, Link as LinkIcon, Upload, Search, Check, FileVideo, AlertCircle, FileText } from 'lucide-react'
import apiClient from '../api/client'
import { ensureCsrfToken, sessionAxios } from '../api/client'
import type { Video as VideoType, Document as DocumentType } from '../types'
import { isSafeExternalMediaUrl } from '../utils/mediaUtils'

export interface MediaItem {
  type: 'library' | 'external' | 'upload'
  id?: string
  assetId?: string
  url: string
  title: string
  thumbnail?: string
  source?: string
}

interface ImageItem {
  id: string
  assetId?: string
  url: string
  filename: string
  name: string
  size: number
}

interface MediaSelectorProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (item: MediaItem) => void
  type: 'video' | 'image' | 'document' | 'all'
}

const MediaSelector: React.FC<MediaSelectorProps> = ({ isOpen, onClose, onSelect, type }) => {
  const isImageMode = type === 'image'
  const isDocumentMode = type === 'document'
  const [activeTab, setActiveTab] = useState<'library' | 'external' | 'upload'>('library')
  const [videos, setVideos] = useState<VideoType[]>([])
  const [images, setImages] = useState<ImageItem[]>([])
  const [documents, setDocuments] = useState<DocumentType[]>([])
  const [loading, setLoading] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedVideo, setSelectedVideo] = useState<VideoType | null>(null)
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<DocumentType | null>(null)

  // External video form
  const [externalUrl, setExternalUrl] = useState('')
  const [externalTitle, setExternalTitle] = useState('')

  // Upload form
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && activeTab === 'library') {
      if (isDocumentMode) {
        fetchDocuments()
      } else if (isImageMode) {
        fetchImages()
      } else {
        fetchVideos()
      }
    }
    // 弹窗关闭时重置上传状态
    if (!isOpen) {
      setUploadFile(null)
      setUploadTitle('')
      setUploadProgress(0)
      setIsUploading(false)
      setUploadError('')
      setActiveTab('library')
      setSelectedVideo(null)
      setSelectedImage(null)
      setSelectedDocument(null)
    }
  }, [isOpen, activeTab, isImageMode, isDocumentMode])

  const fetchVideos = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get('/videos?pageSize=100')
      if (response.code === 0) {
        setVideos(response.data.list)
      }
    } catch (error) {
      console.error('获取视频列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchImages = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get('/uploads/images')
      if (response.code === 0) {
        setImages(response.data.list)
      }
    } catch (error) {
      console.error('获取图片列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchDocuments = async () => {
    try {
      setLoading(true)
      const response = await apiClient.get('/documents')
      if (response.code === 0) {
        setDocuments(response.data.list)
      }
    } catch (error) {
      console.error('获取文档列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredVideos = videos.filter(v =>
    v.title.toLowerCase().includes(searchKeyword.toLowerCase())
  )

  const filteredImages = images.filter(img =>
    img.name.toLowerCase().includes(searchKeyword.toLowerCase())
  )

  const filteredDocuments = documents.filter(doc =>
    doc.title.toLowerCase().includes(searchKeyword.toLowerCase())
  )

  const handleSelectFromLibrary = () => {
    if (isDocumentMode) {
      if (!selectedDocument) return
      onSelect({
        type: 'library',
        id: selectedDocument.id,
        assetId: selectedDocument.assetId,
        url: selectedDocument.url || '',
        title: selectedDocument.title,
      })
    } else if (isImageMode) {
      if (!selectedImage) return
      onSelect({
        type: 'library',
        id: selectedImage.id,
        assetId: selectedImage.assetId || selectedImage.id,
        url: selectedImage.url,
        title: selectedImage.name,
      })
    } else {
      if (!selectedVideo) return
      // 构造正确的视频URL
      const videoUrl = selectedVideo.url || selectedVideo.processedUrl || `/uploads/videos/${selectedVideo.fileName}`
      
      onSelect({
        type: 'library',
        id: selectedVideo.id,
        assetId: selectedVideo.processedAssetId || selectedVideo.originalAssetId,
        url: videoUrl,
        title: selectedVideo.title,
        source: 'library',
      })
    }
    onClose()
  }

  const handleSelectExternal = () => {
    const trimmedUrl = externalUrl.trim()
    if (!trimmedUrl) return
    if (!isSafeExternalMediaUrl(trimmedUrl)) {
      setUploadError('请输入有效的 HTTPS 视频链接，不支持 iframe 或 HTML 嵌入代码')
      return
    }
    setUploadError('')
    
    // Detect source from URL
    let source = 'external'
    const hostname = new URL(trimmedUrl).hostname.toLowerCase()
    if (hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com') || hostname === 'b23.tv') source = 'bilibili'
    else if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com') || hostname === 'youtu.be') source = 'youtube'
    
    onSelect({
      type: 'external',
      url: trimmedUrl,
      title: externalTitle.trim() || '外部视频',
      source,
    })
    onClose()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (isDocumentMode) {
      // 验证文档文件类型
      const allowedTypes = ['application/pdf']
      if (!allowedTypes.includes(file.type)) {
        setUploadError('不支持的文件格式，请上传 PDF 格式的文档')
        return
      }

      // 验证文件大小 (100MB)
      const maxSize = 100 * 1024 * 1024
      if (file.size > maxSize) {
        setUploadError('文件大小超过 100MB 限制')
        return
      }
    } else if (isImageMode) {
      // 验证图片文件类型
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      if (!allowedTypes.includes(file.type)) {
        setUploadError('不支持的文件格式，请上传 JPG、PNG、WebP 或 GIF 格式的图片')
        return
      }

      // 验证文件大小 (10MB)
      const maxSize = 10 * 1024 * 1024
      if (file.size > maxSize) {
        setUploadError('文件大小超过 10MB 限制')
        return
      }
    } else {
      // 验证视频文件类型
      const allowedTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
      if (!allowedTypes.includes(file.type)) {
        setUploadError('不支持的文件格式，请上传 MP4、WebM、OGG 或 MOV 格式的视频')
        return
      }

      // 验证文件大小 (500MB)
      const maxSize = 500 * 1024 * 1024
      if (file.size > maxSize) {
        setUploadError('文件大小超过 500MB 限制')
        return
      }
    }

    setUploadFile(file)
    setUploadTitle(file.name.replace(/\.[^/.]+$/, ''))
    setUploadError('')
  }

  const handleUpload = async () => {
    if (!uploadFile || (!isImageMode && !isDocumentMode && !uploadTitle.trim())) return

    setIsUploading(true)
    setUploadProgress(0)
    setUploadError('')

    try {
      const formData = new FormData()
      const csrfToken = await ensureCsrfToken()

      if (isDocumentMode) {
        // 上传文档
        formData.append('document', uploadFile)
        formData.append('title', uploadTitle.trim())

        const response = await sessionAxios.post('/documents/upload', formData, {
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
          const uploadedDoc = response.data.data
          onSelect({
            type: 'library',
            id: uploadedDoc.id,
            assetId: uploadedDoc.assetId,
            url: uploadedDoc.url || '',
            title: uploadedDoc.title,
          })
          onClose()
        } else {
          setUploadError(response.data.message || '上传失败')
        }
      } else if (isImageMode) {
        // 上传图片
        formData.append('image', uploadFile)

        const response = await sessionAxios.post('/uploads/image', formData, {
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
          const uploadedImage = response.data.data
          onSelect({
            type: 'library',
            id: uploadedImage.filename,
            assetId: uploadedImage.assetId,
            url: uploadedImage.url,
            title: uploadedImage.name,
          })
          onClose()
        } else {
          setUploadError(response.data.message || '上传失败')
        }
      } else {
        // 上传视频
        formData.append('video', uploadFile)
        formData.append('title', uploadTitle.trim())

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
          const uploadedVideo = response.data.data
          onSelect({
            type: 'library',
            id: uploadedVideo.id,
            assetId: uploadedVideo.processedAssetId || uploadedVideo.originalAssetId,
            url: uploadedVideo.url || uploadedVideo.originalUrl || '',
            title: uploadedVideo.title,
          })
          onClose()
        } else {
          setUploadError(response.data.message || '上传失败')
        }
      }
    } catch (error: any) {
      setUploadError(error.response?.data?.message || error.message || '上传失败')
    } finally {
      setIsUploading(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {isDocumentMode ? '选择文档' : isImageMode ? '选择图片' : '选择视频'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('library')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center space-x-2 ${
              activeTab === 'library' ? 'text-primary border-b-2 border-primary' : 'text-gray-500'
            }`}
          >
            {isDocumentMode ? <FileText className="w-4 h-4" /> : isImageMode ? <ImageIcon className="w-4 h-4" /> : <Video className="w-4 h-4" />}
            <span>{isDocumentMode ? '文档库' : isImageMode ? '图片库' : '视频库'}</span>
          </button>
          {!isImageMode && !isDocumentMode && (
            <button
              onClick={() => setActiveTab('external')}
              className={`flex-1 py-3 text-sm font-medium flex items-center justify-center space-x-2 ${
                activeTab === 'external' ? 'text-primary border-b-2 border-primary' : 'text-gray-500'
              }`}
            >
              <LinkIcon className="w-4 h-4" />
              <span>外部链接</span>
            </button>
          )}
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center space-x-2 ${
              activeTab === 'upload' ? 'text-primary border-b-2 border-primary' : 'text-gray-500'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>上传</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'library' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder={isDocumentMode ? "搜索文档..." : isImageMode ? "搜索图片..." : "搜索视频..."}
                  className="input pl-9 w-full"
                />
              </div>

              {loading ? (
                <div className="text-center py-8">加载中...</div>
              ) : isDocumentMode ? (
                // 文档库
                filteredDocuments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">暂无文档</div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {filteredDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        onClick={() => setSelectedDocument(doc)}
                        className={`p-3 border rounded-lg cursor-pointer transition-all ${
                          selectedDocument?.id === doc.id
                            ? 'border-primary bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start space-x-3">
                          <div className="w-12 h-12 bg-red-100 rounded flex items-center justify-center flex-shrink-0">
                            <FileText className="w-6 h-6 text-red-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{doc.title}</p>
                            <p className="text-xs text-gray-500">
                              {doc.fileName}
                            </p>
                          </div>
                          {selectedDocument?.id === doc.id && (
                            <Check className="w-5 h-5 text-primary flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : isImageMode ? (
                // 图片库
                filteredImages.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">暂无图片</div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {filteredImages.map((image) => (
                      <div
                        key={image.id}
                        onClick={() => setSelectedImage(image)}
                        className={`relative aspect-square border rounded-lg cursor-pointer transition-all overflow-hidden ${
                          selectedImage?.id === image.id
                            ? 'border-primary ring-2 ring-primary'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <img
                          src={image.url}
                          alt={image.name}
                          className="w-full h-full object-cover"
                        />
                        {selectedImage?.id === image.id && (
                          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                            <Check className="w-8 h-8 text-primary" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : (
                // 视频库
                filteredVideos.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">暂无视频</div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {filteredVideos.map((video) => (
                      <div
                        key={video.id}
                        onClick={() => setSelectedVideo(video)}
                        className={`p-3 border rounded-lg cursor-pointer transition-all ${
                          selectedVideo?.id === video.id
                            ? 'border-primary bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start space-x-3">
                          <div className="w-16 h-12 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
                            <Video className="w-6 h-6 text-gray-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{video.title}</p>
                            <p className="text-xs text-gray-500">
                              {(video.fileSize / 1024 / 1024).toFixed(1)} MB
                            </p>
                          </div>
                          {selectedVideo?.id === video.id && (
                            <Check className="w-5 h-5 text-primary flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {activeTab === 'external' && !isImageMode && (
            <div className="space-y-4">
              <div>
                <label className="label">视频链接或嵌入代码</label>
                <textarea
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  className="input w-full h-24"
                  placeholder="支持 B 站、YouTube 等 HTTPS 视频链接"
                />
              </div>
              <div>
                <label className="label">视频标题</label>
                <input
                  type="text"
                  value={externalTitle}
                  onChange={(e) => setExternalTitle(e.target.value)}
                  className="input w-full"
                  placeholder="输入视频标题"
                />
              </div>
              <p className="text-sm text-gray-500">
                提示：仅接受 HTTPS 链接；不支持 iframe 或 HTML 嵌入代码
              </p>
              {uploadError && (
                <div className="flex items-start space-x-2 text-red-600 text-sm bg-red-50 p-3 rounded">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="space-y-4">
              <div
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  uploadFile ? 'border-green-300 bg-green-50' : 'border-gray-300 hover:border-primary'
                } ${isUploading ? 'pointer-events-none opacity-50' : ''}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={isDocumentMode ? "application/pdf" : isImageMode ? "image/jpeg,image/png,image/webp,image/gif" : "video/mp4,video/webm,video/ogg,video/quicktime"}
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={isUploading}
                />
                {uploadFile ? (
                  <div className="space-y-2">
                    {isDocumentMode ? (
                      <FileText className="w-12 h-12 text-red-500 mx-auto" />
                    ) : isImageMode ? (
                      <ImageIcon className="w-12 h-12 text-green-500 mx-auto" />
                    ) : (
                      <FileVideo className="w-12 h-12 text-green-500 mx-auto" />
                    )}
                    <p className="text-green-700 font-medium">{uploadFile.name}</p>
                    <p className="text-sm text-gray-500">{formatFileSize(uploadFile.size)}</p>
                    {!isUploading && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setUploadFile(null)
                          setUploadTitle('')
                          setUploadError('')
                        }}
                        className="text-sm text-red-500 hover:text-red-600"
                      >
                        重新选择
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {isDocumentMode ? (
                      <FileText className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    ) : isImageMode ? (
                      <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    ) : (
                      <Upload className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    )}
                    <p className="text-gray-600">点击选择文件</p>
                    <p className="text-sm text-gray-400">
                      {isDocumentMode
                        ? '支持 PDF 格式，最大 100MB'
                        : isImageMode
                        ? '支持 JPG、PNG、WebP、GIF 格式，最大 10MB'
                        : '支持 MP4、WebM、OGG、MOV 格式，最大 500MB'}
                    </p>
                  </div>
                )}
              </div>

              {uploadFile && !isImageMode && !isDocumentMode && (
                <div>
                  <label className="label">视频标题 *</label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    className="input w-full"
                    placeholder="输入视频标题"
                    disabled={isUploading}
                  />
                </div>
              )}
              {uploadFile && isDocumentMode && (
                <div>
                  <label className="label">文档标题 *</label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    className="input w-full"
                    placeholder="输入文档标题"
                    disabled={isUploading}
                  />
                </div>
              )}

              {/* Upload Progress */}
              {isUploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>上传中...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
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
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-4 border-t">
          <button onClick={onClose} className="btn-secondary" disabled={isUploading}>
            取消
          </button>
          {activeTab === 'library' && (
            <button
              onClick={handleSelectFromLibrary}
              disabled={isDocumentMode ? !selectedDocument : isImageMode ? !selectedImage : !selectedVideo}
              className="btn-primary disabled:opacity-50"
            >
              选择
            </button>
          )}
          {activeTab === 'external' && !isImageMode && !isDocumentMode && (
            <button
              onClick={handleSelectExternal}
              disabled={!externalUrl.trim()}
              className="btn-primary disabled:opacity-50"
            >
              添加
            </button>
          )}
          {activeTab === 'upload' && (
            <button
              onClick={handleUpload}
              disabled={!uploadFile || (isImageMode ? false : !uploadTitle.trim()) || isUploading}
              className="btn-primary disabled:opacity-50"
            >
              {isUploading ? '上传中...' : '上传'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default MediaSelector
