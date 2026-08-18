/**
 * SVG 转 PNG 转换脚本
 * 
 * 使用方法：
 * 1. 安装依赖：npm install sharp
 * 2. 运行脚本：node convert-icons.js
 */

const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const iconsDir = path.join(__dirname, 'images', 'icons')

const icons = [
  'course',
  'course-active',
  'assignment',
  'assignment-active',
  'checkin',
  'checkin-active',
  'profile',
  'profile-active'
]

async function convertSvgToPng() {
  console.log('开始转换 SVG 图标为 PNG...\n')
  
  for (const icon of icons) {
    const svgPath = path.join(iconsDir, `${icon}.svg`)
    const pngPath = path.join(iconsDir, `${icon}.png`)
    
    if (!fs.existsSync(svgPath)) {
      console.log(`⚠️  ${icon}.svg 不存在，跳过`)
      continue
    }
    
    try {
      await sharp(svgPath)
        .resize(81, 81)
        .png()
        .toFile(pngPath)
      
      console.log(`✅ ${icon}.svg -> ${icon}.png`)
    } catch (error) {
      console.error(`❌ 转换失败: ${icon}.svg`, error.message)
    }
  }
  
  console.log('\n转换完成！')
}

convertSvgToPng().catch(console.error)
