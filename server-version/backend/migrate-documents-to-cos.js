/**
 * 迁移本地文档到COS
 * 用法: node migrate-documents-to-cos.js
 */

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const fs = require('fs')
const path = require('path')
const COS = require('cos-nodejs-sdk-v5')

// 从环境变量读取配置
const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY,
})

const COS_BUCKET = process.env.COS_BUCKET
const COS_REGION = process.env.COS_REGION
const COS_DOMAIN = process.env.COS_DOMAIN

async function migrateDocuments() {
  try {
    console.log('开始迁移文档到COS...')
    console.log('COS配置:', { COS_BUCKET, COS_REGION, COS_DOMAIN })

    // 查找所有未上传到COS的文档
    const documents = await prisma.document.findMany({
      where: {
        OR: [
          { cosUrl: null },
          { cosUrl: '' }
        ]
      }
    })

    console.log(`找到 ${documents.length} 个需要迁移的文档`)

    for (const doc of documents) {
      console.log(`\n处理文档: ${doc.title}`)
      console.log(`文件路径: ${doc.filePath}`)

      // 检查文件是否存在
      if (!fs.existsSync(doc.filePath)) {
        console.log(`⚠️  文件不存在，跳过: ${doc.filePath}`)
        continue
      }

      try {
        // 读取文件
        const fileBuffer = fs.readFileSync(doc.filePath)
        const fileName = path.basename(doc.filePath)

        // 生成COS Key
        const cosKey = `documents/${Date.now()}-${doc.id}.pdf`

        console.log(`上传到COS: ${cosKey}`)

        // 上传到COS
        await new Promise((resolve, reject) => {
          cos.putObject(
            {
              Bucket: COS_BUCKET,
              Region: COS_REGION,
              Key: cosKey,
              Body: fileBuffer,
              StorageClass: 'STANDARD',
            },
            (err, data) => {
              if (err) {
                reject(err)
              } else {
                resolve(data)
              }
            }
          )
        })

        const cosUrl = `${COS_DOMAIN}/${cosKey}`
        console.log(`✅ 上传成功: ${cosUrl}`)

        // 更新数据库
        await prisma.document.update({
          where: { id: doc.id },
          data: {
            cosUrl: cosUrl,
            cosKey: cosKey,
            filePath: cosKey, // 更新文件路径为COS Key
          }
        })

        console.log(`✅ 数据库更新成功`)

        // 删除本地文件
        fs.unlinkSync(doc.filePath)
        console.log(`🗑️  已删除本地文件: ${doc.filePath}`)

      } catch (error) {
        console.error(`❌ 迁移失败: ${doc.title}`, error.message)
      }
    }

    console.log('\n迁移完成！')

  } catch (error) {
    console.error('迁移过程出错:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// 加载环境变量
require('dotenv').config()

// 执行迁移
migrateDocuments()
