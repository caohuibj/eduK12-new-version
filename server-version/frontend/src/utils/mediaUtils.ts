/**
 * 统一媒体处理工具函数
 * 处理图片、视频的URL解析和格式转换
 */

// 统一媒体项接口
export interface MediaItem {
  type?: 'library' | 'external' | 'upload'
  url: string
  title?: string
  name?: string
  source?: string  // bilibili, youtube等
}

/**
 * 解析媒体数组，支持多种格式：
 * - JSON字符串: '[{"url":"..."}]'
 * - 对象数组: [{url: '...'}]
 * - 字符串数组: ['url1', 'url2']
 */
export function parseMediaItems(data: any): MediaItem[] {
  if (!data) return []
  
  // 如果是字符串，尝试解析JSON
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      return []
    }
  }
  
  // 如果不是数组，返回空
  if (!Array.isArray(data)) return []
  
  return data.map((item: any, index: number): MediaItem => {
    // 如果是字符串，转换为对象格式
    if (typeof item === 'string') {
      return {
        url: item,
        title: `媒体 ${index + 1}`,
        name: `媒体 ${index + 1}`,
        type: detectMediaType(item)
      }
    }
    
    // 如果是对象，确保有url字段
    if (item && typeof item === 'object') {
      // 多级fallback：url -> processedUrl -> originalUrl -> 基于fileName构造
      const url = item.url || item.processedUrl || item.originalUrl || (item.fileName && `/uploads/videos/${item.fileName}`) || ''
      return {
        type: item.type || detectMediaType(url),
        url: url,
        title: item.title || item.name || `媒体 ${index + 1}`,
        name: item.name || item.title || `媒体 ${index + 1}`,
        source: item.source
      }
    }
    
    return { url: '', title: `媒体 ${index + 1}`, name: `媒体 ${index + 1}` }
  }).filter(item => item.url) // 过滤掉没有url的项
}

/**
 * 检测媒体类型
 */
function detectMediaType(url: string): 'library' | 'external' | 'upload' {
  if (!url) return 'upload'
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return 'external'
  }
  if (url.startsWith('/uploads/') || url.startsWith('uploads/')) {
    return 'library'
  }
  return 'upload'
}

/**
 * 判断是否为外部URL
 */
export function isExternalUrl(url: string): boolean {
  if (!url) return false
  return url.startsWith('http://') || url.startsWith('https://')
}

/** External media is rendered by the browser, so only HTTPS URLs without
 * embedded credentials are accepted. Raw iframe/HTML snippets are rejected
 * before they can enter assignment or check-in JSON. */
export function isSafeExternalMediaUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && Boolean(parsed.hostname)
  } catch {
    return false
  }
}

/**
 * 标准化图片URL
 * 规则：
 * 1. 外部URL：直接使用
 * 2. 以 / 开头的绝对路径：直接使用
 * 3. 相对路径：添加 /uploads/ 前缀
 */
export function normalizeImageUrl(url: string): string {
  if (!url) {
    console.warn('[normalizeImageUrl] Empty URL provided')
    return ''
  }
  
  // 外部URL直接使用
  if (isExternalUrl(url)) {
    return url
  }
  
  // 已经是绝对路径
  if (url.startsWith('/')) {
    return url
  }
  
  // 相对路径，添加 /uploads/ 前缀
  // 移除可能的前缀 uploads/ 避免重复
  const cleanUrl = url.replace(/^uploads\//, '')
  const normalized = `/uploads/${cleanUrl}`
  console.log('[normalizeImageUrl] Normalized:', url, '->', normalized)
  return normalized
}

/**
 * 标准化视频URL
 * 与图片URL处理相同
 */
export function normalizeVideoUrl(url: string): string {
  return normalizeImageUrl(url)
}

/**
 * 获取图片错误时的占位图
 */
export function getImagePlaceholder(): string {
  return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"%3E%3Crect width="100" height="100" fill="%23f3f4f6"/%3E%3Ctext x="50" y="50" font-size="12" fill="%239ca3af" text-anchor="middle" dy=".3em"%3E图片加载失败%3C/text%3E%3C/svg%3E'
}

/**
 * 处理图片加载错误
 */
export function handleImageError(e: React.SyntheticEvent<HTMLImageElement, Event>) {
  const target = e.target as HTMLImageElement
  target.src = getImagePlaceholder()
  target.onerror = null // 防止循环触发
}

/**
 * 从URL中提取文件名
 */
export function getFileNameFromUrl(url: string): string {
  if (!url) return ''
  const parts = url.split('/')
  return parts[parts.length - 1] || ''
}

/**
 * 判断是否为B站视频
 */
export function isBilibiliVideo(url: string): boolean {
  if (!url) return false
  return url.includes('bilibili.com') || url.includes('b23.tv')
}

/**
 * 判断是否为YouTube视频
 */
export function isYouTubeVideo(url: string): boolean {
  if (!url) return false
  return url.includes('youtube.com') || url.includes('youtu.be')
}
