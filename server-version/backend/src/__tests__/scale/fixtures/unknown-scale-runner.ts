import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { writeFileSync, realpathSync } from 'node:fs'
import express from 'express'
import { prisma as db } from '../../../config/database'
import { getScaleInstrumentSource, getScaleInstrumentRuntimePolicy } from '../../../modules/scale/onboarding/instrument-registry'
import { installScaleInstrument, planScaleInstrumentInstall } from '../../../modules/scale/onboarding/install'
import { planStandardScalePublication, publishStandardScale } from '../../../modules/scale/onboarding/publish'
import { startStandaloneScaleAssessment } from '../../../modules/scale/scale-start.controller'
import { scaleController } from '../../../controllers/scaleController'
import { decryptField } from '../../../utils/encryption'

const main = async () => {
  const keys = process.argv.slice(2)
  const admin = await db.user.create({ data: { username: `closeout-admin-${randomUUID()}`, passwordHash: 'test-only', role: 'ADMIN', platformRole: 'SYSTEM_ADMIN' } })
  const student = await db.user.create({ data: { username: `closeout-student-${randomUUID()}`, passwordHash: 'test-only', role: 'STUDENT' } })
  const app = express(); app.use(express.json())
  // Auth identity fixture only. Registry, installer, publisher and runtime are production implementations.
  app.use((req, _res, next) => { req.user = { userId: student.id, role: 'STUDENT' } as any; next() })
  app.post('/scales/:scaleId/assessments', startStandaloneScaleAssessment)
  app.post('/assessments/:assessmentId/submit', scaleController.submitFinalAssessment)
  app.get('/assessments/:assessmentId', scaleController.getAssessmentV2)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${(server.address() as any).port}`
  const request = async (path: string, body?: unknown) => {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, body: await response.json() as any }
  }
  const ids: string[] = []
  try {
    for (const [index, key] of keys.entries()) {
      const source = getScaleInstrumentSource(key, '1.0.0')!
      assert.ok(source)
      const authId = randomUUID()
      await db.instrumentAuthorization.create({ data: { authorizationKey: authId, version: 1, instrumentKey: key, instrumentVersion: '1.0.0', grantor: 'test', grantee: 'test', electronicAdministration: true, scoring: true, display: true, translation: true, territories: ['CN'], locales: ['zh-CN'], commercialNature: 'NON_COMMERCIAL', validFrom: new Date('2020-01-01'), validTo: new Date('2099-01-01'), basis: 'synthetic only', status: 'APPROVED', approvedByUserId: admin.id, approvedAt: new Date(), createdByUserId: admin.id, recordHash: 'a'.repeat(64) } })
      const input = { instrumentKey: key, instrumentVersion: '1.0.0', actorUserId: admin.id, deploymentPolicy: { schemaVersion: 1 as const, revision: 1, locale: 'zh-CN', territory: 'CN', commercialNature: 'NON_COMMERCIAL' as const, deploymentModes: ['STANDALONE' as const], requiredRightsActions: ['electronicAdministration' as const, 'scoring' as const, 'display' as const], authorizationRefs: [authId], runtimePolicyHash: getScaleInstrumentRuntimePolicy(key, '1.0.0')!.runtimePolicyHash, localizationVersion: source.localization!.localizationVersion, inFlightCompletion: 'FROZEN_DEADLINE' as const } }
      assert.equal((await planScaleInstrumentInstall(db, input)).allowActivation, true)
      await installScaleInstrument(db, input)
      const scale = await db.scale.findUniqueOrThrow({ where: { code: key } }); ids.push(scale.id)
      assert.equal(scale.status, 'DRAFT'); assert.equal(scale.visibility, 'HIDDEN')
      assert.notEqual((await request(`/scales/${scale.id}/assessments`, {})).status, 200)
      const publication = { instrumentKey: key, instrumentVersion: '1.0.0', actorUserId: admin.id, visibility: 'PUBLIC' as const }
      assert.ok((await planStandardScalePublication(db, { ...publication, actorUserId: student.id })).blockers.includes('SYSTEM_ADMIN_REQUIRED'))
      await db.instrumentAuthorization.updateMany({ where: { authorizationKey: authId }, data: { status: 'REVOKED' } })
      assert.equal((await planStandardScalePublication(db, publication)).allowPublish, false)
      await db.instrumentAuthorization.updateMany({ where: { authorizationKey: authId }, data: { status: 'APPROVED' } })
      const cli = realpathSync('node_modules/.bin/tsx')
      const path = `publish-${index}.json`
      writeFileSync(path, JSON.stringify(publication))
      const dryRun = spawnSync(process.execPath, [cli, 'src/scripts/publish-scale-instrument.ts', '--input', path], { encoding: 'utf8', timeout: 20000 })
      assert.equal(dryRun.status, 0, dryRun.stderr + dryRun.stdout)
      let preview = JSON.parse(dryRun.stdout); assert.equal(preview.allowPublish, true)
      await db.instrumentAuthorization.updateMany({ where: { authorizationKey: authId }, data: { basis: 'reviewed synthetic evidence' } })
      await assert.rejects(publishStandardScale(db, { ...publication, expectedProofHash: preview.proofHash }), /PUBLICATION_PREVIEW_STALE/)
      assert.equal((await db.scale.findUniqueOrThrow({ where: { id: scale.id } })).status, 'DRAFT')
      const refreshed = spawnSync(process.execPath, [cli, 'src/scripts/publish-scale-instrument.ts', '--input', path], { encoding: 'utf8', timeout: 20000 })
      assert.equal(refreshed.status, 0, refreshed.stderr + refreshed.stdout)
      preview = JSON.parse(refreshed.stdout)
      await assert.rejects(publishStandardScale(db, { ...publication, expectedProofHash: '0'.repeat(64) }), /PUBLICATION_PREVIEW_STALE/)
      writeFileSync(path, JSON.stringify({ ...publication, expectedProofHash: preview.proofHash }))
      const applied = spawnSync(process.execPath, [cli, 'src/scripts/publish-scale-instrument.ts', '--input', path, '--apply'], { encoding: 'utf8', timeout: 20000 })
      assert.equal(applied.status, 0, applied.stderr + applied.stdout)
      assert.equal(JSON.parse(applied.stdout).status, 'PUBLISHED')
      const audit = await db.$queryRaw<any[]>`SELECT * FROM "scale_publication_audits" WHERE "scale_id" = ${scale.id}`
      assert.equal(audit.length, 1); assert.equal(audit[0].actor_user_id, admin.id)
      const preflight = await request(`/scales/${scale.id}/assessments`, {})
      assert.equal(preflight.body.data.preflight.kind, 'CONTEXT_REQUIRED')
      assert.equal((await request(`/scales/${scale.id}/assessments`, { context: { birthYearMonth: '2025-01' } })).status, 409)
      const started = await request(`/scales/${scale.id}/assessments`, { context: { birthYearMonth: index === 0 ? '2000-01' : '1950-01' } })
      assert.equal(started.status, 200, JSON.stringify(started.body))
      const assessment = started.body.data.assessment
      const payload = { submissionId: randomUUID(), attemptEpoch: assessment.attemptEpoch, definitionHash: started.body.data.scale.definitionHash, contextSnapshotHash: assessment.contextSnapshotHash, answers: source.executable!.goldenCases[0].answers }
      const final = await request(`/assessments/${assessment.id}/submit`, payload)
      assert.equal(final.status, 200, JSON.stringify(final.body)); assert.equal(final.body.data.replayed, false)
      const stored = await db.assessment.findUniqueOrThrow({ where: { id: assessment.id } })
      assert.equal(stored.status, 'COMPLETED'); assert.ok(decryptField<any>(stored.result as string).scores.length > 0)
      const report = await request(`/assessments/${assessment.id}`)
      assert.equal(report.status, 200)
      assert.equal(report.body.data.report.kind, index === 0 ? 'educational' : 'full', JSON.stringify(report.body))
      assert.equal(report.body.data.decryptError, undefined)
      const hasScores = JSON.stringify(report.body).includes('"scores"')
      assert.equal(hasScores, index === 1, JSON.stringify(report.body))
      assert.equal(JSON.stringify(final.body).includes('"scores"'), index === 1, JSON.stringify(final.body))
      await db.instrumentAuthorization.updateMany({ where: { authorizationKey: authId }, data: { status: 'REVOKED' } })
      const replay = await request(`/assessments/${assessment.id}/submit`, payload)
      assert.equal(replay.body.data.replayed, true)
      assert.equal(replay.body.data.assessment.report.kind, index === 0 ? 'educational' : 'full', JSON.stringify(replay.body))
    }
    console.log('UNKNOWN_SCALE_FULL_PATH_OK')
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    for (const id of ids) {
      await db.assessment.deleteMany({ where: { scaleId: id } })
      await db.$executeRaw`DELETE FROM "scale_publication_audits" WHERE "scale_id" = ${id}`
      await db.$executeRaw`DELETE FROM "scale_deployment_policies" WHERE "scale_id" = ${id}`
      await db.scale.delete({ where: { id } })
    }
    await db.instrumentAuthorization.deleteMany({ where: { instrumentKey: { in: keys } } })
    await db.user.deleteMany({ where: { id: { in: [admin.id, student.id] } } })
    await db.$disconnect()
  }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1) })
