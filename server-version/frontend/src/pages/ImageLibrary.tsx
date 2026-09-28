import React, { useState, useEffect, useRef } from 'react'
import { Plus, Search, Image as ImageIcon, Trash2, Upload, X, AlertCircle, Eye, Edit2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import apiClient from '../api/client'
import { ensureCsrfToken } from '../api/client'
import { sessionAxios } from '../api/client'
import { PageHeader, ProductButton, ProductPage, ProductStatus } from '../components/product-ui'
import { useStaffFeedback } from '../components/staff-ui/useStaffFeedback'

interface ImageItem {
  id: string
  url: string
  filename: string
  name: string
  size: number
  createdAt: string
}

const ImageLibrary: React.FC = () => {
  const { feedback, info } = useStaffFeedback()
  const showMessage = (message: unknown) => info('操作提示', String(message || '操作完成'))
  const { user } = useAuth()
  const [images, setImages] = useState<ImageItem[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewImage, setPreviewImage] = useState<ImageItem | null>(null)
  const [editingImage, setEditingImage] = useState<ImageItem | null>(null)
  const [editName, setEditName] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchImages()
  }, [])

  const fetchImages = async () => {
    try {
      setLoading(true)
      // 从后端获取图片列表
      const response = await apiClient.get('/uploads/images')
      if (response.code === 0) {
        setImages(response.data.list || [])
      }
    } catch (error) {
      console.error('获取图片列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setUploadError('不支持的文件格式，请上传 JPG、PNG、GIF 或 WebP 格式的图片')
      return
    }

    // 验证文件大小 (10MB)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      setUploadError('文件大小超过 10MB 限制')
      return
    }

    setSelectedFile(file)
    setUploadError('')
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError('请选择图片文件')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)
    setUploadError('')

    try {
      const formData = new FormData()
      formData.append('image', selectedFile)

      const csrfToken = await ensureCsrfToken()
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
        setShowUploadModal(false)
        setSelectedFile(null)
        setUploadProgress(0)
        fetchImages()
      } else {
        setUploadError(response.data.message || '上传失败')
      }
    } catch (error: any) {
      setUploadError(error.response?.data?.message || '上传失败，请重试')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (image: ImageItem) => {
    if (!confirm(`确定要删除图片 "${image.name}" 吗？`)) return

    try {
      const response = await apiClient.delete(`/uploads/images/${image.filename}`)
      if (response.code === 0) {
        fetchImages()
      } else {
        showMessage(response.message || '删除失败')
      }
    } catch (error) {
      console.error('删除图片失败:', error)
      showMessage('删除失败')
    }
  }

  const handleRenameImage = async () => {
    if (!editingImage || !editName.trim()) return
    
    setIsUpdating(true)
    try {
      const response = await apiClient.put(`/uploads/images/${editingImage.filename}`, { 
        newName: editName.trim() 
      })
      if (response.code === 0) {
        setEditingImage(null)
        setEditName('')
        fetchImages()
      } else {
        showMessage(response.message || '重命名失败')
      }
    } catch (error: any) {
      showMessage(error.message || '重命名失败')
    } finally {
      setIsUpdating(false)
    }
  }

  const openEditModal = (image: ImageItem) => {
    setEditingImage(image)
    // 提取文件名（不含扩展名）
    const nameWithoutExt = image.name.replace(/\.[^/.]+$/, '')
    setEditName(nameWithoutExt)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const filteredImages = images.filter(img =>
    img.name.toLowerCase().includes(keyword.toLowerCase())
  )

  // 禁用右键菜单
  const preventContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    return false
  }

  // 禁用快捷键
  const preventKeys = (e: KeyboardEvent) => {
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.key === 's') ||
      (e.ctrlKey && e.shiftKey && e.key === 'I') ||
      (e.ctrlKey && e.key === 'u') ||
      (e.metaKey && e.key === 's')
    ) {
      e.preventDefault()
      return false
    }
  }

  // 监听快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => preventKeys(e)
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <ProductPage width="management" className="space-y-6">
      {feedback}
      <PageHeader title="图片库" description="按视觉浏览和复用课堂、问卷与测评图片。" actions={<ProductButton variant="primary" onClick={() => setShowUploadModal(true)}><Plus className="w-4 h-4" aria-hidden="true" />上传图片</ProductButton>} />
      <div className="staff-toolbar"><label className="staff-search-field"><Search className="w-4 h-4" aria-hidden="true" /><span className="sr-only">搜索图片</span><input type="search" value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="搜索图片" /></label><span className="staff-help">当前显示 {filteredImages.length} 张图片</span></div>
      {/* Image Grid */}
      {loading ? (
        <ProductStatus kind="pending" title="正在加载图片">正在读取图片资源。</ProductStatus>
      ) : filteredImages.length === 0 ? (
        <ProductStatus kind="info" title="暂无图片">上传第一张图片后，可以在支持图片的内容中复用。</ProductStatus>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {filteredImages.map((image) => (
            <div key={image.id} className="group relative" onContextMenu={preventContextMenu}>
              <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                <img
                  src={image.url}
                  alt={image.name}
                  className="w-full h-full object-cover select-none pointer-events-none"
                  style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                  onContextMenu={preventContextMenu}
                  draggable={false}
                />
              </div>
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 space-x-3">
                <button
                  onClick={() => setPreviewImage(image)}
                  className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600"
                  title="预览"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => openEditModal(image)}
                  className="p-2 bg-green-500 text-white rounded-full hover:bg-green-600"
                  title="重命名"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(image)}
                  className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2">
                <p className="text-sm truncate" title={image.name}>{image.name}</p>
                <p className="text-xs text-gray-500">{formatFileSize(image.size)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview Modal - 防下载保护 */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50" 
          onClick={() => setPreviewImage(null)}
          onContextMenu={preventContextMenu}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onContextMenu={preventContextMenu}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 p-2 text-white hover:text-gray-300"
              title="关闭"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewImage.url}
              alt={previewImage.name}
              className="max-w-full max-h-[85vh] object-contain rounded-lg select-none pointer-events-none"
              style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
              onContextMenu={preventContextMenu}
              draggable={false}
              onClick={(e) => e.stopPropagation()}
            />
            <p className="text-white text-center mt-4 text-sm select-none">{previewImage.name}</p>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">上传图片</h3>
              <button
                onClick={() => {
                  setShowUploadModal(false)
                  setSelectedFile(null)
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
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary cursor-pointer transition-colors"
              >
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">点击选择图片</p>
                <p className="text-gray-400 text-sm mt-1">支持 JPG、PNG、GIF、WebP，最大 10MB</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {selectedFile && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium">已选择: {selectedFile.name}</p>
                  <p className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</p>
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
                    setUploadError('')
                  }}
                  className="flex-1 hui-button hui-button--secondary"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!selectedFile || isUploading}
                  className="flex-1 hui-button hui-button--primary disabled:opacity-50"
                >
                  {isUploading ? '上传中...' : '上传'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Image Modal */}
      {editingImage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">重命名图片</h3>
              <button
                onClick={() => {
                  setEditingImage(null)
                  setEditName('')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center space-x-4">
                <img
                  src={editingImage.url}
                  alt={editingImage.name}
                  className="w-20 h-20 object-cover rounded"
                />
                <div className="flex-1">
                  <label className="label">图片名称</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="input w-full"
                    placeholder="请输入图片名称"
                    disabled={isUpdating}
                  />
                </div>
              </div>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingImage(null)
                    setEditName('')
                  }}
                  className="flex-1 hui-button hui-button--secondary"
                  disabled={isUpdating}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleRenameImage}
                  disabled={!editName.trim() || isUpdating}
                  className="flex-1 hui-button hui-button--primary disabled:opacity-50"
                >
                  {isUpdating ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ProductPage>
  )
}

export default ImageLibrary
