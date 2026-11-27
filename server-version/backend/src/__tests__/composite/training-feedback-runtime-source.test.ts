import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const read = (name: string) => readFileSync(`src/${name}`, 'utf8')
const composite = read('modules/composite/composite.service.ts')
const createAttemptStart = composite.indexOf('const createAttempt = async')
const attemptInsertStart = composite.indexOf('const attempt = await db.compositeAssessmentAttempt.create', createAttemptStart)
const admission = composite.slice(createAttemptStart, attemptInsertStart)
const attemptInsertData = composite.slice(attemptInsertStart, composite.indexOf('compositeAssessmentId: composite.id', attemptInsertStart))
describe('C22 runtime wiring source contracts (not concurrency/HTTP evidence)', () => {
  it('binds feedback under the existing publication/course/round locks and atomic attempt insert', () => {
    expect(createAttemptStart).toBeGreaterThanOrEqual(0)
    expect(attemptInsertStart).toBeGreaterThan(createAttemptStart)
    const lock = admission.indexOf('await lockCompositeAdmissionShare(db')
    const configured = admission.indexOf('const feedbackConfigured =')
    const round = admission.indexOf('await assertTrainingTokenRound(db as Prisma.TransactionClient, token)')
    const bind = admission.indexOf('feedbackBinding = prepareTrainingFeedbackBinding(')
    expect(lock).toBeGreaterThan(0)
    expect(configured).toBeGreaterThan(lock)
    expect(round).toBeGreaterThan(-1)
    expect(bind).toBeGreaterThan(round)
    expect(admission).toContain('if (persistence?.checkpoint || persistence?.localCognitive || feedbackConfigured)')
    expect(admission).toContain('FOR SHARE OF c,u'); expect(admission).toContain('accessTokenId, round: feedbackRound')
    const freeze = admission.indexOf('const trainingFeedbackSnapshot =')
    expect(freeze).toBeGreaterThan(bind)
    expect(attemptInsertStart - createAttemptStart).toBeGreaterThan(freeze)
    const insertData = attemptInsertData
    expect(insertData).toContain('...(trainingFeedbackSnapshot ? { trainingFeedbackSnapshot: trainingFeedbackSnapshot as Prisma.InputJsonValue,')
    expect(insertData).toContain('trainingFeedbackSnapshotHash: canonicalHash(trainingFeedbackSnapshot)')
    expect(admission).not.toContain('trainingPublicRound.create')
    expect(admission).not.toContain('compositeAssessmentAccessToken.create')
  })
  it('revalidates authoring inside publication and exposes only author-owned settings DTO', () => {
    expect(composite).toContain('validateTrainingFeedbackAuthoring(prisma as Prisma.TransactionClient, composite, composite.trainingFeedbackPolicy)')
    expect(composite).toContain('...persistenceFields, ...feedbackFields')
    expect(composite).toContain('trainingFeedbackPolicy:composite.trainingFeedbackPolicy??null')
  })
  it('keeps all native/authenticated/public result-bearing FINAL routes on the shared receipt projection', () => {
    for (const [file, methods] of [
      ['controllers/scaleController.ts', ['submitFinalAssessment']],
      ['controllers/situationalController.ts', ['submitFinal']],
      ['modules/composite/composite.controller.ts', ['submitEmbeddedSituational', 'publicSubmitEmbeddedSituational', 'submitFinalScale', 'publicSubmitFinalScale']],
      ['modules/cognitive/cognitive.controller.ts', ['submitSessionFinal']],
    ] as const) {
      const source = read(file)
      for (const method of methods) {
        const start = source.indexOf(`async ${method}(`)
        expect(start, `${file}:${method}`).toBeGreaterThan(0)
        expect(source.slice(start, source.indexOf('\n  },', start))).toContain('projectRelationalUnitFinalResponse(')
      }
    }
    const publicCognitive = read('modules/cognitive/public.service.ts')
    expect(publicCognitive).toContain('return projectRelationalUnitFinalResponse(internalContext.compositeAttemptId, data)')
  })
  it('retains the central no-store/no-ETag boundary for initial/replayed whole receipts and every API exit', () => {
    const index = read('index.ts')
    expect(index).toContain("app.set('etag', false)")
    expect(index).toContain("req.path.startsWith('/api')")
    expect(index).toContain("res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')")
  })
})
