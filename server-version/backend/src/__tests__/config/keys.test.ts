import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// 配置层数据密钥 hex 校验：仅长度不足以保证 hex，必须强制 64 hex 字符。
const VALID_HEX = 'a'.repeat(64)
const INVALID_HEX = 'z'.repeat(64)

// 需持久化并在 afterEach 还原，避免 NODE_ENV=production 等泄漏到其它测试文件。
const SAVED = [
  'NODE_ENV',
  'JWT_SECRET',
  'DATABASE_URL',
  'CORS_ORIGIN',
  'PORT',
  'DATA_ENCRYPTION_KEY',
  'DATA_PSEUDONYM_KEY',
  'COGNITIVE_MODULE_ENABLED',
] as const

describe('config — data key hex validation (production, Cognitive flag)', () => {
  beforeEach(() => {
    vi.resetModules()
    for (const k of SAVED) delete process.env[k]
    process.env.NODE_ENV = 'production'
    process.env.JWT_SECRET = 'production-test-secret-needs-at-least-32-chars'
    process.env.DATABASE_URL = 'postgresql://localhost:5432/ptool'
    process.env.CORS_ORIGIN = 'https://frontend.example.test'
    process.env.PORT = '3000'
    process.env.DATA_ENCRYPTION_KEY = VALID_HEX
  })

  afterEach(() => {
    for (const k of SAVED) delete process.env[k]
  })

  it('loads when COGNITIVE_MODULE_ENABLED=false and pseudonym key missing', async () => {
    process.env.COGNITIVE_MODULE_ENABLED = 'false'
    delete process.env.DATA_PSEUDONYM_KEY
    const mod = await import('../../config')
    expect(mod.config.cognitiveModuleEnabled).toBe(false)
  })

  it('loads when COGNITIVE_MODULE_ENABLED=true and pseudonym key is valid 64-hex', async () => {
    process.env.COGNITIVE_MODULE_ENABLED = 'true'
    process.env.DATA_PSEUDONYM_KEY = VALID_HEX
    const mod = await import('../../config')
    expect(mod.config.cognitiveModuleEnabled).toBe(true)
  })

  it('throws when COGNITIVE_MODULE_ENABLED=true and pseudonym key is non-hex', async () => {
    process.env.COGNITIVE_MODULE_ENABLED = 'true'
    process.env.DATA_PSEUDONYM_KEY = INVALID_HEX
    await expect(import('../../config')).rejects.toThrow(/DATA_PSEUDONYM_KEY/)
  })

  it('throws when DATA_ENCRYPTION_KEY is non-hex (regardless of flag)', async () => {
    process.env.COGNITIVE_MODULE_ENABLED = 'false'
    process.env.DATA_ENCRYPTION_KEY = INVALID_HEX
    await expect(import('../../config')).rejects.toThrow(/DATA_ENCRYPTION_KEY/)
  })
})
