import { Router } from 'express'
import { videoController } from '../controllers/videoController'
import { authenticate, requireAdmin } from '../middleware/auth'
import multer from 'multer'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { validateUploadedFile } from '../utils/fileValidator'

const router = Router()

// 配置 multer 存储
import { config } from '../config'
import fs from 'fs'

// 确保上传目录存在
const uploadDir = path.join(config.uploadDir, 'videos')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`
    cb(null, uniqueName)
  }
})

const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
  fileFilter: (req, file, cb) => {
    if (allowedVideoTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('不支持的文件类型'))
    }
  }
})

router.get('/', authenticate, videoController.list)
router.post('/upload', authenticate, upload.single('video'), validateUploadedFile(allowedVideoTypes), videoController.upload)
router.post('/upload-from-url', authenticate, videoController.uploadFromUrl)  // 从URL下载视频
router.get('/:id/status', authenticate, videoController.getStatus)
router.put('/:id', authenticate, videoController.update)
router.put('/:id/tags', authenticate, videoController.updateTags)
router.get('/:id/references', authenticate, videoController.checkReferences)
router.delete('/:id', authenticate, videoController.delete)
router.post('/:id/restore', authenticate, videoController.restore)

export default router
