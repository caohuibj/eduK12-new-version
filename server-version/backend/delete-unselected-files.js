const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

// 需要保留的文件名（已备份到COS）
const KEEP_FILES = [
  '1772024732516-c04681c0-f0ac-4d62-b9d6-21e5994d2d04.mp4',
  '1772024711286-cffde0f5-fd40-4427-a1b8-19c30ed7c58a.mp4',
  '1772025314589-e68ce834-d532-4010-8445-be2adcbb5e1e.mp4',
  '1770850742955-ae49b40d-90f6-464d-84f3-3b91d921dc79.mp4',
]

async function deleteUnselectedFiles() {
  try {
    console.log('=== 删除未备份的原始文件 ===')
    console.log('时间:', new Date().toLocaleString('zh-CN'))
    console.log('')
    
    // 查找需要删除的视频
    const videos = await prisma.video.findMany({
      where: {
        fileName: { notIn: KEEP_FILES },
        originalCosUrl: null,
        status: 'COMPLETED',
        filePath: { not: 'pending_download' },
      },
    })
    
    console.log(`找到 ${videos.length} 个未备份的视频`)
    console.log('')
    
    let deleted = 0
    let savedSpace = 0
    
    for (const video of videos) {
      const fullPath = video.filePath.startsWith('/')
        ? video.filePath
        : path.join('/opt/ptool/server-version/backend', video.filePath)
      
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath)
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2)
        
        fs.unlinkSync(fullPath)
        
        console.log(`已删除: ${video.title} (${sizeMB}MB)`)
        deleted++
        savedSpace += stats.size
      }
    }
    
    console.log('')
    console.log('=== 删除完成 ===')
    console.log(`删除文件: ${deleted} 个`)
    console.log(`释放空间: ${(savedSpace / 1024 / 1024 / 1024).toFixed(2)} GB`)
    
  } catch (error) {
    console.error('删除过程出错:', error)
  } finally {
    await prisma.$disconnect()
  }
}

deleteUnselectedFiles()
