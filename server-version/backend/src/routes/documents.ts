import { Router } from 'express'
import { documentController } from '../controllers/documentController'
import { authenticate, requireTeacher } from '../middleware/auth'
import multer from 'multer'
import { validateUploadedFile } from '../utils/fileValidator'

const router = Router()
router.use(authenticate, requireTeacher)

// 配置PDF上传（使用内存存储）
const documentUpload = multer({
  storage: multer.memoryStorage(), // 使用内存存储，不上传到本地磁盘
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  },
  // The client MIME is only a hint. The content is checked by the
  // validateUploadedFile middleware after Multer has buffered it.
  fileFilter: (_req, _file, cb) => cb(null, true),
})

// 路由
router.get('/', documentController.list)
router.get('/:id', documentController.detail)
router.post('/upload', documentUpload.single('document'), validateUploadedFile(['application/pdf']), documentController.upload)
router.put('/:id', documentController.update)
router.delete('/:id', documentController.delete)
router.post('/:id/restore', documentController.restore)

export default router
