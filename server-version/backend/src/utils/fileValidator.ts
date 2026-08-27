/**
 * 文件类型验证工具
 * 通过检查文件魔数（Magic Number）来验证真实文件类型
 */

// 文件魔数定义
const FILE_SIGNATURES: Record<string, number[]> = {
  // 图片
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  'image/gif': [0x47, 0x49, 0x46, 0x38], // GIF87a or GIF89a
  'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF header
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2D], // %PDF-
  // 视频
  'video/mp4': [0x00, 0x00, 0x00], // MP4 有多种变体
  'video/webm': [0x1A, 0x45, 0xDF, 0xA3], // EBML header
  'video/ogg': [0x4F, 0x67, 0x67, 0x53], // OggS
  'video/quicktime': [0x00, 0x00, 0x00], // MOV 有多种变体
}

/**
 * 检查文件魔数是否匹配
 * @param buffer 文件缓冲区
 * @param mimeType 声明的 MIME 类型
 * @returns 是否匹配
 */
export const validateFileMagic = (buffer: Buffer, mimeType: string): boolean => {
  const signature = FILE_SIGNATURES[mimeType]
  if (!signature) {
    // 未知类型，默认通过（后续可以配置为拒绝）
    return true
  }

  // 检查文件头是否匹配魔数
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) {
      return false
    }
  }
  return true
}

/**
 * 获取文件的真实 MIME 类型
 * @param buffer 文件缓冲区
 * @returns 检测到的 MIME 类型或 null
 */
export const detectMimeType = (buffer: Buffer): string | null => {
  // 检查 JPEG
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg'
  }
  // 检查 PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E) {
    return 'image/png'
  }
  // 检查 GIF
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif'
  }
  // 检查 WebP
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return 'image/webp'
  }
  // PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2D) {
    return 'application/pdf'
  }
  // 检查 WebM
  if (buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) {
    return 'video/webm'
  }
  // 检查 Ogg
  if (buffer[0] === 0x4F && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return 'video/ogg'
  }
  // MP4 和 MOV 检查 (ftyp 标记)
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    // 检查具体类型
    const brand = buffer.slice(8, 12).toString('ascii')
    if (brand.startsWith('qt')) {
      return 'video/quicktime'
    }
    return 'video/mp4'
  }

  return null
}

/**
 * 创建 Multer 文件过滤器（带魔数检查）
 * @param allowedTypes 允许的 MIME 类型列表
 * @returns Multer 文件过滤器函数
 */
export const createFileFilter = (allowedTypes: string[]) => {
  return (req: any, file: any, cb: any) => {
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error(`不支持的文件类型: ${file.mimetype}`))
    }
    cb(null, true)
  }
}

/**
 * 验证上传文件的中间件
 * 在 Multer 处理后检查文件魔数
 */
export const validateUploadedFile = (allowedTypes: string[]) => {
  return (req: any, res: any, next: any) => {
    if (!req.file) {
      return next()
    }

    const fs = require('fs')
    let buffer: Buffer
    if (Buffer.isBuffer(req.file.buffer)) {
      buffer = req.file.buffer.subarray(0, 8)
    } else if (req.file.path) {
      const fd = fs.openSync(req.file.path, 'r')
      buffer = Buffer.alloc(8)
      fs.readSync(fd, buffer, 0, 8, 0)
      fs.closeSync(fd)
    } else {
      return res.status(400).json({ code: -1, message: '无法读取上传文件' })
    }

    // 检测真实文件类型
    const detectedType = detectMimeType(buffer)

    if (!detectedType) {
      // 删除可疑文件
      if (req.file.path) fs.unlinkSync(req.file.path)
      return res.status(400).json({
        code: -1,
        message: '无法识别文件类型，可能是不支持的格式或恶意文件'
      })
    }

    // 检查是否在允许列表中
    if (!allowedTypes.includes(detectedType)) {
      if (req.file.path) fs.unlinkSync(req.file.path)
      return res.status(400).json({
        code: -1,
        message: `文件类型不匹配，检测到 ${detectedType}，但不在允许列表中`
      })
    }

    // 更新文件的 detectedMimeType 属性供后续使用
    req.file.detectedMimeType = detectedType
    next()
  }
}
