import { Router } from 'express'
import { videoController } from '../controllers/videoController'
import { authenticate, requireTeacher } from '../middleware/auth'
import multer from 'multer'
import { validateUploadedFile } from '../utils/fileValidator'

const router = Router()
router.use(authenticate, requireTeacher)

const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']

const upload = multer({
  storage: multer.memoryStorage(),
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

router.get('/', videoController.list)
router.post('/upload', upload.single('video'), validateUploadedFile(allowedVideoTypes), videoController.upload)
router.post('/upload-from-url', videoController.uploadFromUrl)  // 从URL下载视频
router.get('/:id/status', videoController.getStatus)
router.put('/:id', videoController.update)
router.put('/:id/tags', videoController.updateTags)
router.get('/:id/references', videoController.checkReferences)
router.delete('/:id', videoController.delete)
router.post('/:id/restore', videoController.restore)

export default router
