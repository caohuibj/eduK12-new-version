import { Router } from 'express'
import { materialGrantController } from '../controllers/materialGrantController'

const router = Router()

router.get('/', materialGrantController.list)
router.post('/', materialGrantController.create)
router.post('/batch', materialGrantController.batch)
router.put('/set', materialGrantController.set)
router.delete('/:id', materialGrantController.remove)

export default router
