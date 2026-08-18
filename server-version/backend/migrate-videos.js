const { PrismaClient } = require('@prisma/client')
const COS = require('cos-nodejs-sdk-v5')
const fs = require('fs')
const path = require('path')

require('dotenv').config()

const prisma = new PrismaClient()

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY,
})

const bucket = process.env.COS_BUCKET
const region = process.env.COS_REGION
const domain = process.env.COS_DOMAIN

async function uploadToCOS(filePath, key, storageClass) {
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

async function migrateVideos() {
  try {
    console.log('=== 开始迁移现有视频到COS ===')
    console.log('时间:', new Date().toLocaleString('zh-CN'))
    console.log('')
    
    // 查询需要迁移的视频
    const videos = await prisma.video.findMany({
      where: {
        status: 'COMPLETED',
        processedUrl: { contains: 'cdn.eduk12.top' },
        originalCosUrl: null,
      },
      select: {
        id: true,
        title: true,
        filePath: true,
        fileName: true,
        processedUrl: true,
      }
    })
    
    console.log(`找到 ${videos.length} 个需要迁移的视频`)
    console.log('')
    
    let migrated = 0
    let failed = 0
    let totalSize = 0
    
    for (const video of videos) {
      try {
        // 构建完整文件路径
        const fullPath = video.filePath.startsWith('/')
          ? video.filePath
          : path.join('/opt/ptool/server-version/backend', video.filePath)
        
        // 检查文件是否存在
        if (!fs.existsSync(fullPath)) {
          console.log(`[${video.id}] 文件不存在: ${fullPath}`)
          failed++
          continue
        }
        
        const stats = fs.statSync(fullPath)
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2)
        
        console.log(`[${migrated + 1}/${videos.length}] 迁移: ${video.title}`)
        console.log(`  文件: ${video.fileName} (${sizeMB}MB)`)
        
        // 上传原始视频到低频存储
        const originalKey = `videos/original/${Date.now()}-${video.id}.mp4`
        const originalCosUrl = await uploadToCOS(fullPath, originalKey, 'STANDARD_IA')
        
        console.log(`  ✅ 已上传到低频存储: ${originalKey}`)
        
        // 更新数据库
        await prisma.video.update({
          where: { id: video.id },
          data: {
            originalCosUrl,
            originalCosKey: originalKey,
          }
        })
        
        console.log(`  ✅ 数据库已更新`)
        console.log('')
        
        migrated++
        totalSize += stats.size
        
        // 避免请求过快
        await new Promise(resolve => setTimeout(resolve, 100))
        
      } catch (error) {
        console.log(`  ❌ 迁移失败: ${error.message}`)
        console.log('')
        failed++
      }
    }
    
    console.log('=== 迁移完成 ===')
    console.log(`成功: ${migrated} 个`)
    console.log(`失败: ${failed} 个`)
    console.log(`总大小: ${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`)
    console.log('时间:', new Date().toLocaleString('zh-CN'))
    
  } catch (error) {
    console.error('迁移过程出错:', error)
  } finally {
    await prisma.$disconnect()
  }
}

migrateVideos()
