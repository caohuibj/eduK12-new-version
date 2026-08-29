import { Router } from 'express'
import { videoController } from '../controllers/videoController'
import { authenticate, requireTeacher } from '../middleware/auth'
import multer from 'multer'
import { validateUploadedFile } from '../utils/fileValidator'
import { createTemporaryUploadStorage, withUploadCleanup } from '../utils/uploadTemp'

const router = Router()
router.use(authenticate, requireTeacher)

const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']

const upload = multer({
  storage: createTemporaryUploadStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
  },
  // The client MIME is untrusted. validateUploadedFile checks the bytes.
  fileFilter: (_req, _file, cb) => cb(null, true),
})

router.get('/', videoController.list)
router.post('/upload', withUploadCleanup(upload.single('video')), validateUploadedFile(allowedVideoTypes), videoController.upload)
router.post('/upload-from-url', videoController.uploadFromUrl)  // 从URL下载视频
router.get('/:id/status', videoController.getStatus)
router.put('/:id', videoController.update)
router.put('/:id/tags', videoController.updateTags)
router.get('/:id/references', videoController.checkReferences)
router.delete('/:id', videoController.delete)
router.post('/:id/restore', videoController.restore)

export default router
