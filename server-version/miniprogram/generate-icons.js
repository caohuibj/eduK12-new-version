/**
 * PNG 图标生成脚本（纯 Node.js 实现）
 * 使用 pngjs 库生成 PNG 图标
 * 
 * 使用方法：
 * 1. 安装依赖：npm install pngjs
 * 2. 运行脚本：node generate-icons.js
 */

const { PNG } = require('pngjs')
const fs = require('fs')
const path = require('path')

const iconsDir = path.join(__dirname, 'images', 'icons')

// 图标颜色 (RGBA)
const DEFAULT_COLOR = { r: 153, g: 153, b: 153, a: 255 }  // #999999
const ACTIVE_COLOR = { r: 91, g: 192, b: 222, a: 255 }    // #5bc0de

const SIZE = 81
const STROKE_WIDTH = 3

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
    a: 255
  } : null
}

function setPixel(png, x, y, color) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return
  const idx = (SIZE * y + x) << 2
  png.data[idx] = color.r
  png.data[idx + 1] = color.g
  png.data[idx + 2] = color.b
  png.data[idx + 3] = color.a
}

function drawLine(png, x1, y1, x2, y2, color, width = STROKE_WIDTH) {
  const dx = Math.abs(x2 - x1)
  const dy = Math.abs(y2 - y1)
  const sx = x1 < x2 ? 1 : -1
  const sy = y1 < y2 ? 1 : -1
  let err = dx - dy
  
  const halfWidth = Math.floor(width / 2)
  
  while (true) {
    for (let ox = -halfWidth; ox <= halfWidth; ox++) {
      for (let oy = -halfWidth; oy <= halfWidth; oy++) {
        if (ox * ox + oy * oy <= halfWidth * halfWidth) {
          setPixel(png, x1 + ox, y1 + oy, color)
        }
      }
    }
    
    if (x1 === x2 && y1 === y2) break
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; x1 += sx }
    if (e2 < dx) { err += dx; y1 += sy }
  }
}

function drawRect(png, x, y, w, h, color, width = STROKE_WIDTH) {
  drawLine(png, x, y, x + w, y, color, width)
  drawLine(png, x + w, y, x + w, y + h, color, width)
  drawLine(png, x + w, y + h, x, y + h, color, width)
  drawLine(png, x, y + h, x, y, color, width)
}

function drawRoundRect(png, x, y, w, h, r, color, width = STROKE_WIDTH) {
  drawRect(png, x + r, y, w - 2 * r, h, color, 0)
  drawRect(png, x, y + r, w, h - 2 * r, color, 0)
  
  for (let angle = 0; angle < 90; angle += 5) {
    const rad = angle * Math.PI / 180
    const px1 = x + r - r * Math.cos(rad)
    const py1 = y + r - r * Math.sin(rad)
    const px2 = x + w - r + r * Math.cos(rad)
    const py2 = y + r - r * Math.sin(rad)
    const px3 = x + w - r + r * Math.cos(rad)
    const py3 = y + h - r + r * Math.sin(rad)
    const px4 = x + r - r * Math.cos(rad)
    const py4 = y + h - r + r * Math.sin(rad)
    
    setPixel(png, Math.round(px1), Math.round(py1), color)
    setPixel(png, Math.round(px2), Math.round(py2), color)
    setPixel(png, Math.round(px3), Math.round(py3), color)
    setPixel(png, Math.round(px4), Math.round(py4), color)
  }
}

function drawArc(png, cx, cy, r, startAngle, endAngle, color, width = STROKE_WIDTH) {
  for (let angle = startAngle; angle <= endAngle; angle += 2) {
    const rad = angle * Math.PI / 180
    const x = Math.round(cx + r * Math.cos(rad))
    const y = Math.round(cy + r * Math.sin(rad))
    for (let ox = -width/2; ox <= width/2; ox++) {
      for (let oy = -width/2; oy <= width/2; oy++) {
        setPixel(png, x + ox, y + oy, color)
      }
    }
  }
}

function drawCircle(png, cx, cy, r, color, width = STROKE_WIDTH) {
  drawArc(png, cx, cy, r, 0, 360, color, width)
}

function fillCircle(png, cx, cy, r, color) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) {
        setPixel(png, cx + x, cy + y, color)
      }
    }
  }
}

const s = SIZE / 24

const iconDrawers = {
  course: (png, color) => {
    drawLine(png, 2*s, 3*s, 8*s, 3*s, color)
    drawArc(png, 8*s, 7*s, 4*s, -90, 0, color)
    drawLine(png, 12*s, 7*s, 12*s, 21*s, color)
    drawArc(png, 9*s, 18*s, 3*s, 0, 90, color)
    drawLine(png, 9*s, 21*s, 2*s, 21*s, color)
    drawArc(png, 2*s, 18*s, 3*s, 90, 180, color)
    drawLine(png, 0, 18*s, 0, 6*s, color)
    drawArc(png, 2*s, 7*s, 3*s, 180, 270, color)
    
    drawLine(png, 22*s, 3*s, 16*s, 3*s, color)
    drawArc(png, 16*s, 7*s, 4*s, -90, 180, color)
    drawLine(png, 12*s, 7*s, 12*s, 21*s, color)
    drawArc(png, 15*s, 18*s, 3*s, 90, 180, color)
    drawLine(png, 15*s, 21*s, 22*s, 21*s, color)
    drawArc(png, 22*s, 18*s, 3*s, 0, 90, color)
    drawLine(png, 24*s, 18*s, 24*s, 6*s, color)
    drawArc(png, 22*s, 7*s, 3*s, -90, 0, color)
  },
  
  assignment: (png, color) => {
    drawRoundRect(png, 6*s, 4*s, 12*s, 16*s, 2*s, color)
    drawRoundRect(png, 8*s, 2*s, 8*s, 4*s, 1*s, color)
    drawLine(png, 8*s, 11*s, 16*s, 11*s, color)
    drawLine(png, 8*s, 16*s, 16*s, 16*s, color)
    fillCircle(png, 8*s, 11*s, 1.5*s, color)
    fillCircle(png, 8*s, 16*s, 1.5*s, color)
  },
  
  checkin: (png, color) => {
    drawRoundRect(png, 3*s, 4*s, 18*s, 18*s, 2*s, color)
    drawLine(png, 8*s, 2*s, 8*s, 6*s, color)
    drawLine(png, 16*s, 2*s, 16*s, 6*s, color)
    drawLine(png, 3*s, 10*s, 21*s, 10*s, color)
    drawLine(png, 9*s, 16*s, 11*s, 18*s, color)
    drawLine(png, 11*s, 18*s, 15*s, 14*s, color)
  },
  
  profile: (png, color) => {
    const cx = 12*s
    const cy = 12*s
    
    for (let i = 0; i < 8; i++) {
      const angle1 = (i * 45 - 22.5) * Math.PI / 180
      const angle2 = (i * 45 + 22.5) * Math.PI / 180
      const innerR = 6*s
      const outerR = 9*s
      
      const x1 = cx + outerR * Math.cos(angle1)
      const y1 = cy + outerR * Math.sin(angle1)
      const x2 = cx + innerR * Math.cos(angle2)
      const y2 = cy + innerR * Math.sin(angle2)
      const x3 = cx + outerR * Math.cos((i + 1) * 45 - 22.5) * Math.PI / 180
      const y3 = cy + outerR * Math.sin((i + 1) * 45 - 22.5) * Math.PI / 180
      
      drawLine(png, x1, y1, x2, y2, color)
      drawLine(png, x2, y2, x3, y3, color)
    }
    
    drawCircle(png, cx, cy, 3*s, color)
  }
}

function generateIcon(name, color) {
  const png = new PNG({ width: SIZE, height: SIZE })
  
  const baseName = name.replace('-active', '')
  if (iconDrawers[baseName]) {
    iconDrawers[baseName](png, color)
  }
  
  return PNG.sync.write(png)
}

async function main() {
  try {
    require('pngjs')
  } catch (e) {
    console.log('请先安装 pngjs：npm install pngjs')
    console.log('\n或者使用以下在线工具转换 SVG 为 PNG：')
    console.log('1. https://svgtopng.com/')
    console.log('2. https://convertio.co/zh/svg-png/')
    console.log('3. https://cloudconvert.com/svg-to-png')
    process.exit(0)
  }
  
  console.log('开始生成 PNG 图标...\n')
  
  const icons = [
    { name: 'course', color: DEFAULT_COLOR },
    { name: 'course-active', color: ACTIVE_COLOR },
    { name: 'assignment', color: DEFAULT_COLOR },
    { name: 'assignment-active', color: ACTIVE_COLOR },
    { name: 'checkin', color: DEFAULT_COLOR },
    { name: 'checkin-active', color: ACTIVE_COLOR },
    { name: 'profile', color: DEFAULT_COLOR },
    { name: 'profile-active', color: ACTIVE_COLOR }
  ]
  
  for (const icon of icons) {
    const pngPath = path.join(iconsDir, `${icon.name}.png`)
    try {
      const buffer = generateIcon(icon.name, icon.color)
      fs.writeFileSync(pngPath, buffer)
      console.log(`✅ ${icon.name}.png`)
    } catch (error) {
      console.error(`❌ ${icon.name}.png:`, error.message)
    }
  }
  
  console.log('\n生成完成！')
}

main()
