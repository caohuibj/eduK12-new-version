/**
 * SVG 转 PNG 转换脚本
 * 使用 svgexport 库
 */

const svgexport = require('svgexport')
const path = require('path')
const fs = require('fs')

const iconsDir = path.join(__dirname, 'images', 'icons')

const icons = [
  'course', 'course-active',
  'assignment', 'assignment-active',
  'checkin', 'checkin-active',
  'profile', 'profile-active'
]

console.log('开始转换 SVG 图标为 PNG...\n')

let completed = 0
const total = icons.length

for (const icon of icons) {
  const svgPath = path.join(iconsDir, `${icon}.svg`)
  const pngPath = path.join(iconsDir, `${icon}.png`)
  
  if (!fs.existsSync(svgPath)) {
    console.log(`⚠️  ${icon}.svg 不存在，跳过`)
    completed++
    continue
  }
  
  svgexport.render({
    input: svgPath,
    output: `${pngPath} 81:81`
  }, function(err) {
    completed++
    if (err) {
      console.log(`❌ ${icon}.png: ${err}`)
    } else {
      console.log(`✅ ${icon}.png`)
    }
    
    if (completed === total) {
      console.log('\n转换完成！')
    }
  })
}
