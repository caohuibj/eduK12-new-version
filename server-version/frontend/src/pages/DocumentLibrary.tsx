import React, { useState, useEffect, useRef } from 'react'
import { Plus, Search, FileText, Trash2, Upload, X, AlertCircle, Eye, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import apiClient from '../api/client'
import { ensureCsrfToken } from '../api/client'
import axios from 'axios'
import type { Document } from '../types'

const DocumentLibrary: React.FC = () => {
  const { user } = useAuth()
  const [documents, setDocuments] = useState<Document[]>([])
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
  const [documentTitle, setDocumentTitle] = useState('')
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isAdmin = user?.role === 'ADMIN'

  useEffect(() => {
    fetchDocuments()
  }, [page, keyword, showDeleted])

  const fetchDocuments = async () => {
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
      const response = await apiClient.get(`/documents?${params.toString()}`)
      if (response.code === 0) {
        setDocuments(response.data.list)
        setTotal(response.data.total)
        setTotalPages(response.data.totalPages)
      }
    } catch (error) {
      console.error('获取文档列表失败:', error)
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

    setSelectedFile(file)
    setDocumentTitle(file.name.replace(/\.pdf$/i, ''))
    setUploadError('')
  }

  const handleUpload = async () => {
    if (!selectedFile || !documentTitle.trim()) {
      setUploadError('请选择文件并输入文档标题')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)
    setUploadError('')

    try {
      const formData = new FormData()
      formData.append('document', selectedFile)
      formData.append('title', documentTitle.trim())

      const csrfToken = await ensureCsrfToken()
      const response = await axios.post('/api/documents/upload', formData, {
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
        setShowUploadModal(false)
        setSelectedFile(null)
        setDocumentTitle('')
        setUploadProgress(0)
        fetchDocuments()
      } else {
        setUploadError(response.data.message || '上传失败')
      }
    } catch (error: any) {
      setUploadError(error.response?.data?.message || error.message || '上传失败')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (document: Document) => {
    if (!window.confirm(`确定要删除文档「${document.title}」吗？`)) return
    
    try {
      const response = await apiClient.delete(`/documents/${document.id}`)
      if (response.code === 0) {
        fetchDocuments()
      }
    } catch (error: any) {
      alert(error.message || '删除失败')
    }
  }

  const handleRestore = async (document: Document) => {
    if (!window.confirm(`确定要恢复文档「${document.title}」吗？`)) return

    try {
      const response = await apiClient.post(`/documents/${document.id}/restore`)
      if (response.code === 0) {
        fetchDocuments()
      }
    } catch (error: any) {
      alert(error.message || '恢复失败')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

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
              placeholder="搜索文档..."
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
            setDocumentTitle('')
            setUploadProgress(0)
          }}
          className="btn-primary flex items-center space-x-2"
        >
          <Upload className="w-4 h-4" />
          <span>上传文档</span>
        </button>
      </div>

      {/* Document Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">暂无文档</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {documents.map((document) => (
            <div key={document.id} className={`card hover:shadow-lg transition-shadow ${(document as any).isDeleted ? 'opacity-60' : ''}`}>
              {/* Document Icon */}
              <div className="aspect-video bg-red-50 rounded-lg mb-4 flex items-center justify-center relative">
                <FileText className="w-16 h-16 text-red-500" />
                {(document as any).isDeleted && (
                  <div className="absolute top-2 left-2 px-2 py-1 bg-red-500 text-white text-xs rounded">
                    已删除
                  </div>
                )}
              </div>

              {/* Document Info */}
              <h3 className="text-lg font-semibold text-gray-800 mb-2 break-words">{document.title}</h3>
              
              <div className="space-y-1 text-sm text-gray-500 mb-4">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4" />
                  <span>{formatFileSize(document.fileSize)}</span>
                </div>
                <div>格式: PDF</div>
                <div>使用 {document.usageCount} 次</div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t">
                {(document as any).isDeleted ? (
                  <button
                    onClick={() => handleRestore(document)}
                    className="text-green-600 hover:text-green-700 text-sm flex items-center space-x-1"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>恢复</span>
                  </button>
                ) : (
                  <button 
                    onClick={() => setPreviewDocument(document)}
                    className="text-primary hover:text-primary-hover text-sm"
                  >
                    预览
                  </button>
                )}
                {(isAdmin || document.teacherId === user?.id) && (
                  <button
                    onClick={() => handleDelete(document)}
                    className="p-1 text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <div className="text-sm text-gray-500">
            共 {total} 个文档，第 {page}/{totalPages} 页
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
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">上传PDF文档</h3>
              <button
                onClick={() => {
                  setShowUploadModal(false)
                  setSelectedFile(null)
                  setDocumentTitle('')
                  setUploadError('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {uploadError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-red-600">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm">{uploadError}</span>
                </div>
              )}

              <div
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className={`border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary cursor-pointer transition-colors ${isUploading ? 'pointer-events-none opacity-50' : ''}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={isUploading}
                />
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">点击选择PDF文件</p>
                <p className="text-gray-400 text-sm mt-1">支持PDF格式，最大 20MB</p>
              </div>

              {selectedFile && (
                <div>
                  <label className="label">文档标题 *</label>
                  <input
                    type="text"
                    value={documentTitle}
                    onChange={(e) => setDocumentTitle(e.target.value)}
                    className="input w-full"
                    placeholder="输入文档标题"
                    disabled={isUploading}
                  />
                  <p className="text-xs text-gray-500 mt-1">文件: {selectedFile.name} ({formatFileSize(selectedFile.size)})</p>
                </div>
              )}

              {isUploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>上传中...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadModal(false)
                    setSelectedFile(null)
                    setDocumentTitle('')
                    setUploadError('')
                  }}
                  className="flex-1 btn-secondary"
                  disabled={isUploading}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!selectedFile || !documentTitle.trim() || isUploading}
                  className="flex-1 btn-primary disabled:opacity-50"
                >
                  {isUploading ? '上传中...' : '上传'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewDocument && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg overflow-hidden max-w-5xl w-full h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-medium truncate flex-1 mr-4">{previewDocument.title}</h3>
              <button
                onClick={() => setPreviewDocument(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe
                src={previewDocument.url || `/uploads/documents/${previewDocument.fileName}`}
                className="w-full h-full"
                title={previewDocument.title}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DocumentLibrary
