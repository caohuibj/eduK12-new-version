import { beforeEach, expect, it, vi } from 'vitest'
import { scaleDefinitionFor } from '../integration/mini-scale-definition'
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { assessment: { findUnique } } }))
import { publicQuestionnaireController } from '../../controllers/publicQuestionnaireController'
beforeEach(() => vi.clearAllMocks())
it.each([true, false])('omits management-only copy provenance in anonymous scale runner (valid=%s)', async valid => {
  findUnique.mockResolvedValue({
    id: 'attempt', status: 'IN_PROGRESS', answers: [], result: null,
    questionnaireAssessment: { id: 'parent-attempt', sessionId: 'session' },
    scale: { id: 'child', code: 'custom', name: 'Child', instrumentClass: 'CUSTOM_DESCRIPTIVE', instrumentVersion: '2.0.0',
      definition: valid ? scaleDefinitionFor(1, 'P') : null, copySource: { parentId: 'hidden-parent', parentCode: 'private-name' } },
  })
  const res: any = { statusCode: 200 }
  res.status = (status: number) => { res.statusCode=status; return res }
  res.json = (body: any) => { res.body=body; return res }
  await publicQuestionnaireController.getScaleAssessment({ params: { sessionId: 'session', scaleAssessmentId: 'attempt' } } as any, res)
  expect(res.statusCode).toBe(200)
  expect(res.body.code).toBe(0)
  expect(res.body.data.scale.copySource).toBeUndefined()
  expect(JSON.stringify(res.body)).not.toContain('hidden-parent')
  expect(Boolean(res.body.data.scale.definition)).toBe(valid)
})
