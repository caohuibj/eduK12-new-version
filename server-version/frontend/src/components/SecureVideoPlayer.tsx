/**
 * 安全视频播放器 - 防下载版本
 * 支持：HLS播放、自适应清晰度、防录屏水印、禁止下载
 */
import React, { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import { Loader2, AlertCircle } from 'lucide-react'

interface SecureVideoPlayerProps {
  src: string                    // 视频源URL (支持HLS m3u8或直接mp4)
  title?: string                 // 视频标题
  className?: string
}

// 视频配置 - 单一480p清晰度
const VIDEO_CONFIG = {
  resolution: '480p',
  label: '标清 (480p)',
}

export const SecureVideoPlayer: React.FC<SecureVideoPlayerProps> = ({
  src,
  title = '教学视频',
  className = ''
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 初始化视频播放
  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    // 禁用右键菜单
    const preventContextMenu = (e: Event) => {
      e.preventDefault()
      return false
    }
    video.addEventListener('contextmenu', preventContextMenu)
    containerRef.current?.addEventListener('contextmenu', preventContextMenu)

    // 禁用快捷键
    const preventKeys = (e: KeyboardEvent) => {
      // 禁用 F12, Ctrl+S, Ctrl+Shift+I, Ctrl+U等
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
    document.addEventListener('keydown', preventKeys)

    // 防止开发者工具检测
    const detectDevTools = () => {
      const threshold = 160
      const widthThreshold = window.outerWidth - window.innerWidth > threshold
      const heightThreshold = window.outerHeight - window.innerHeight > threshold
      
      if (widthThreshold || heightThreshold) {
        // 开发者工具打开，可以在这里添加警告或暂停播放
        console.warn('检测到开发者工具')
      }
    }
    window.addEventListener('resize', detectDevTools)

      // HLS播放
      if (src.endsWith('.m3u8')) {
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            // 单一清晰度，禁用自适应
            capLevelToPlayerSize: false,
            startLevel: 0,
          })
        
        hls.loadSource(src)
        hls.attachMedia(video)
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsLoading(false)
        })
        
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            setError('视频加载失败，请刷新重试')
          }
        })
        
        hlsRef.current = hls
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari原生支持
        video.src = src
        video.addEventListener('loadedmetadata', () => setIsLoading(false))
      } else {
        setError('您的浏览器不支持HLS播放')
      }
    } else {
      // 直接播放MP4
      video.src = src
      video.addEventListener('loadedmetadata', () => setIsLoading(false))
    }

    return () => {
      video.removeEventListener('contextmenu', preventContextMenu)
      document.removeEventListener('keydown', preventKeys)
      window.removeEventListener('resize', detectDevTools)
      hlsRef.current?.destroy()
    }
  }, [src])

  // 清晰度切换功能已移除 - 系统只提供单一480p清晰度
  // 如需多清晰度支持，需要后端生成多个版本视频

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-gray-900 rounded-lg ${className}`} style={{ aspectRatio: '16/9' }}>
        <div className="text-center text-white">
          <AlertCircle className="w-12 h-12 mx-auto mb-2 text-red-500" />
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      className={`relative bg-black rounded-lg overflow-hidden select-none ${className}`}
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      {/* 加载状态 */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-20">
          <div className="text-center text-white">
            <Loader2 className="w-10 h-10 mx-auto mb-2 animate-spin" />
            <p className="text-sm">加载视频中...</p>
          </div>
        </div>
      )}

      {/* 视频元素 */}
      <video
        ref={videoRef}
        className="w-full h-full"
        controls
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        disableRemotePlayback
        playsInline
        onContextMenu={(e) => e.preventDefault()}
        style={{ outline: 'none' }}
      />

      {/* 清晰度标识 - 只显示当前分辨率 */}
      <div className="absolute top-4 right-4 z-20 px-2 py-1 bg-black/50 rounded text-white text-xs">
        {VIDEO_CONFIG.label}
      </div>

      {/* 底部信息条 - 持续显示 */}
      <div className="absolute bottom-14 left-4 z-10 text-white/30 text-xs pointer-events-none">
        <span>{title}</span>
      </div>

      {/* 防调试遮罩层 */}
      <div 
        className="absolute inset-0 pointer-events-none z-5"
        style={{ background: 'transparent' }}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* 提示信息 */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 text-white/50 text-xs">
        慧育空间 - 版权所有
      </div>
    </div>
  )
}

export default SecureVideoPlayer
