import React, { useEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, Download } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// 设置 PDF.js worker（使用本地文件，避免CDN版本不存在的问题）
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

interface PdfViewerProps {
  isOpen: boolean
  onClose: () => void
  url: string
  title?: string
}

const PdfViewer: React.FC<PdfViewerProps> = ({ isOpen, onClose, url, title }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1.5)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 加载 PDF
  useEffect(() => {
    if (!isOpen || !url) return

    const loadPdf = async () => {
      setLoading(true)
      setError(null)
      setCurrentPage(1)

      try {
        const loadingTask = pdfjsLib.getDocument({
          url: url,
          cMapUrl: '/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/standard_fonts/'
        })
        const pdf = await loadingTask.promise
        setPdfDoc(pdf)
        setTotalPages(pdf.numPages)
      } catch (err: any) {
        console.error('PDF 加载失败:', err)
        setError('文档加载失败，请稍后重试')
      } finally {
        setLoading(false)
      }
    }

    loadPdf()
  }, [isOpen, url])

  // 渲染页面
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return

    const renderPage = async () => {
      try {
        const page = await pdfDoc.getPage(currentPage)
        const canvas = canvasRef.current
        if (!canvas) return

        const context = canvas.getContext('2d')
        if (!context) return

        const viewport = page.getViewport({ scale })
        canvas.height = viewport.height
        canvas.width = viewport.width

        const renderContext = {
          canvasContext: context,
          canvas,
          viewport: viewport,
        }

        await page.render(renderContext).promise
      } catch (err) {
        console.error('页面渲染失败:', err)
      }
    }

    renderPage()
  }, [pdfDoc, currentPage, scale])

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1)
    }
  }

  const zoomIn = () => {
    if (scale < 3) {
      setScale(scale + 0.25)
    }
  }

  const zoomOut = () => {
    if (scale > 0.5) {
      setScale(scale - 0.25)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      goToPrevPage()
    } else if (e.key === 'ArrowRight') {
      goToNextPage()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col"
      ref={containerRef}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-medium truncate max-w-md">
            {title || 'PDF 文档'}
          </h3>
          {totalPages > 0 && (
            <span className="text-sm text-gray-400">
              第 {currentPage} / {totalPages} 页
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-center px-4 py-2 bg-gray-800 text-white">
        <div className="flex items-center space-x-4">
          {/* 页码控制 */}
          <div className="flex items-center space-x-2">
            <button
              onClick={goToPrevPage}
              disabled={currentPage <= 1}
              className="p-2 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm min-w-[60px] text-center">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={goToNextPage}
              disabled={currentPage >= totalPages}
              className="p-2 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="w-px h-6 bg-gray-600"></div>

          {/* 缩放控制 */}
          <div className="flex items-center space-x-2">
            <button
              onClick={zoomOut}
              disabled={scale <= 0.5}
              className="p-2 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <span className="text-sm min-w-[50px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={zoomIn}
              disabled={scale >= 3}
              className="p-2 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
          </div>

          <div className="w-px h-6 bg-gray-600"></div>

          {/* 下载按钮 */}
          <a
            href={url}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 hover:bg-gray-700 rounded transition-colors"
            title="下载文档"
          >
            <Download className="w-5 h-5" />
          </a>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        {loading ? (
          <div className="flex flex-col items-center text-white">
            <Loader2 className="w-10 h-10 animate-spin mb-4" />
            <span>正在加载文档...</span>
          </div>
        ) : error ? (
          <div className="text-white text-center">
            <p className="text-red-400 mb-2">{error}</p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
            >
              关闭
            </button>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-full shadow-2xl"
          />
        )}
      </div>

      {/* 提示 */}
      <div className="text-center py-2 text-gray-500 text-sm">
        使用左右方向键翻页 | 按 Esc 关闭
      </div>
    </div>
  )
}

export default PdfViewer
