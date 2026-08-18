import React, { useEffect } from 'react'
import { FileText, Download, ExternalLink, Lock } from 'lucide-react'

export interface DocumentItem {
  id: string
  title: string
  url: string
  allowDownload: boolean
}

// 处理URL，确保是完整路径
const normalizeUrl = (url: string): string => {
  if (!url) return ''
  
  // 如果已经是完整URL，直接返回
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  
  // 对于以 /uploads/ 开头的相对路径，直接返回（浏览器会自动使用当前域名）
  if (url.startsWith('/uploads/')) {
    return url
  }
  
  // 其他情况，拼接基础URL
  const apiBaseUrl = import.meta.env.VITE_API_URL || ''
  const baseUrl = apiBaseUrl.replace(/\/api$/, '').replace(/\/$/, '')
  const path = url.startsWith('/') ? url : `/${url}`
  return `${baseUrl}${path}`
}

interface DocumentViewerProps {
  documents: DocumentItem[]
  className?: string
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ documents, className = '' }) => {
  // 防止下载的保护措施
  useEffect(() => {
    const preventDefault = (e: Event) => {
      e.preventDefault()
      alert('教师已禁用下载，仅支持在线阅读')
      return false
    }

    // 为所有不允许下载的文档添加保护
    documents.forEach(doc => {
      if (!doc.allowDownload) {
        // 阻止右键菜单
        document.addEventListener('contextmenu', preventDefault)
        
        // 阻止快捷键
        const handleKeydown = (e: KeyboardEvent) => {
          if (
            (e.ctrlKey && e.key === 's') ||  // Ctrl+S
            e.key === 'F12' ||  // F12
            (e.ctrlKey && e.shiftKey && e.key === 'I') ||  // Ctrl+Shift+I
            (e.ctrlKey && e.key === 'u')  // Ctrl+U
          ) {
            e.preventDefault()
            alert('教师已禁用下载，仅支持在线阅读')
          }
        }
        document.addEventListener('keydown', handleKeydown)

        return () => {
          document.removeEventListener('contextmenu', preventDefault)
          document.removeEventListener('keydown', handleKeydown)
        }
      }
    })
  }, [documents])

  if (!documents || documents.length === 0) {
    return null
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center space-x-2 mb-4">
        <FileText className="w-5 h-5 text-red-500" />
        <h3 className="text-lg font-semibold text-gray-800">相关文档</h3>
        <span className="text-sm text-gray-500">({documents.length}个文档)</span>
      </div>

      {documents.map((doc, index) => (
        <div key={doc.id || index} className="border rounded-lg overflow-hidden">
          {/* 文档头部 */}
          <div className="bg-gray-100 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center space-x-2 flex-1 min-w-0">
              <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />
              <span className="font-medium text-gray-800 truncate">{doc.title}</span>
            </div>
            
            <div className="flex items-center space-x-2 flex-shrink-0">
              {/* 权限提示 */}
              {!doc.allowDownload && (
                <div className="flex items-center text-red-600 text-sm">
                  <Lock className="w-4 h-4 mr-1" />
                  <span>仅在线阅读</span>
                </div>
              )}
              
              {/* 下载按钮 */}
              {doc.allowDownload && (
                <>
                  <a
                    href={normalizeUrl(doc.url)}
                    download
                    className="p-2 hover:bg-gray-200 rounded transition-colors"
                    title="下载"
                  >
                    <Download className="w-4 h-4 text-gray-600" />
                  </a>
                  <a
                    href={normalizeUrl(doc.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 hover:bg-gray-200 rounded transition-colors"
                    title="新窗口打开"
                  >
                    <ExternalLink className="w-4 h-4 text-gray-600" />
                  </a>
                </>
              )}
            </div>
          </div>
          
          {/* PDF预览区域 */}
          <div className="w-full h-[600px] bg-gray-50 relative">
            <iframe
              src={normalizeUrl(doc.url)}
              className="w-full h-full"
              title={doc.title}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export default DocumentViewer
