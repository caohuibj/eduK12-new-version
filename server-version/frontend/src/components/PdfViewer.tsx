import ModalSurface from './shared-ui/ModalSurface'
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
  allowDownload?: boolean
}

const PdfViewer: React.FC<PdfViewerProps> = ({ isOpen, onClose, url, title, allowDownload = true }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1.5)
  const [pageSize, setPageSize] = useState({ width: 595, height: 842 })
  const [available, setAvailable] = useState({ width: 595, height: 842 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadEpoch, setLoadEpoch] = useState(0)

  // Use the signed content URL without embedding it or changing its security headers.
  useEffect(() => {
    if (!isOpen || !url) return
    let active = true
    setLoading(true)
    setError(null)
    setPdfDoc(null)
    setTotalPages(0)
    setCurrentPage(1)
    const task = pdfjsLib.getDocument({ url, cMapUrl: '/cmaps/', cMapPacked: true, standardFontDataUrl: '/standard_fonts/' })
    void task.promise.then(pdf => {
      if (active) { setPdfDoc(pdf); setTotalPages(pdf.numPages) }
    }).catch(() => {
      if (active) setError('文档加载失败，请重试')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; void task.destroy().catch(() => undefined) }
  }, [isOpen, url, loadEpoch])

  useEffect(() => {
    if (!isOpen || !pdfDoc || !canvasRef.current) return
    let active = true
    let rendering: pdfjsLib.RenderTask | undefined
    void pdfDoc.getPage(currentPage).then(page => {
      const canvas = canvasRef.current
      if (!active || !canvas) return
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas unavailable')
      const unit = page.getViewport({ scale: 1 })
      setPageSize({ width: unit.width, height: unit.height })
      const viewport = page.getViewport({ scale })
      canvas.height = viewport.height
      canvas.width = viewport.width
      rendering = page.render({ canvasContext: context, canvas, viewport })
      return rendering.promise
    }).catch(() => { if (active) setError('页面显示失败，请重试') })
    return () => { active = false; rendering?.cancel() }
  }, [isOpen, pdfDoc, currentPage, scale])

  useEffect(() => {
    if (!isOpen || !containerRef.current || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (rect) setAvailable({ width: Math.max(1, rect.width - 32), height: Math.max(1, rect.height - 32) })
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [isOpen])
  const fitScale = Math.min(available.width / pageSize.width, available.height / pageSize.height)

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

    }
  }

  if (!isOpen) return null

  return (
    <ModalSurface open onClose={onClose} className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col">
    <div onKeyDown={handleKeyDown} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title || "PDF \u6587\u6863"} className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <h3 className="text-lg font-medium truncate min-w-0 max-w-[55vw] sm:max-w-md">
            {title || 'PDF 文档'}
          </h3>
          {totalPages > 0 && (
            <span className="shrink-0 text-sm text-gray-400">
              第 {currentPage} / {totalPages} 页
            </span>
          )}
        </div>
        <button
          onClick={onClose} aria-label="关闭PDF预览"
          className="min-h-11 min-w-11 inline-flex items-center justify-center p-2 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-center gap-2 px-2 py-2 bg-gray-800 text-white">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
          {/* 页码控制 */}
          <div className="flex items-center space-x-2">
            <button
              onClick={goToPrevPage}
              aria-label="上一页"
              disabled={currentPage <= 1}
              className="min-h-11 min-w-11 inline-flex items-center justify-center p-2 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm min-w-[60px] text-center">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={goToNextPage}
              aria-label="下一页"
              disabled={currentPage >= totalPages}
              className="min-h-11 min-w-11 inline-flex items-center justify-center p-2 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="w-px h-6 bg-gray-600"></div>

          {/* 缩放控制 */}
          <div className="flex items-center space-x-2">
            <button
              onClick={zoomOut}
              aria-label="缩小文档"
              disabled={scale <= 0.5}
              className="min-h-11 min-w-11 inline-flex items-center justify-center p-2 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <span className="text-sm min-w-[50px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={zoomIn}
              aria-label="放大文档"
              disabled={scale >= 3}
              className="min-h-11 min-w-11 inline-flex items-center justify-center p-2 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
          </div>

          <div className="w-px h-6 bg-gray-600"></div>

          {/* Preserve the author's attachment download-button setting. */}
          {allowDownload && <a
            href={url}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-11 min-w-11 inline-flex items-center justify-center p-2 hover:bg-gray-700 rounded transition-colors"
            title="下载文档"
            aria-label="下载文档"
          >
            <Download className="w-5 h-5" />
          </a>}
        </div>
      </div>

      {/* Content */}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto">
        <div className="min-h-full min-w-full flex p-4">
        {loading ? (
          <div className="flex flex-col items-center text-white">
            <Loader2 className="w-10 h-10 animate-spin mb-4" />
            <span>正在加载文档...</span>
          </div>
        ) : error ? (
          <div className="text-white text-center">
            <p role="alert" className="text-red-400 mb-2">{error}</p>
            <button type="button" onClick={() => setLoadEpoch(value => value + 1)} className="min-h-11 mr-3 px-4 py-2 bg-gray-700 rounded hover:bg-gray-600">重试加载文档</button>
            <button
              onClick={onClose} aria-label="关闭PDF预览"
              className="px-4 py-2 bg-gray-700 rounded hover:bg-gray-600"
            >
              关闭
            </button>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            aria-label={`${title || 'PDF 文档'}，第 ${currentPage} 页`}
            style={{ width: pageSize.width * fitScale * scale / 1.5, height: pageSize.height * fitScale * scale / 1.5 }}
            className="shrink-0 m-auto shadow-2xl"
          />
        )}
      </div>

      </div>

      {/* 提示 */}
      <div className="text-center px-3 py-2 bg-gray-900 text-gray-300 text-sm">
        使用左右方向键翻页 | 按 Esc 关闭
      </div>
    </div>
    </ModalSurface>
  )
}

export default PdfViewer
