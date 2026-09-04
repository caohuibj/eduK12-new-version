/**
 * E1 public-token seeder.
 * Creates one GENERAL questionnaire (+ form section) and binds:
 *   - 500 distinct plaintext tokens  -> for E1a (distinct start-tokens / same NAT IP)
 *   - 1 shared plaintext token        -> for E1b (same start-token levels + abuse 429)
 * Writes { distinctTokens, sharedToken } to E1_FIXTURE_OUT.
 * Runs against the isolated eduk12-gate49 DB; never touches ptool-*.
 */
import 'dotenv/config'
import { createHash } from 'node:crypto'
import { randomBytes, randomUUID } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { ensureQuestionnaireFormSections } from '../src/services/questionnaire-form-section.service'

const prisma = new PrismaClient()
const OUT = process.env.E1_FIXTURE_OUT || '/data/user/work/e1-public-tokens.json'
const DISTINCT_N = Number(process.env.E1_DISTINCT_N || 500)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'gate47admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Gate47AdminPass!'
const SHARED_TOKEN = `e1-shared-${randomBytes(24).toString('base64url')}`

async function main() {
  const admin = await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    create: {
      username: ADMIN_USERNAME,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 10),
      role: 'ADMIN',
      nickname: ADMIN_USERNAME,
      isActive: true,
      mustChangePassword: false,
      teacherApproved: true,
    },
    update: {},
  })

  const runId = randomUUID().slice(0, 8)
  const questionnaire = await prisma.questionnaire.create({
    data: {
      code: `G47-E1-GENERAL-${runId}`,
      name: `Gate47 E1 general ${runId}`,
      creatorId: admin.id,
      type: 'GENERAL',
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
    },
  })
  await ensureQuestionnaireFormSections(questionnaire.id)

  const distinctTokens: string[] = []
  const hash = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')
  for (let i = 0; i < DISTINCT_N; i += 1) {
    const tok = `e1-distinct-${runId}-${String(i + 1).padStart(4, '0')}-${randomBytes(8).toString('base64url')}`
    // Check constraint requires protected fields present (hash + encrypted).
    await prisma.questionnaireAccessToken.create({
      data: {
        questionnaireId: questionnaire.id,
        tokenHash: hash(tok),
        tokenEncrypted: tok,
        createdBy: admin.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        maxUses: 0,
        isActive: true,
      },
    })
    distinctTokens.push(tok)
  }

  await prisma.questionnaireAccessToken.create({
    data: {
      questionnaireId: questionnaire.id,
      tokenHash: hash(SHARED_TOKEN),
      tokenEncrypted: SHARED_TOKEN,
      createdBy: admin.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      maxUses: 0,
      isActive: true,
    },
  })

  mkdirSync(require('node:path').dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify({ distinctTokens, sharedToken: SHARED_TOKEN }, null, 2))
  console.log(JSON.stringify({
    out: OUT,
    questionnaireId: questionnaire.id,
    distinct: distinctTokens.length,
    shared: SHARED_TOKEN,
  }, null, 2))
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })