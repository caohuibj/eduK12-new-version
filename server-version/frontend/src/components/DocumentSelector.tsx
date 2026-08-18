import React, { useState, useEffect, useRef } from 'react'
import { X, FileText, Upload, Search, Check, AlertCircle } from 'lucide-react'
import apiClient from '../api/client'
import axios from 'axios'
import type { Document } from '../types'

export interface DocumentItem {
  id: string
  title: string
  url: string
  allowDownload: boolean  // ⭐ 权限控制
}

interface DocumentSelectorProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (documents: DocumentItem[]) => void
  selected: DocumentItem[]  // 已选中的文档
}

const DocumentSelector: React.FC<DocumentSelectorProps> = ({ 
  isOpen, 
  onClose, 
  onSelect, 
  selected 
}) => {
  const [activeTab, setActiveTab] = useState<'library' | 'upload'>('library')
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  
  // Upload form
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && activeTab === 'library') {
      fetchDocuments()
    }
    // 弹窗关闭时重置
    if (!isOpen) {
      setUploadFile(null)
      setUploadTitle('')
      setUploadProgress(0)
      setIsUploading(false)
      setUploadError('')
      setActiveTab('library')
      setSearchKeyword('')
      setAppliedKeyword('')
    }
  }, [isOpen, activeTab])

  const fetchDocuments = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ pageSize: '100' })
      if (appliedKeyword) {
        params.set('keyword', appliedKeyword)
      }
      const response = await apiClient.get(`/documents?${params.toString()}`)
      if (response.code === 0) {
        setDocuments(response.data.list)
      }
    } catch (error) {
      console.error('获取文档列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleDocument = (doc: Document) => {
    const exists = selected.find(d => d.id === doc.id)
    if (exists) {
      // 移除
      onSelect(selected.filter(d => d.id !== doc.id))
    } else {
      // 添加，默认禁止下载
      onSelect([...selected, {
        id: doc.id,
        title: doc.title,
        url: doc.url || `/uploads/documents/${doc.fileName}`,
        allowDownload: false  // ⭐ 默认禁止下载
      }])
    }
  }

  const toggleDownload = (docId: string) => {
    onSelect(selected.map(d => 
      d.id === docId ? { ...d, allowDownload: !d.allowDownload } : d
    ))
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 验证文件类型
    if (file.type !== 'application/pdf') {
      setUploadError('只支持PDF格式文档')
      return
    }

    // 验证文件大小 (20MB)
    const maxSize = 20 * 1024 * 1024
    if (file.size > maxSize) {
      setUploadError('文件大小超过 20MB 限制')
      return
    }

    setUploadFile(file)
    setUploadTitle(file.name.replace(/\.pdf$/i, ''))
    setUploadError('')
  }

  const handleUpload = async () => {
    if (!uploadFile || !uploadTitle.trim()) return

    setIsUploading(true)
    setUploadProgress(0)
    setUploadError('')

    try {
      const formData = new FormData()
      formData.append('document', uploadFile)
      formData.append('title', uploadTitle.trim())

      const token = localStorage.getItem('token')

      const response = await axios.post('/api/documents/upload', formData, {
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
        const uploadedDoc = response.data.data
        // 上传后自动选中，默认禁止下载
        onSelect([...selected, {
          id: uploadedDoc.id,
          title: uploadedDoc.title,
          url: uploadedDoc.url,
          allowDownload: false
        }])
        onClose()
      } else {
        setUploadError(response.data.message || '上传失败')
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">选择PDF文档</h2>
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
            <FileText className="w-4 h-4" />
            <span>文档库</span>
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center space-x-2 ${
              activeTab === 'upload' ? 'text-primary border-b-2 border-primary' : 'text-gray-500'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>上传新文档</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'library' && (
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setAppliedKeyword(searchKeyword)
                      fetchDocuments()
                    }
                  }}
                  placeholder="搜索文档..."
                  className="input pl-9 w-full"
                />
              </div>

              {/* Document List */}
              {loading ? (
                <div className="text-center py-8">加载中...</div>
              ) : documents.length === 0 ? (
                <div className="text-center py-8 text-gray-500">暂无文档</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {documents.map((doc) => {
                    const isSelected = selected.find(d => d.id === doc.id)
                    return (
                      <div
                        key={doc.id}
                        onClick={() => toggleDocument(doc)}
                        className={`p-3 border rounded-lg cursor-pointer transition-all ${
                          isSelected
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
                              {formatFileSize(doc.fileSize)}
                            </p>
                          </div>
                          {isSelected && (
                            <Check className="w-5 h-5 text-primary flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    )
                  })}
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
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={isUploading}
                />
                {uploadFile ? (
                  <div className="space-y-2">
                    <FileText className="w-12 h-12 text-green-500 mx-auto" />
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
                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600">点击选择PDF文件</p>
                    <p className="text-sm text-gray-400">支持PDF格式，最大 20MB</p>
                  </div>
                )}
              </div>

              {uploadFile && (
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

        {/* Selected Documents with Download Permission */}
        {selected.length > 0 && (
          <div className="border-t p-4 bg-gray-50">
            <h4 className="font-medium text-gray-700 mb-2">已选文档（{selected.length}个）</h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {selected.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between text-sm bg-white p-2 rounded border">
                  <div className="flex items-center space-x-2 flex-1 min-w-0">
                    <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <span className="truncate">{doc.title}</span>
                  </div>
                  <label className="flex items-center space-x-2 flex-shrink-0 ml-2">
                    <input
                      type="checkbox"
                      checked={doc.allowDownload}
                      onChange={() => toggleDownload(doc.id)}
                      className="w-4 h-4"
                    />
                    <span className="text-gray-600">允许下载</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end space-x-3 p-4 border-t">
          <button onClick={onClose} className="btn-secondary" disabled={isUploading}>
            取消
          </button>
          {activeTab === 'library' && (
            <button
              onClick={onClose}
              className="btn-primary"
            >
              确定
            </button>
          )}
          {activeTab === 'upload' && (
            <button
              onClick={handleUpload}
              disabled={!uploadFile || !uploadTitle.trim() || isUploading}
              className="btn-primary disabled:opacity-50"
            >
              {isUploading ? '上传中...' : '上传并选择'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default DocumentSelector
