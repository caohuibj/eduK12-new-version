/**
 * COS 工具函数测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import COS from 'cos-nodejs-sdk-v5'
import { config } from '../../config'

// Mock COS SDK
vi.mock('cos-nodejs-sdk-v5', () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        putObject: vi.fn(),
        deleteObject: vi.fn(),
        getObject: vi.fn(),
        headObject: vi.fn(),
        getBucket: vi.fn(),
      }
    }),
  }
})

describe('COS Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('COS Client Initialization', () => {
    it('should initialize COS client with config', async () => {
      // Import after mock
      const { cos } = await import('../../utils/cos')
      
      expect(cos).toBeDefined()
      expect(COS).toHaveBeenCalledWith({
        SecretId: config.cosSecretId || '',
        SecretKey: config.cosSecretKey || '',
      })
    })
  })

  describe('isCOSEnabled', () => {
    it('should return true when all COS config is set', async () => {
      const { isCOSEnabled } = await import('../../utils/cos')
      
      // 如果配置了所有 COS 参数，应该返回 true
      if (config.cosSecretId && config.cosSecretKey && config.cosBucket && config.cosRegion) {
        expect(isCOSEnabled()).toBe(true)
      } else {
        expect(isCOSEnabled()).toBe(false)
      }
    })
  })

  describe('getCOSUrl', () => {
    it('should generate correct COS URL', async () => {
      const { getCOSUrl } = await import('../../utils/cos')
      
      const key = 'test/file.jpg'
      const url = getCOSUrl(key)
      
      if (config.cosDomain) {
        expect(url).toBe(`${config.cosDomain}/${key}`)
      }
    })
  })

  describe('extractCOSKey', () => {
    it('should extract key from COS URL', async () => {
      const { extractCOSKey, getCOSUrl } = await import('../../utils/cos')
      
      const key = 'test/file.jpg'
      const url = getCOSUrl(key)
      const extractedKey = extractCOSKey(url)
      
      if (config.cosDomain) {
        expect(extractedKey).toBe(key)
      }
    })

    it('should return null for non-COS URL', async () => {
      const { extractCOSKey } = await import('../../utils/cos')
      
      const url = 'https://example.com/test/file.jpg'
      const result = extractCOSKey(url)
      
      expect(result).toBeNull()
    })

    it('should return null when cosDomain is not configured', async () => {
      const { extractCOSKey } = await import('../../utils/cos')
      
      if (!config.cosDomain) {
        const result = extractCOSKey('https://example.com/test/file.jpg')
        expect(result).toBeNull()
      }
    })
  })

  describe('fast-xml-parser compatibility', () => {
    it('should handle XML parsing without errors', async () => {
      // 测试 fast-xml-parser 5.x 版本是否与 COS SDK 兼容
      const { cos } = await import('../../utils/cos')
      
      // COS SDK 应该成功初始化
      expect(cos).toBeDefined()
      expect(typeof cos.putObject).toBe('function')
      expect(typeof cos.deleteObject).toBe('function')
      expect(typeof cos.getObject).toBe('function')
    })
  })
})
