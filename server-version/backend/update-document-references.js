/**
 * 更新作业和打卡中的文档引用
 * 将本地路径替换为COS URL
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function updateDocumentReferences() {
  try {
    console.log('开始更新文档引用...')

    // 获取所有文档的映射（旧路径 -> 新COS URL）
    const documents = await prisma.document.findMany({
      where: {
        cosUrl: { not: null }
      },
      select: {
        id: true,
        cosUrl: true,
        filePath: true,
        fileName: true,
      }
    })

    console.log(`找到 ${documents.length} 个已迁移的文档`)

    // 创建映射：旧文件路径 -> 新COS URL
    const urlMap = new Map()
    
    // 常见的旧路径格式
    for (const doc of documents) {
      // 映射各种可能的旧路径格式
      urlMap.set(`/uploads/documents/${doc.fileName}`, doc.cosUrl)
      urlMap.set(`documents/${doc.fileName}`, doc.cosUrl)
      urlMap.set(doc.filePath, doc.cosUrl)
      
      console.log(`映射: ${doc.fileName} -> ${doc.cosUrl}`)
    }

    // 更新作业中的文档引用
    const assignments = await prisma.assignment.findMany({
      where: {
        documents: { not: null }
      }
    })

    console.log(`\n处理 ${assignments.length} 个作业...`)

    for (const assignment of assignments) {
      let documents = assignment.documents
      let updated = false

      if (Array.isArray(documents)) {
        documents = documents.map(doc => {
          if (doc.url && urlMap.has(doc.url)) {
            const newUrl = urlMap.get(doc.url)
            console.log(`作业 "${assignment.title}": ${doc.url} -> ${newUrl}`)
            updated = true
            return { ...doc, url: newUrl }
          }
          return doc
        })

        if (updated) {
          await prisma.assignment.update({
            where: { id: assignment.id },
            data: { documents: documents }
          })
          console.log(`✅ 更新作业: ${assignment.title}`)
        }
      }
    }

    // 更新打卡中的文档引用
    const checkins = await prisma.checkin.findMany({
      where: {
        documents: { not: null }
      }
    })

    console.log(`\n处理 ${checkins.length} 个打卡...`)

    for (const checkin of checkins) {
      let documents = checkin.documents
      let updated = false

      if (Array.isArray(documents)) {
        documents = documents.map(doc => {
          if (doc.url && urlMap.has(doc.url)) {
            const newUrl = urlMap.get(doc.url)
            console.log(`打卡 "${checkin.title}": ${doc.url} -> ${newUrl}`)
            updated = true
            return { ...doc, url: newUrl }
          }
          return doc
        })

        if (updated) {
          await prisma.checkin.update({
            where: { id: checkin.id },
            data: { documents: documents }
          })
          console.log(`✅ 更新打卡: ${checkin.title}`)
        }
      }
    }

    console.log('\n文档引用更新完成！')

  } catch (error) {
    console.error('更新失败:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// 加载环境变量
require('dotenv').config()

// 执行更新
updateDocumentReferences()
