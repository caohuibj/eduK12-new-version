/**
 * 缓存工具函数测试
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cache } from '../../utils/cache'

describe('Cache', () => {
  beforeEach(() => {
    // 清理所有缓存
    cache.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('set and get', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', { data: 'value' }, 60)
      const result = cache.get('key1')
      expect(result).toEqual({ data: 'value' })
    })

    it('should return null for non-existent keys', () => {
      const result = cache.get('nonexistent')
      expect(result).toBeNull()
    })

    it('should return null for expired keys', () => {
      cache.set('key1', { data: 'value' }, 0) // 立即过期
      const result = cache.get('key1')
      expect(result).toBeNull()
    })

    it('should handle different value types', () => {
      cache.set('string', 'test', 60)
      cache.set('number', 123, 60)
      cache.set('array', [1, 2, 3], 60)
      cache.set('object', { a: 1, b: 2 }, 60)
      cache.set('boolean', true, 60)

      expect(cache.get('string')).toBe('test')
      expect(cache.get('number')).toBe(123)
      expect(cache.get('array')).toEqual([1, 2, 3])
      expect(cache.get('object')).toEqual({ a: 1, b: 2 })
      expect(cache.get('boolean')).toBe(true)
    })
  })

  describe('delete', () => {
    it('should remove specific key', () => {
      cache.set('key1', 'value1', 60)
      cache.delete('key1')
      expect(cache.get('key1')).toBeNull()
    })

    it('should handle deleting non-existent key', () => {
      expect(() => cache.delete('nonexistent')).not.toThrow()
    })
  })

  describe('clear', () => {
    it('should remove all keys', () => {
      cache.set('key1', 'value1', 60)
      cache.set('key2', 'value2', 60)
      cache.clear()
      expect(cache.get('key1')).toBeNull()
      expect(cache.get('key2')).toBeNull()
    })
  })

  describe('clearPattern', () => {
    it('should remove keys matching pattern', () => {
      cache.set('courses:list:1', 'value1', 60)
      cache.set('courses:list:2', 'value2', 60)
      cache.set('users:list', 'value3', 60)
      
      cache.clearPattern('courses:list')
      
      expect(cache.get('courses:list:1')).toBeNull()
      expect(cache.get('courses:list:2')).toBeNull()
      expect(cache.get('users:list')).toEqual('value3')
    })
  })

  describe('stats', () => {
    it('should return cache statistics', () => {
      cache.set('key1', 'value1', 60)
      cache.set('key2', 'value2', 60)
      
      const stats = cache.stats()
      
      expect(stats.size).toBe(2)
      expect(typeof stats.size).toBe('number')
    })
  })
})
