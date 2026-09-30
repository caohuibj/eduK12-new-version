import { boundedUpload, uploadPrincipalRateLimit } from '../middleware/uploadAdmission'
import { Router } from 'express'
import { documentController } from '../controllers/documentController'
import { authenticate, requireTeacher } from '../middleware/auth'

const router = Router()
router.use(authenticate, requireTeacher)

// 配置PDF上传（使用内存存储）


// 路由
router.get('/', documentController.list)
router.get('/:id', documentController.detail)
router.post('/upload', uploadPrincipalRateLimit, boundedUpload('document', 20 * 1024 * 1024, ['application/pdf'], documentController.upload))
router.put('/:id', documentController.update)
router.delete('/:id', documentController.delete)
router.post('/:id/restore', documentController.restore)

export default router
