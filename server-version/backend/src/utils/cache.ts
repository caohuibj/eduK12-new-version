/**
 * 简单内存缓存工具
 * 用于缓存不经常变化的数据，减少数据库查询
 */

interface CacheItem<T> {
  value: T
  expiresAt: number
}

class MemoryCache {
  private cache: Map<string, CacheItem<any>> = new Map()

  /**
   * 设置缓存
   * @param key 缓存键
   * @param value 缓存值
   * @param ttlSeconds 过期时间（秒），默认300秒（5分钟）
   */
  set<T>(key: string, value: T, ttlSeconds: number = 300): void {
    const expiresAt = Date.now() + ttlSeconds * 1000
    this.cache.set(key, { value, expiresAt })
  }

  /**
   * 获取缓存
   * @param key 缓存键
   * @returns 缓存值或 null
   */
  get<T>(key: string): T | null {
    const item = this.cache.get(key)
    
    if (!item) {
      return null
    }

    // 检查是否过期
    if (Date.now() >= item.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return item.value as T
  }

  /**
   * 删除缓存
   * @param key 缓存键
   */
  delete(key: string): void {
    this.cache.delete(key)
  }

  /**
   * 删除匹配的缓存键
   * @param pattern 正则表达式或字符串前缀
   */
  deletePattern(pattern: RegExp | string): void {
    for (const key of this.cache.keys()) {
      if (typeof pattern === 'string') {
        if (key.startsWith(pattern)) {
          this.cache.delete(key)
        }
      } else {
        if (pattern.test(key)) {
          this.cache.delete(key)
        }
      }
    }
  }

  // 别名：clearPattern = deletePattern
  clearPattern(pattern: RegExp | string): void {
    return this.deletePattern(pattern)
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * 获取缓存统计
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }

  // 别名：stats = getStats
  stats(): { size: number; keys: string[] } {
    return this.getStats()
  }

  /**
   * 清理过期缓存
   */
  cleanup(): void {
    const now = Date.now()
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key)
      }
    }
  }
}

// 导出单例实例
export const cache = new MemoryCache()

// 定期清理过期缓存（每5分钟）
setInterval(() => {
  cache.cleanup()
}, 5 * 60 * 1000)

// 缓存键生成工具
export const CacheKeys = {
  // 课程相关
  courseList: (userId: string) => `courses:list:${userId}`,
  courseDetail: (courseId: string) => `courses:detail:${courseId}`,
  courseStudents: (courseId: string) => `courses:students:${courseId}`,
  
  // 用户相关
  userList: () => 'users:list',
  userDetail: (userId: string) => `users:detail:${userId}`,
  
  // 作业相关
  assignmentList: (courseId: string) => `assignments:list:${courseId}`,
  assignmentDetail: (assignmentId: string) => `assignments:detail:${assignmentId}`,
  
  // 打卡相关
  checkinList: (courseId: string) => `checkins:list:${courseId}`,
  checkinDetail: (checkinId: string) => `checkins:detail:${checkinId}`,
}
