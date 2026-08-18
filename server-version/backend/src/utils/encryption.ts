import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { logger } from './logger'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

// 获取加密密钥（32字节 = 256位）
const getEncryptionKey = (): Buffer => {
  const key = process.env.DATA_ENCRYPTION_KEY
  if (!key) {
    throw new Error('DATA_ENCRYPTION_KEY environment variable is not set')
  }
  
  // 密钥应该是64个十六进制字符（32字节）
  if (key.length !== 64) {
    throw new Error('DATA_ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
  }
  
  return Buffer.from(key, 'hex')
}

/**
 * 检查字符串是否为加密数据格式
 * 加密数据格式: iv:authTag:encryptedData (三段，用冒号分隔)
 */
export const isEncrypted = (data: string): boolean => {
  if (!data || typeof data !== 'string') return false
  const parts = data.split(':')
  if (parts.length !== 3) return false
  // 检查每部分是否为有效的十六进制字符串
  return parts.every(part => /^[0-9a-fA-F]+$/.test(part))
}

/**
 * 加密对象数据
 * @param data 要加密的数据对象
 * @returns 加密后的字符串 (格式: iv:authTag:encryptedData)
 */
export const encryptField = <T extends object>(data: T): string => {
  try {
    const key = getEncryptionKey()
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    
    const jsonData = JSON.stringify(data)
    const encrypted = Buffer.concat([
      cipher.update(jsonData, 'utf8'),
      cipher.final()
    ])
    
    const authTag = cipher.getAuthTag()
    
    // 格式: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
  } catch (error) {
    logger.error('加密数据失败', error)
    throw new Error('数据加密失败')
  }
}

/**
 * 解密字符串数据
 * @param encrypted 加密的字符串
 * @returns 解密后的数据对象
 */
export const decryptField = <T extends object>(encrypted: string): T => {
  try {
    const key = getEncryptionKey()
    const [ivHex, authTagHex, dataHex] = encrypted.split(':')
    
    if (!ivHex || !authTagHex || !dataHex) {
      throw new Error('无效的加密数据格式')
    }
    
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    const encryptedData = Buffer.from(dataHex, 'hex')
    
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    
    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ])
    
    return JSON.parse(decrypted.toString('utf8'))
  } catch (error) {
    logger.error('解密数据失败', error)
    throw new Error('数据解密失败')
  }
}

/**
 * 安全解密 - 支持渐进式迁移
 * 如果解密失败，尝试将数据作为明文JSON解析
 * @param data 可能是加密的或明文的数据
 * @returns 解析后的数据对象
 */
export const safeDecrypt = <T extends object>(data: string | T | null | undefined): T | null => {
  if (!data) return null
  
  // 如果已经是对象，直接返回
  if (typeof data !== 'string') {
    return data
  }
  
  // 检查是否为加密格式
  if (isEncrypted(data)) {
    try {
      return decryptField<T>(data)
    } catch (error) {
      logger.warn('解密失败，尝试作为明文处理', { error })
      // 解密失败，可能是旧数据，尝试直接解析
    }
  }
  
  // 尝试作为明文JSON解析
  try {
    return JSON.parse(data) as T
  } catch {
    logger.error('数据解析失败，既不是加密数据也不是有效JSON')
    return null
  }
}

/**
 * 批量加密
 * @param dataList 数据数组
 * @returns 加密后的字符串数组
 */
export const encryptBatch = <T extends object>(dataList: T[]): string[] => {
  return dataList.map(data => encryptField(data))
}

/**
 * 批量解密
 * @param encryptedList 加密字符串数组
 * @returns 解密后的数据数组
 */
export const decryptBatch = <T extends object>(encryptedList: string[]): T[] => {
  return encryptedList.map(encrypted => decryptField<T>(encrypted))
}

/**
 * 生成新的加密密钥（用于首次配置）
 * @returns 64个十六进制字符的密钥字符串
 */
export const generateEncryptionKey = (): string => {
  return randomBytes(32).toString('hex')
}
