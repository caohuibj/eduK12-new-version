import React, { useState } from 'react'
import { Play, X, ZoomIn } from 'lucide-react'
import {
  MediaItem,
  parseMediaItems,
  isExternalUrl,
  normalizeImageUrl,
  normalizeVideoUrl,
  handleImageError,
  isBilibiliVideo,
  isYouTubeVideo
} from '../utils/mediaUtils'
import SecureVideoPlayer from './SecureVideoPlayer'

// 获取B站嵌入URL
function getBilibiliEmbedUrl(url: string): string {
  // 支持多种B站链接格式
  // https://www.bilibili.com/video/BV1xx411c7mD
  // https://b23.tv/xxxx
  const bvMatch = url.match(/BV[a-zA-Z0-9]+/)
  const avMatch = url.match(/av(\d+)/)
  
  if (bvMatch) {
    return `https://player.bilibili.com/player.html?bvid=${bvMatch[0]}&page=1&high_quality=1&danmaku=0`
  }
  if (avMatch) {
    return `https://player.bilibili.com/player.html?aid=${avMatch[1]}&page=1&high_quality=1&danmaku=0`
  }
  return ''
}

// 获取YouTube嵌入URL
function getYouTubeEmbedUrl(url: string): string {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/
  const match = url.match(regExp)
  if (match && match[2].length === 11) {
    return `https://www.youtube.com/embed/${match[2]}`
  }
  return ''
}

interface MediaRendererProps {
  /** 媒体数据，支持多种格式 */
  data: any
  /** 媒体类型 */
  type: 'video' | 'image'
  /** 是否启用弹窗播放 */
  enableModal?: boolean
  /** 弹窗播放回调 */
  onPlay?: (item: MediaItem) => void
  /** 自定义类名 */
  className?: string
  /** 水印文字（视频和图片都支持） */
  watermarkText?: string
  /** 当前用户ID（仅视频） */
  userId?: string
}

/**
 * 统一媒体渲染组件
 * 支持视频和图片的渲染，自动处理各种数据格式
 */
export const MediaRenderer: React.FC<MediaRendererProps> = ({
  data,
  type,
  enableModal = true,
  onPlay,
  className = '',
  watermarkText,
  userId
}) => {
  const items = parseMediaItems(data)
  
  if (items.length === 0) return null
  
  if (type === 'video') {
    return (
      <div className={`space-y-3 ${className}`}>
        {items.map((item, index) => (
          <VideoItemRenderer
            key={index}
            item={item}
            enableModal={enableModal}
            onPlay={onPlay}
            watermarkText={watermarkText}
            userId={userId}
          />
        ))}
      </div>
    )
  }
  
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 ${className}`}>
      {items.map((item, index) => (
        <ImageItemRenderer key={index} item={item} watermarkText={watermarkText} />
      ))}
    </div>
  )
}

/**
 * 单个视频项渲染
 */
interface VideoItemRendererProps {
  item: MediaItem
  enableModal: boolean
  onPlay?: (item: MediaItem) => void
  watermarkText?: string
  userId?: string
}

const VideoItemRenderer: React.FC<VideoItemRendererProps> = ({
  item,
  enableModal,
  onPlay,
  watermarkText,
  userId
}) => {
  const [showPlayer, setShowPlayer] = useState(false)
  const [showEmbedPlayer, setShowEmbedPlayer] = useState(false)
  const videoUrl = normalizeVideoUrl(item.url)
  const isExternal = isExternalUrl(videoUrl)
  
  // 外部视频链接
  if (isExternal) {
    const isBilibili = isBilibiliVideo(videoUrl)
    const isYouTube = isYouTubeVideo(videoUrl)
    const embedUrl = isBilibili ? getBilibiliEmbedUrl(videoUrl) : isYouTube ? getYouTubeEmbedUrl(videoUrl) : ''
    
    // B站/YouTube使用iframe嵌入播放
    if (showEmbedPlayer && embedUrl) {
      return (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium text-gray-800">{item.title || '外部视频'}</p>
            <button
              onClick={() => setShowEmbedPlayer(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="relative aspect-video bg-black rounded overflow-hidden">
            <iframe
              src={embedUrl}
              className="w-full h-full"
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              style={{ border: 'none' }}
            />
          </div>
        </div>
      )
    }
    
    // 其他外部视频(如腾讯云COS)使用弹窗播放
    const handleExternalPlay = () => {
      if (enableModal && onPlay) {
        onPlay(item)
      } else {
        setShowPlayer(true)
      }
    }
    
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="font-medium text-gray-800 mb-2">{item.title || '外部视频'}</p>
        <div className="flex items-center space-x-4">
          {embedUrl ? (
            <button
              onClick={() => setShowEmbedPlayer(true)}
              className="text-sm text-primary hover:underline flex items-center"
            >
              <Play className="w-4 h-4 mr-1" />
              {isBilibili ? '播放B站视频' : isYouTube ? '播放YouTube视频' : '播放视频'}
            </button>
          ) : (
            <button
              onClick={handleExternalPlay}
              className="text-sm text-primary hover:underline flex items-center"
            >
              <Play className="w-4 h-4 mr-1" />
              点击观看视频
            </button>
          )}
        </div>
      </div>
    )
  }
  
  // 本地视频
  const handlePlay = () => {
    if (enableModal && onPlay) {
      onPlay(item)
    } else {
      setShowPlayer(true)
    }
  }
  
  if (showPlayer && !enableModal) {
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <SecureVideoPlayer
          src={videoUrl}
          title={item.title || '视频'}
          userId={userId}
          watermarkText={watermarkText}
          className="w-full"
        />
      </div>
    )
  }
  
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="font-medium text-gray-800 mb-2">{item.title || '视频'}</p>
      <button
        onClick={handlePlay}
        className="text-sm text-primary hover:underline flex items-center"
      >
        <Play className="w-4 h-4 mr-1" />
        点击观看视频
      </button>
    </div>
  )
}

/**
 * 单个图片项渲染
 */
interface ImageItemRendererProps {
  item: MediaItem
  watermarkText?: string
}

const ImageItemRenderer: React.FC<ImageItemRendererProps> = ({ item, watermarkText }) => {
  const [showPreview, setShowPreview] = useState(false)
  const imageUrl = normalizeImageUrl(item.url)
  
  return (
    <>
      <div
        onClick={() => setShowPreview(true)}
        className="aspect-square rounded-lg overflow-hidden border hover:border-primary transition-colors block relative group cursor-pointer"
      >
        <img
          src={imageUrl}
          alt={item.name || '图片'}
          className="w-full h-full object-cover"
          onError={handleImageError}
          loading="lazy"
        />
        {/* 悬停提示 */}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <ZoomIn className="w-8 h-8 text-white" />
        </div>
      </div>
      
      {/* 图片预览弹窗 */}
      {showPreview && (
        <ImagePreviewModal
          imageUrl={imageUrl}
          imageName={item.name || '图片'}
          watermarkText={watermarkText}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  )
}

/**
 * 视频列表组件（带弹窗播放）
 */
interface VideoListProps {
  videos: any
  title?: string
  watermarkText?: string
  userId?: string
  className?: string
}

export const VideoList: React.FC<VideoListProps> = ({
  videos,
  title = '关联视频',
  watermarkText,
  userId,
  className = ''
}) => {
  const items = parseMediaItems(videos)
  const [playingVideo, setPlayingVideo] = useState<MediaItem | null>(null)
  
  if (items.length === 0) return null
  
  return (
    <>
      <div className={`card ${className}`}>
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
          <Play className="w-5 h-5 mr-2" />
          {title} ({items.length})
        </h3>
        <MediaRenderer
          data={videos}
          type="video"
          enableModal={true}
          onPlay={setPlayingVideo}
          watermarkText={watermarkText}
          userId={userId}
        />
      </div>
      
      {/* 视频播放弹窗 */}
      {playingVideo && (
        <VideoPlayerModal
          item={playingVideo}
          onClose={() => setPlayingVideo(null)}
          watermarkText={watermarkText}
          userId={userId}
        />
      )}
    </>
  )
}

/**
 * 图片列表组件
 */
interface ImageListProps {
  images: any
  title?: string
  watermarkText?: string
  className?: string
}

export const ImageList: React.FC<ImageListProps> = ({
  images,
  title = '相关图片',
  watermarkText,
  className = ''
}) => {
  const items = parseMediaItems(images)
  
  if (items.length === 0) return null
  
  return (
    <div className={`card ${className}`}>
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">
        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {title} ({items.length})
      </h3>
      <MediaRenderer data={images} type="image" watermarkText={watermarkText} />
    </div>
  )
}

/**
 * 图片预览弹窗
 */
interface ImagePreviewModalProps {
  imageUrl: string
  imageName: string
  watermarkText?: string
  onClose: () => void
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  imageUrl,
  imageName,
  watermarkText,
  onClose
}) => {
  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[90vh]">
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 p-2 text-white hover:text-gray-300 z-10"
          title="关闭"
        >
          <X className="w-6 h-6" />
        </button>
        
        {/* 图片容器 */}
        <div className="relative">
          <img
            src={imageUrl}
            alt={imageName}
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        
        {/* 图片名称 */}
        <p className="text-white text-center mt-4 text-sm">{imageName}</p>
      </div>
    </div>
  )
}

/**
 * 视频播放弹窗
 */
interface VideoPlayerModalProps {
  item: MediaItem
  onClose: () => void
  watermarkText?: string
  userId?: string
}

const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  item,
  onClose,
  watermarkText,
  userId
}) => {
  const videoUrl = normalizeVideoUrl(item.url)
  
  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-black rounded-lg overflow-hidden max-w-5xl w-full"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h3 className="text-white font-medium truncate flex-1 mr-4">
            {item.title || '视频播放'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4">
          <SecureVideoPlayer
            src={videoUrl}
            title={item.title || '视频'}
            userId={userId}
            watermarkText={watermarkText}
            className="w-full"
          />
        </div>
      </div>
    </div>
  )
}

export default MediaRenderer
