#!/usr/bin/env node

/**
 * 单个视频迁移到COS的脚本
 * 用法: node migrate-video-to-cos.js <videoId> <filePath> <fileName>
 */

const { PrismaClient } = require('@prisma/client')
const COS = require('cos-nodejs-sdk-v5')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

const requiredEnv = (name) => {
  const value = process.env[name]
  if (!value || !value.trim()) throw new Error(`${name} must be set before migrating files to COS`)
  return value.trim()
}

// COS配置
const cos = new COS({
  SecretId: requiredEnv('COS_SECRET_ID'),
  SecretKey: requiredEnv('COS_SECRET_KEY'),
})

const bucket = requiredEnv('COS_BUCKET')
const region = requiredEnv('COS_REGION')
const domain = requiredEnv('COS_DOMAIN')

async function uploadToCOS(filePath, key, storageClass = 'STANDARD') {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(filePath)
    
    cos.putObject(
      {
        Bucket: bucket,
        Region: region,
        Key: key,
        Body: fileBuffer,
        StorageClass: storageClass,
      },
      (err, data) => {
        if (err) {
          reject(err)
        } else {
          resolve(`${domain}/${key}`)
        }
      }
    )
  })
}

async function migrateVideo(videoId, filePath, fileName) {
  try {
    console.log(`开始迁移视频 ${videoId}...`)
    
    if (!fs.existsSync(filePath)) {
      console.log(`文件不存在: ${filePath}`)
      return
    }
    
    // 1. 上传原始视频到低频存储
    const originalKey = `videos/original/${Date.now()}-${videoId}${path.extname(fileName)}`
    const originalCosUrl = await uploadToCOS(filePath, originalKey, 'STANDARD_IA')
    console.log(`原始视频已上传: ${originalKey}`)
    
    // 2. 检查是否有处理后的文件
    const video = await prisma.video.findUnique({
      where: { id: videoId }
    })
    
    let processedCosUrl = null
    let thumbnailCosUrl = null
    
    // 如果有本地处理后的文件，上传它们
    const processedPath = path.join('/opt/ptool/server-version/backend/uploads/processed', `${videoId}.mp4`)
    const thumbnailPath = path.join('/opt/ptool/server-version/backend/uploads/thumbnails', `${videoId}.jpg`)
    
    if (fs.existsSync(processedPath)) {
      const processedKey = `videos/processed/${Date.now()}-${videoId}.mp4`
      processedCosUrl = await uploadToCOS(processedPath, processedKey, 'STANDARD')
      console.log(`处理后视频已上传: ${processedKey}`)
    }
    
    if (fs.existsSync(thumbnailPath)) {
      const thumbnailKey = `videos/thumbnails/${Date.now()}-${videoId}.jpg`
      thumbnailCosUrl = await uploadToCOS(thumbnailPath, thumbnailKey, 'STANDARD')
      console.log(`缩略图已上传: ${thumbnailKey}`)
    }
    
    // 3. 更新数据库
    await prisma.video.update({
      where: { id: videoId },
      data: {
        originalCosUrl,
        originalCosKey: originalKey,
        processedUrl: processedCosUrl || video.processedUrl,
        thumbnailUrl: thumbnailCosUrl || video.thumbnailUrl,
      }
    })
    
    console.log(`视频 ${videoId} 迁移完成`)
    
  } catch (error) {
    console.error(`迁移失败:`, error)
  }
}

// 主函数
const args = process.argv.slice(2)
if (args.length < 3) {
  console.log('用法: node migrate-video-to-cos.js <videoId> <filePath> <fileName>')
  process.exit(1)
}

migrateVideo(args[0], args[1], args[2])
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err)
    prisma.$disconnect()
    process.exit(1)
  })
