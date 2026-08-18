import { createCanvas } from 'canvas'

/**
 * 生成单点水印
 * 文字"慧育空间专属教学资料"，渐变蓝色，15%不透明度，底部居中
 * 文字长度约为图片宽度的一半，字体减小30%
 */
export async function generateSingleWatermark(imageWidth: number): Promise<Buffer> {
  const text = '慧育空间教学专属资料'

  // 计算字体大小：让文字长度约为图片宽度的一半，再减小30%
  // 中文字符约占字体大小的宽度，10个字符
  const targetTextWidth = imageWidth * 0.5 * 0.7  // 减小30%
  const fontSize = Math.max(12, Math.min(56, Math.floor(targetTextWidth / 10)))

  // 创建临时canvas计算文字尺寸
  const tempCanvas = createCanvas(1, 1)
  const tempCtx = tempCanvas.getContext('2d')
  tempCtx.font = `bold ${fontSize}px "Microsoft YaHei", "SimHei", sans-serif`
  const metrics = tempCtx.measureText(text)
  const textWidth = metrics.width
  const textHeight = fontSize * 1.2

  // 创建水印canvas，留出边距
  const padding = Math.floor(fontSize * 0.5)
  const canvas = createCanvas(textWidth + padding * 2, textHeight + padding)
  const ctx = canvas.getContext('2d')

  // 透明背景
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // 创建渐变蓝色 (从天蓝到深蓝)，15%不透明度
  const gradient = ctx.createLinearGradient(0, 0, textWidth, 0)
  gradient.addColorStop(0, 'rgba(100, 180, 255, 0.15)')   // 浅蓝 15%
  gradient.addColorStop(0.5, 'rgba(66, 133, 244, 0.15)')  // 中蓝 15%
  gradient.addColorStop(1, 'rgba(25, 103, 210, 0.15)')    // 深蓝 15%

  // 设置文字样式
  ctx.font = `bold ${fontSize}px "Microsoft YaHei", "SimHei", sans-serif`
  ctx.fillStyle = gradient
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'

  // 绘制文字
  ctx.fillText(text, padding, canvas.height / 2)

  return canvas.toBuffer('image/png')
}
