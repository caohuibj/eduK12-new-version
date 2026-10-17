import crypto from 'node:crypto'
import { Transform } from 'node:stream'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/database'
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
  storageClass: StorageClass = 'STANDARD',
  metadata?: { mimeType: string; sha256: string }
): Promise<string> => {
  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: config.cosBucket!,
        Region: config.cosRegion!,
        Key: key,
        Body: buffer,
        StorageClass: storageClass,
        ...(metadata ? { ContentType: metadata.mimeType, 'x-cos-meta-sha256': metadata.sha256, ACL: 'private' } : {}),
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

// Hold the same object lock as controlled sharing while checking actual rows.
// Even soft-deleted logical assets protect bytes until their own retirement.
export const deleteFromCOS = async (key: string): Promise<void> => {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'eduk12:cos:' + key}, 0))::text`)
    const references = await tx.storedAsset.count({ where: { provider: 'cos', OR: [
      { storageObjectKey: key }, { storageObjectKey: null, objectKey: key },
    ] } })
    if (references) throw new Error('COS object is retained by a logical asset')
    await new Promise<void>((resolve, reject) => {
      cos.deleteObject({ Bucket: config.cosBucket!, Region: config.cosRegion!, Key: key },
        err => err ? reject(err) : resolve())
    })
  }, { maxWait: 5000, timeout: 20000 })
}

// 删除 COS 文件（通过 URL）
export const deleteFromCOSByUrl = async (url: string): Promise<void> => {
  const key = extractCOSKey(url)
  if (key) {
    await deleteFromCOS(key)
  }
}


/** Verify the actual streamed bytes against the preflight content digest. */
export const uploadAssetFileToCOS = (filePath: string, key: string, mimeType: string, expectedSize: number, expectedSha256: string): Promise<{ sha256: string }> => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256')
  let size = 0
  const source = fs.createReadStream(filePath)
  const body = new Transform({ transform(chunk, _encoding, callback) { size += chunk.length; hash.update(chunk); callback(null, chunk) } })
  const fail = (error: Error) => { source.destroy(); body.destroy(); reject(error) }
  source.on('error', fail)
  body.on('error', fail)
  source.pipe(body)
  try { cos.putObject({ Bucket: config.cosBucket!, Region: config.cosRegion!, Key: key, Body: body,
    ContentLength: expectedSize, ContentType: mimeType, 'x-cos-meta-sha256': expectedSha256, ACL: 'private', StorageClass: 'STANDARD' } as any, error => {
    source.destroy(); body.destroy()
    if (error) return reject(error)
    if (size !== expectedSize) return reject(new Error('Uploaded asset size changed'))
    const digest = hash.digest('hex')
    if (digest !== expectedSha256) return reject(new Error('Asset file changed during upload'))
    resolve({ sha256: digest })
  }) } catch (error) { fail(error as Error) }
})
