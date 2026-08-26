#!/usr/bin/env node
/**
 * COS 备份工具 - Node.js CLI
 * 用于备份脚本与腾讯云 COS 交互
 */

const path = require('path')

// 添加 backend node_modules 到模块搜索路径
const backendNodeModules = path.join(__dirname, '../../backend/node_modules')
if (require('fs').existsSync(backendNodeModules)) {
  module.paths.unshift(backendNodeModules)
}

const COS = require('cos-nodejs-sdk-v5')
const fs = require('fs')

function requiredEnv(name) {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`${name} must be provided through the process environment`)
  }
  return value.trim()
}

// 初始化 COS 客户端
function initCOS() {
  try {
    const secretId = requiredEnv('COS_SECRET_ID')
    const secretKey = requiredEnv('COS_SECRET_KEY')
    const bucket = requiredEnv('COS_BUCKET')
    const region = requiredEnv('COS_REGION')

    return {
      cos: new COS({ SecretId: secretId, SecretKey: secretKey }),
      bucket,
      region
    }
  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error.message || 'COS 配置不完整'
    }))
    process.exit(1)
  }
}

// 上传文件
async function uploadFile(localPath, remoteKey) {
  const { cos, bucket, region } = initCOS()

  if (!fs.existsSync(localPath)) {
    console.error(JSON.stringify({
      success: false,
      error: `文件不存在: ${localPath}`
    }))
    process.exit(1)
  }

  const stats = fs.statSync(localPath)
  const fileSize = stats.size
  const fileName = path.basename(localPath)

  try {
    let result
    
    // 大文件 (>= 5MB) 使用分片上传，小文件使用简单上传
    if (fileSize >= 5 * 1024 * 1024) {
      // 大文件使用 sliceUploadFile
      result = await new Promise((resolve, reject) => {
        cos.sliceUploadFile({
          Bucket: bucket,
          Region: region,
          Key: remoteKey,
          FilePath: localPath,
          onProgress: (progressData) => {
            const percent = ((progressData.loaded / progressData.total) * 100).toFixed(2)
            if (process.stderr.isTTY) {
              process.stderr.write(`\r上传进度: ${percent}%`)
            }
          }
        }, (err, data) => {
          if (err) reject(err)
          else resolve(data)
        })
      })
    } else {
      // 小文件使用 putObject + Body
      const fileContent = fs.readFileSync(localPath)
      result = await new Promise((resolve, reject) => {
        cos.putObject({
          Bucket: bucket,
          Region: region,
          Key: remoteKey,
          Body: fileContent
        }, (err, data) => {
          if (err) reject(err)
          else resolve(data)
        })
      })
    }

    if (process.stderr.isTTY) {
      process.stderr.write('\n')
    }

    console.log(JSON.stringify({
      success: true,
      file: fileName,
      key: remoteKey,
      size: fileSize,
      etag: result.ETag,
      requestId: result.RequestId
    }))
    process.exit(0)
  } catch (err) {
    console.error(JSON.stringify({
      success: false,
      error: err.message || err,
      code: err.code || 'UNKNOWN'
    }))
    process.exit(1)
  }
}

// 删除文件
async function deleteFile(remoteKey) {
  const { cos, bucket, region } = initCOS()

  try {
    await new Promise((resolve, reject) => {
      cos.deleteObject({
        Bucket: bucket,
        Region: region,
        Key: remoteKey
      }, (err, data) => {
        if (err) reject(err)
        else resolve(data)
      })
    })

    console.log(JSON.stringify({
      success: true,
      key: remoteKey,
      action: 'deleted'
    }))
    process.exit(0)
  } catch (err) {
    console.error(JSON.stringify({
      success: false,
      error: err.message || err,
      code: err.code || 'UNKNOWN'
    }))
    process.exit(1)
  }
}

// 列出文件
async function listFiles(prefix = '') {
  const { cos, bucket, region } = initCOS()

  try {
    const result = await new Promise((resolve, reject) => {
      cos.getBucket({
        Bucket: bucket,
        Region: region,
        Prefix: prefix,
        MaxKeys: 1000
      }, (err, data) => {
        if (err) reject(err)
        else resolve(data)
      })
    })

    const files = (result.Contents || []).map(item => ({
      key: item.Key,
      size: item.Size,
      lastModified: item.LastModified,
      etag: item.ETag
    }))

    console.log(JSON.stringify({
      success: true,
      count: files.length,
      files: files,
      prefix: prefix
    }))
    process.exit(0)
  } catch (err) {
    console.error(JSON.stringify({
      success: false,
      error: err.message || err,
      code: err.code || 'UNKNOWN'
    }))
    process.exit(1)
  }
}

// 下载文件
async function downloadFile(remoteKey, localPath) {
  const { cos, bucket, region } = initCOS()

  try {
    await new Promise((resolve, reject) => {
      cos.getObject({
        Bucket: bucket,
        Region: region,
        Key: remoteKey,
        Output: fs.createWriteStream(localPath)
      }, (err, data) => {
        if (err) reject(err)
        else resolve(data)
      })
    })

    console.log(JSON.stringify({
      success: true,
      key: remoteKey,
      localPath: localPath
    }))
    process.exit(0)
  } catch (err) {
    console.error(JSON.stringify({
      success: false,
      error: err.message || err,
      code: err.code || 'UNKNOWN'
    }))
    process.exit(1)
  }
}

// 清理旧备份（按日期）
async function cleanupOldBackups(prefix, daysToKeep) {
  const { cos, bucket, region } = initCOS()
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysToKeep))

  try {
    // 列出所有文件
    const result = await new Promise((resolve, reject) => {
      cos.getBucket({
        Bucket: bucket,
        Region: region,
        Prefix: prefix,
        MaxKeys: 1000
      }, (err, data) => {
        if (err) reject(err)
        else resolve(data)
      })
    })

    const files = result.Contents || []
    const toDelete = []

    for (const file of files) {
      const fileDate = new Date(file.LastModified)
      if (fileDate < cutoffDate) {
        toDelete.push({ Key: file.Key })
      }
    }

    if (toDelete.length > 0) {
      // 批量删除
      await new Promise((resolve, reject) => {
        cos.deleteMultipleObject({
          Bucket: bucket,
          Region: region,
          Objects: toDelete
        }, (err, data) => {
          if (err) reject(err)
          else resolve(data)
        })
      })
    }

    console.log(JSON.stringify({
      success: true,
      deleted: toDelete.length,
      kept: files.length - toDelete.length,
      cutoffDate: cutoffDate.toISOString()
    }))
    process.exit(0)
  } catch (err) {
    console.error(JSON.stringify({
      success: false,
      error: err.message || err,
      code: err.code || 'UNKNOWN'
    }))
    process.exit(1)
  }
}

// 主函数
function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command) {
    console.error('用法: node cos-backup.js <upload|delete|list|download|cleanup> [args...]')
    console.error('')
    console.error('命令:')
    console.error('  upload <localPath> <remoteKey>    上传文件')
    console.error('  delete <remoteKey>                删除文件')
    console.error('  list [prefix]                     列出文件')
    console.error('  download <remoteKey> <localPath>  下载文件')
    console.error('  cleanup <prefix> <days>           清理旧备份')
    process.exit(1)
  }

  switch (command) {
    case 'upload':
      if (args.length < 3) {
        console.error('用法: node cos-backup.js upload <localPath> <remoteKey>')
        process.exit(1)
      }
      uploadFile(args[1], args[2])
      break

    case 'delete':
      if (args.length < 2) {
        console.error('用法: node cos-backup.js delete <remoteKey>')
        process.exit(1)
      }
      deleteFile(args[1])
      break

    case 'list':
      listFiles(args[1] || '')
      break

    case 'download':
      if (args.length < 3) {
        console.error('用法: node cos-backup.js download <remoteKey> <localPath>')
        process.exit(1)
      }
      downloadFile(args[1], args[2])
      break

    case 'cleanup':
      if (args.length < 3) {
        console.error('用法: node cos-backup.js cleanup <prefix> <days>')
        process.exit(1)
      }
      cleanupOldBackups(args[1], args[2])
      break

    default:
      console.error(`未知命令: ${command}`)
      process.exit(1)
  }
}

main()
