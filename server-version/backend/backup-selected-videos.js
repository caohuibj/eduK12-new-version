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

// 需要备份的文件名
const SELECTED_FILES = [
  '1772024732516-c04681c0-f0ac-4d62-b9d6-21e5994d2d04.mp4',
  '1772024711286-cffde0f5-fd40-4427-a1b8-19c30ed7c58a.mp4',
  '1772025314589-e68ce834-d532-4010-8445-be2adcbb5e1e.mp4',
  '1770850742955-ae49b40d-90f6-464d-84f3-3b91d921dc79.mp4',
]

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

async function backupSelectedVideos() {
  try {
    console.log('=== 开始备份选定的视频 ===')
    console.log('时间:', new Date().toLocaleString('zh-CN'))
    console.log('')
    
    // 查找需要备份的视频
    const videos = await prisma.video.findMany({
      where: {
        fileName: { in: SELECTED_FILES },
        originalCosUrl: null,
      },
    })
    
    console.log(`找到 ${videos.length} 个需要备份的视频`)
    console.log('')
    
    let backedUp = 0
    let failed = 0
    
    for (const video of videos) {
      try {
        const fullPath = video.filePath.startsWith('/')
          ? video.filePath
          : path.join('/opt/ptool/server-version/backend', video.filePath)
        
        if (!fs.existsSync(fullPath)) {
          console.log(`[${video.title}] 文件不存在: ${fullPath}`)
          failed++
          continue
        }
        
        const stats = fs.statSync(fullPath)
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2)
        
        console.log(`备份: ${video.title}`)
        console.log(`  文件: ${video.fileName} (${sizeMB}MB)`)
        
        // 上传到低频存储
        const originalKey = `videos/original/${Date.now()}-${video.id}.mp4`
        const originalCosUrl = await uploadToCOS(fullPath, originalKey, 'STANDARD_IA')
        
        console.log(`  ✅ 已上传到低频存储`)
        
        // 更新数据库
        await prisma.video.update({
          where: { id: video.id },
          data: {
            originalCosUrl,
            originalCosKey: originalKey,
          },
        })
        
        console.log(`  ✅ 数据库已更新`)
        console.log('')
        
        backedUp++
        
        // 避免请求过快
        await new Promise(resolve => setTimeout(resolve, 100))
        
      } catch (error) {
        console.log(`  ❌ 备份失败: ${error.message}`)
        console.log('')
        failed++
      }
    }
    
    console.log('=== 备份完成 ===')
    console.log(`成功: ${backedUp} 个`)
    console.log(`失败: ${failed} 个`)
    
  } catch (error) {
    console.error('备份过程出错:', error)
  } finally {
    await prisma.$disconnect()
  }
}

backupSelectedVideos()
