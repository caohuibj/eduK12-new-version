import { boundedUpload, uploadPrincipalRateLimit } from '../middleware/uploadAdmission'
import { Router } from 'express'
import { videoController } from '../controllers/videoController'
import { authenticate, requireTeacher } from '../middleware/auth'

const router = Router()
router.use(authenticate, requireTeacher)

const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']



router.get('/', videoController.list)
router.post('/upload', uploadPrincipalRateLimit, boundedUpload('video', 500 * 1024 * 1024, allowedVideoTypes, videoController.upload, false))
router.post('/upload-from-url', videoController.uploadFromUrl)  // 从URL下载视频
router.get('/:id/status', videoController.getStatus)
router.put('/:id', videoController.update)
router.put('/:id/tags', videoController.updateTags)
router.get('/:id/references', videoController.checkReferences)
router.delete('/:id', videoController.delete)
router.post('/:id/restore', videoController.restore)

export default router
