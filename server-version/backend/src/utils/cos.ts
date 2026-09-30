import COS from 'cos-nodejs-sdk-v5'
import { config } from '../config'
import fs from 'fs'

// 存储类型
export type StorageClass = 'STANDARD' | 'STANDARD_IA' | 'ARCHIVE'

// 初始化 COS 客户端
export const cos = new COS({
  SecretId: config.cosSecretId || '',
  SecretKey: config.cosSecretKey || '',
})

// 检查 COS 是否已配置
export const isCOSEnabled = (): boolean => {
  return !!(config.cosSecretId && config.cosSecretKey && config.cosBucket && config.cosRegion)
}

// 上传文件到 COS
export const uploadToCOS = async (
  filePath: string,
  key: string,
  storageClass: StorageClass = 'STANDARD'
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const source = fs.createReadStream(filePath)
    source.on('error', reject)
    cos.putObject(
      {
        Bucket: config.cosBucket!,
        Region: config.cosRegion!,
        Key: key,
        // The SDK accepts a readable stream; avoid materialising large videos
        // in a Node Buffer before sending them to object storage.
        Body: source,
        StorageClass: storageClass,
      } as any,
      (err, data) => {
        source.destroy()
        if (err) {
          reject(err)
        } else {
          resolve(`${config.cosDomain}/${key}`)
        }
      }
    )
  })
}

// 上传 Buffer 到 COS
export const uploadBufferToCOS = async (
  buffer: Buffer,
  key: string,
  storageClass: StorageClass = 'STANDARD'
): Promise<string> => {
  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: config.cosBucket!,
        Region: config.cosRegion!,
        Key: key,
        Body: buffer,
        StorageClass: storageClass,
      } as any,
      (err, data) => {
        if (err) {
          reject(err)
        } else {
          resolve(`${config.cosDomain}/${key}`)
        }
      }
    )
  })
}

// 生成 COS URL
export const getCOSUrl = (key: string): string => {
  return `${config.cosDomain}/${key}`
}

// 只返回短时效签名地址；永久 COS 地址不应进入业务响应。
export const getCOSSignedUrl = (key: string, expiresInSeconds = 600): Promise<string> => {
  if (!isCOSEnabled()) return Promise.reject(new Error('COS storage is not configured'))
  return new Promise((resolve, reject) => {
    ;(cos as any).getObjectUrl({
      Bucket: config.cosBucket!,
      Region: config.cosRegion!,
      Key: key,
      Sign: true,
      Expires: Math.min(600, Math.max(1, expiresInSeconds)),
    } as any, (err: any, data: any) => {
      if (err || !data?.Url) reject(err || new Error('COS signed URL unavailable'))
      else resolve(data.Url)
    })
  })
}

// 从 URL 提取 Key
export const extractCOSKey = (url: string): string | null => {
  if (!config.cosDomain) return null
  if (url.startsWith(config.cosDomain)) {
    return url.replace(`${config.cosDomain}/`, '')
  }
  return null
}

// 删除 COS 文件
export const deleteFromCOS = async (key: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    cos.deleteObject(
      {
        Bucket: config.cosBucket!,
        Region: config.cosRegion!,
        Key: key,
      },
      (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      }
    )
  })
}

// 删除 COS 文件（通过 URL）
export const deleteFromCOSByUrl = async (url: string): Promise<void> => {
  const key = extractCOSKey(url)
  if (key) {
    await deleteFromCOS(key)
  }
}
