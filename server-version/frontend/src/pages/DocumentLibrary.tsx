import React, { useState, useEffect, useRef } from 'react'
import { Plus, Search, FileText, Trash2, Upload, X, AlertCircle, Eye, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import apiClient from '../api/client'
import { ensureCsrfToken } from '../api/client'
import { sessionAxios } from '../api/client'
import type { Document } from '../types'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../components/product-ui'
import MoreActions from '../components/staff-ui/MoreActions'
import { useStaffFeedback } from '../components/staff-ui/useStaffFeedback'

const DocumentLibrary: React.FC = () => {
  const { feedback, confirm, info } = useStaffFeedback()
  const showMessage = (message: unknown) => info('操作提示', String(message || '操作完成'))
  const ask = (message: string) => confirm({ title: '确认操作', body: message, confirmLabel: '确认' })
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
    if (!await ask(`确定要删除文档「${document.title}」吗？`)) return
    
    try {
      const response = await apiClient.delete(`/documents/${document.id}`)
      if (response.code === 0) {
        fetchDocuments()
      }
    } catch (error: any) {
      showMessage(error.message || '删除失败')
    }
  }

  const handleRestore = async (document: Document) => {
    if (!await ask(`确定要恢复文档「${document.title}」吗？`)) return

    try {
      const response = await apiClient.post(`/documents/${document.id}/restore`)
      if (response.code === 0) {
        fetchDocuments()
      }
    } catch (error: any) {
      showMessage(error.message || '恢复失败')
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
    <ProductPage width="management" className="space-y-6">
      {feedback}
      <PageHeader title="文档库" description="管理 PDF 等文档资源，并查看复用情况。" actions={<ProductButton variant="primary" onClick={() => { setShowUploadModal(true); setUploadError(''); setSelectedFile(null); setDocumentTitle(''); setUploadProgress(0) }}><Upload className="w-4 h-4" aria-hidden="true" />上传文档</ProductButton>} />
      <div className="staff-toolbar"><div className="flex flex-wrap items-center gap-3"><label className="staff-search-field"><Search className="w-4 h-4" aria-hidden="true" /><span className="sr-only">搜索文档</span><input type="search" value={searchKeyword} onChange={e=>setSearchKeyword(e.target.value)} onKeyDown={handleSearchKeyDown} placeholder="搜索文档" /></label><ProductButton onClick={handleSearch}>搜索</ProductButton>{isAdmin && <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showDeleted} onChange={e=>{setShowDeleted(e.target.checked);setPage(1)}} />显示已删除</label>}</div><span className="staff-help">共 {total} 个文档</span></div>
      {/* Document list */}
      {loading ? <ProductStatus kind="pending" title="正在加载文档">正在读取文档资源。</ProductStatus>
      : documents.length === 0 ? <ProductStatus kind="info" title="暂无文档">上传第一份文档后，可以在教学内容中复用。</ProductStatus>
      : <div className="staff-table-container"><table className="staff-table"><thead><tr><th>文档</th><th>大小</th><th>使用次数</th><th>状态</th><th className="text-right">操作</th></tr></thead><tbody>
        {documents.map(document => <tr key={document.id} className={(document as any).isDeleted ? 'opacity-60' : ''}>
          <td><button type="button" className="staff-record-button" onClick={() => !(document as any).isDeleted && setPreviewDocument(document)}>{document.title}</button><div className="staff-muted">PDF</div></td>
          <td>{formatFileSize(document.fileSize)}</td><td>{document.usageCount}</td><td><span className={`staff-badge ${(document as any).isDeleted ? 'staff-badge--danger' : 'staff-badge--success'}`}>{(document as any).isDeleted ? '已删除' : '可用'}</span></td>
          <td><div className="staff-table-actions">{(document as any).isDeleted ? <ProductButton onClick={() => void handleRestore(document)}>恢复</ProductButton> : <ProductButton onClick={() => setPreviewDocument(document)}>预览</ProductButton>}{(isAdmin || document.teacherId === user?.id) && !(document as any).isDeleted && <MoreActions label={`${document.title} 的更多操作`}><button type="button" className="staff-danger-action" onClick={() => void handleDelete(document)}>删除文档</button></MoreActions>}</div></td>
        </tr>)}
      </tbody></table></div>}
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
                  className="flex-1 hui-button hui-button--secondary"
                  disabled={isUploading}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!selectedFile || !documentTitle.trim() || isUploading}
                  className="flex-1 hui-button hui-button--primary disabled:opacity-50"
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
    </ProductPage>
  )
}

export default DocumentLibrary
