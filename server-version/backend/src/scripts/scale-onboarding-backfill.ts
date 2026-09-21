import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { canonicalHash } from '../modules/assessment-runtime/canonical'
import { scaleOnboardingBackfillPlanSchema, scaleOnboardingBackfillCheckpointSchema } from '../modules/scale/onboarding/backfill'
import { prisma } from '../config/database'
import {
  applyScaleOnboardingBackfill,
  auditScaleOnboardingState,
  planScaleOnboardingBackfill,
  rollbackScaleOnboardingBackfill,
} from '../modules/scale/onboarding/backfill'

const args = process.argv.slice(2)
const has = (flag: string) => args.includes(`--${flag}`)
const value = (flag: string) => {
  const index = args.indexOf(`--${flag}`)
  return index >= 0 ? args[index + 1] : undefined
}
const writeCheckpoint = (path: string, checkpoint: unknown) => {
  const temp = `${path}.tmp`
  writeFileSync(temp, JSON.stringify(checkpoint, null, 2) + '\n', 'utf8')
  renameSync(temp, path)
}

const main = async () => {
  if (has('audit')) {
    process.stdout.write(JSON.stringify(await auditScaleOnboardingState(prisma), null, 2) + '\n')
    return
  }
  const planPath = value('plan')
  if (!planPath) throw new Error('Missing --plan <json>')
  const absolutePlan = resolve(planPath)
  const plan = JSON.parse(readFileSync(absolutePlan, 'utf8'))
  if (!has('apply') && !has('rollback')) {
    const preview = await planScaleOnboardingBackfill(prisma, plan)
    process.stdout.write(JSON.stringify({ mode: 'dry-run', ...preview }, null, 2) + '\n')
    if (!preview.allowApply) process.exitCode = 2
    return
  }
  const checkpointPath = resolve(value('checkpoint') ?? `${planPath}.checkpoint.json`)
  const checkpoint = (() => {
    try { return JSON.parse(readFileSync(checkpointPath, 'utf8')) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  })()
  if (has('rollback')) {
    if (!checkpoint) throw new Error('Rollback requires an existing checkpoint')
    if (scaleOnboardingBackfillCheckpointSchema.parse(checkpoint).planHash !== canonicalHash(scaleOnboardingBackfillPlanSchema.parse(plan))) throw new Error('Rollback checkpoint does not match plan hash')
    const rolledBack = await rollbackScaleOnboardingBackfill({ db: prisma, checkpoint, onCheckpoint: next => writeCheckpoint(checkpointPath, next) })
    process.stdout.write(JSON.stringify({ mode: 'rollback', checkpoint: rolledBack }, null, 2) + '\n')
    return
  }
  const applied = await applyScaleOnboardingBackfill({ db: prisma, plan, checkpoint, onCheckpoint: next => writeCheckpoint(checkpointPath, next) })
  process.stdout.write(JSON.stringify({ mode: 'apply', checkpoint: applied }, null, 2) + '\n')
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}).finally(async () => prisma.$disconnect())
