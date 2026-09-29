import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Video, Image as ImageIcon, Link as LinkIcon, Upload, Search, Check, FileVideo, AlertCircle, FileText } from 'lucide-react'
import apiClient from '../api/client'
import { ensureCsrfToken, sessionAxios } from '../api/client'
import type { Video as VideoType, Document as DocumentType } from '../types'
import { isSafeExternalMediaUrl } from '../utils/mediaUtils'
import ModalSurface from './shared-ui/ModalSurface'

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
  const [libraryError, setLibraryError] = useState('')
  const requestRef = useRef(0)
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

  const fetchLibrary = useCallback(async () => {
    const request = ++requestRef.current
    setLoading(true)
    setLibraryError('')
    setSelectedVideo(null)
    setSelectedImage(null)
    setSelectedDocument(null)
    try {
      const response = await apiClient.get(isDocumentMode ? '/documents' : isImageMode ? '/uploads/images' : '/videos?pageSize=100')
      if (response.code !== 0) throw new Error(response.message || '素材库加载失败')
      if (request !== requestRef.current) return
      if (isDocumentMode) setDocuments(response.data.list)
      else if (isImageMode) setImages(response.data.list)
      else setVideos(response.data.list)
    } catch (error) {
      if (request === requestRef.current) setLibraryError(error instanceof Error ? error.message : '素材库加载失败')
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }, [isDocumentMode, isImageMode])

  useEffect(() => {
    if (isOpen && activeTab === 'library') {
      void fetchLibrary()
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
    return () => { requestRef.current += 1 }
  }, [isOpen, activeTab, fetchLibrary])

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

  const dialogTitle = isDocumentMode ? '选择文档' : isImageMode ? '选择图片' : '选择视频'

  return (
    <ModalSurface open={isOpen} onClose={onClose} className="staff-modal-backdrop">
      <div className="staff-dialog staff-dialog--wide hui-media-selector" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="media-selector-title">
        {/* Header */}
        <div className="staff-dialog__header">
          <div>
            <h2 id="media-selector-title">{dialogTitle}</h2>
            <p className="staff-dialog__description">{isImageMode || isDocumentMode ? '从素材库选择，或上传新的素材。' : '从素材库选择、添加外部链接，或上传新的素材。'}</p>
          </div>
          <button type="button" onClick={onClose} className="staff-icon-button" aria-label="关闭素材选择">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            type="button"
            aria-pressed={activeTab === 'library'}
            onClick={() => setActiveTab('library')}
            className={`flex-1 min-h-11 py-3 text-sm font-medium flex items-center justify-center space-x-2 ${
              activeTab === 'library' ? 'text-action border-b-2 border-action' : 'text-gray-500'
            }`}
          >
            {isDocumentMode ? <FileText className="w-4 h-4" /> : isImageMode ? <ImageIcon className="w-4 h-4" /> : <Video className="w-4 h-4" />}
            <span>{isDocumentMode ? '文档库' : isImageMode ? '图片库' : '视频库'}</span>
          </button>
          {!isImageMode && !isDocumentMode && (
            <button
              type="button"
              aria-pressed={activeTab === 'external'}
              onClick={() => setActiveTab('external')}
              className={`flex-1 min-h-11 py-3 text-sm font-medium flex items-center justify-center space-x-2 ${
                activeTab === 'external' ? 'text-action border-b-2 border-action' : 'text-gray-500'
              }`}
            >
              <LinkIcon className="w-4 h-4" />
              <span>外部链接</span>
            </button>
          )}
          <button
            type="button"
            aria-pressed={activeTab === 'upload'}
            onClick={() => setActiveTab('upload')}
            className={`flex-1 min-h-11 py-3 text-sm font-medium flex items-center justify-center space-x-2 ${
              activeTab === 'upload' ? 'text-action border-b-2 border-action' : 'text-gray-500'
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
                  aria-label="搜索素材"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder={isDocumentMode ? "搜索文档..." : isImageMode ? "搜索图片..." : "搜索视频..."}
                  className="input pl-9 w-full"
                />
              </div>

              {loading ? (
                <div role="status" className="text-center py-8">加载中...</div>
              ) : libraryError ? (
                <div role="alert" className="text-center py-8">
                  <p className="text-red-700">{libraryError}</p>
                  <button type="button" className="btn-secondary mt-3" onClick={() => void fetchLibrary()}>重试</button>
                </div>
              ) : isDocumentMode ? (
                // 文档库
                filteredDocuments.length === 0 ? (
                  <div role="status" className="text-center py-8 text-gray-600">{searchKeyword ? '没有符合搜索条件的文档' : '暂无文档'}</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredDocuments.map((doc) => (
                      <button
                        type="button"
                        key={doc.id}
                        onClick={() => setSelectedDocument(doc)}
                        aria-pressed={selectedDocument?.id === doc.id}
                        className={`w-full p-3 border rounded-lg cursor-pointer transition-all text-left ${
                          selectedDocument?.id === doc.id
                            ? 'border-action bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start space-x-3">
                          <div className="w-12 h-12 bg-red-100 rounded flex items-center justify-center flex-shrink-0">
                            <FileText className="w-6 h-6 text-red-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{doc.title}</p>
                            <p className="text-sm text-gray-600 break-all">
                              {doc.fileName}
                            </p>
                          </div>
                          {selectedDocument?.id === doc.id && (
                            <Check className="w-5 h-5 text-action flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )
              ) : isImageMode ? (
                // 图片库
                filteredImages.length === 0 ? (
                  <div role="status" className="text-center py-8 text-gray-600">{searchKeyword ? '没有符合搜索条件的图片' : '暂无图片'}</div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {filteredImages.map((image) => (
                      <button
                        type="button"
                        key={image.id}
                        onClick={() => setSelectedImage(image)}
                        aria-pressed={selectedImage?.id === image.id}
                        className={`relative aspect-square border rounded-lg cursor-pointer transition-all overflow-hidden bg-white p-0 ${
                          selectedImage?.id === image.id
                            ? 'border-action ring-2 ring-action'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <img
                          src={image.url}
                          alt={image.name}
                          className="w-full h-full object-cover"
                        />
                        {selectedImage?.id === image.id && (
                          <div className="absolute inset-0 bg-action/20 flex items-center justify-center">
                            <Check className="w-8 h-8 text-action" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )
              ) : (
                // 视频库
                filteredVideos.length === 0 ? (
                  <div role="status" className="text-center py-8 text-gray-600">{searchKeyword ? '没有符合搜索条件的视频' : '暂无视频'}</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredVideos.map((video) => (
                      <button
                        type="button"
                        key={video.id}
                        onClick={() => setSelectedVideo(video)}
                        aria-pressed={selectedVideo?.id === video.id}
                        className={`w-full p-3 border rounded-lg cursor-pointer transition-all text-left ${
                          selectedVideo?.id === video.id
                            ? 'border-action bg-blue-50'
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
                            <Check className="w-5 h-5 text-action flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {activeTab === 'external' && !isImageMode && (
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="media-external-url">HTTPS 视频链接</label>
                <textarea
                  id="media-external-url"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  className="input w-full h-24"
                  placeholder="支持 B 站、YouTube 等 HTTPS 视频链接"
                />
              </div>
              <div>
                <label className="label" htmlFor="media-external-title">视频标题</label>
                <input
                  id="media-external-title"
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
                <div role="alert" className="flex items-start space-x-2 text-red-600 text-sm bg-red-50 p-3 rounded">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  uploadFile ? 'border-green-300 bg-green-50' : 'border-gray-300 hover:border-action'
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
                    <p className="text-green-700 font-medium break-all">{uploadFile.name}</p>
                    <p className="text-sm text-gray-500">{formatFileSize(uploadFile.size)}</p>
                    {!isUploading && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="btn-secondary text-sm"
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
                    <button type="button" className="btn-secondary" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>选择文件</button>
                    <p className="text-sm text-gray-600">
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
                  <label className="label" htmlFor="media-upload-title">视频标题 *</label>
                  <input
                    id="media-upload-title"
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
                  <label className="label" htmlFor="media-upload-title">文档标题 *</label>
                  <input
                    id="media-upload-title"
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
                  <div role="progressbar" aria-label="上传进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress} className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-action h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error */}
              {uploadError && (
                <div role="alert" className="flex items-start space-x-2 text-red-600 text-sm bg-red-50 p-3 rounded">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="staff-dialog__actions">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isUploading}>
            取消
          </button>
          {activeTab === 'library' && (
            <button
              type="button"
              onClick={handleSelectFromLibrary}
              disabled={loading || Boolean(libraryError) || (isDocumentMode ? !selectedDocument : isImageMode ? !selectedImage : !selectedVideo)}
              className="btn-primary disabled:opacity-50"
            >
              选择
            </button>
          )}
          {activeTab === 'external' && !isImageMode && !isDocumentMode && (
            <button
              type="button"
              onClick={handleSelectExternal}
              disabled={!externalUrl.trim()}
              className="btn-primary disabled:opacity-50"
            >
              添加
            </button>
          )}
          {activeTab === 'upload' && (
            <button
              type="button"
              onClick={handleUpload}
              disabled={!uploadFile || (isImageMode ? false : !uploadTitle.trim()) || isUploading}
              className="btn-primary disabled:opacity-50"
            >
              {isUploading ? '上传中...' : '上传'}
            </button>
          )}
        </div>
      </div>
    </ModalSurface>
  )
}

export default MediaSelector
