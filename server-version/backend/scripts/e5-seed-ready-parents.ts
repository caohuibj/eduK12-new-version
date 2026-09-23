/**
 * Stage 5 (Program S5) ready-parent seeder for Aggregate characterization.
 *
 * A "ready parent" is a UNIFIED_V1 questionnaireAssessment (aggregate)
 * containing N form sections where N-1 are already COMPLETED and exactly one
 * (the last) remains to be submitted. Submitting that last section triggers
 * finalizeQuestionnaireAttemptUnifiedIfReady => aggregate report build +
 * field-encryption + fingerprint CAS + parent completion.
 *
 * Construction:
 *  1. create the assessment (questionnaire + N sections + items + frozen active
 *     slot set) via Prisma direct writes — this structural state is inert and
 *     needs no finalization.
 *  2. PRE-COMPLETE sections [0, n-2] through the REAL HTTP form-submit path
 *     (gate47student session), so each produces a genuine COMPLETED section
 *     attempt + QuestionnaireFormAnswer rows + assessment_unit_snapshots with
 *     collection facts encryption + fingerprint material — exactly what the
 *     aggregate finalizer will consume when the last section lands. This avoids
 *     hand-replicating the finalizer's snapshot/fingerprint invariants.
 *
 * Emits grouped fixture JSON { parentN2, parentN5, ... } where each entry is the
 * LAST section's submit request — the one that triggers aggregate finalization.
 *
 * The section definitionHash is canonicalHash(mapQuestionnaireSection(section)),
 * which is what the unified runtime admission computes at submit (not the raw
 * listQuestionnaireFormSections row), matching the Stage-4 DEFINITION_MISMATCH
 * fix.
 */
import 'dotenv/config'
import { createHash, randomUUID } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import {
  ensureQuestionnaireFormSections,
  listQuestionnaireFormSections,
} from '../src/services/questionnaire-form-section.service'
import { freezeQuestionnaireActiveSlotSet } from '../src/modules/assessment-runtime/attempt-runtime'
import { encryptFrozenActiveSlotSet } from '../src/modules/assessment-runtime/slot-set'
import { canonicalHash } from '../src/modules/assessment-runtime/canonical'
import { mapQuestionnaireSection } from '../src/modules/assessment-runtime/form-section-definition'

const OUT = process.env.E5_OUT || '/workspace/eduk12-pr49-cloud-results/e5s/ready-parent-fixtures.json'
// Counts per N. Larger N gets fewer parents (1 finalize consumes one); small N
// gets more so the many-parent throughput stream has enough fresh ready-parents.
const CNT: Record<number, number> = {
  2: Number(process.env.E5_N2 || 60),
  5: Number(process.env.E5_N5 || 150),
  10: Number(process.env.E5_N10 || 50),
  20: Number(process.env.E5_N20 || 0),
  25: Number(process.env.E5_N25 || 40),
  50: Number(process.env.E5_N50 || 30),
  100: Number(process.env.E5_N100 || 20),
}
const SIB_COUNT = Number(process.env.E5_SIB_ITEMS || 3) // items per form section (keep payload light)
const PREFIX = process.env.E5_PREFIX || 'e5rp-'
const STUDENT_USERNAME = process.env.PERF_STUDENT_USERNAME || 'gate47student'
const STUDENT_PASSWORD = process.env.PERF_STUDENT_PASSWORD || 'Gate47StudentPass!'
const BASE_URL = (process.env.E5_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')

const prisma = new PrismaClient()
const definitionHashOf = (section: any): string => canonicalHash(mapQuestionnaireSection(section))

// --- HTTP client (authenticated gate47student) -----------------------------
let SESSION_COOKIE = ''
let CSRF_COOKIE = ''
let CSRF_HEADER = ''

async function obtainCsrf() {
  // /api/auth/csrf is exempt from the double-submit CSRF check.
  const csrf = await fetch(`${BASE_URL}/api/auth/csrf`)
  if (!csrf.ok) throw new Error(`csrf failed: ${csrf.status}`)
  const body: any = await csrf.json()
  CSRF_HEADER = body?.data?.csrfToken
  const sc = csrf.headers.get('set-cookie') || ''
  const cm = /ptool_csrf=([^;]+)/.exec(sc)
  if (cm) CSRF_COOKIE = decodeURIComponent(cm[1])
  if (!CSRF_HEADER || !CSRF_COOKIE) throw new Error(`csrf token missing: header=${CSRF_HEADER} cookie=${CSRF_COOKIE}`)
}

async function login() {
  await obtainCsrf()
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `ptool_csrf=${encodeURIComponent(CSRF_COOKIE)}`,
      'x-csrf-token': CSRF_HEADER,
    },
    body: JSON.stringify({ username: STUDENT_USERNAME, password: STUDENT_PASSWORD }),
  })
  if (!res.ok) throw new Error(`login failed: ${res.status} ${res.statusText}`)
  const setCookie = res.headers.get('set-cookie') || ''
  const m = /ptool_session=([^;]+)/.exec(setCookie)
  if (!m) throw new Error(`login did not set ptool_session cookie: ${setCookie}`)
  SESSION_COOKIE = decodeURIComponent(m[1])
  // Re-issue a CSRF bound to this authenticated session (login rotates session).
  await obtainCsrf()
}

async function httpSubmit(fixture: any) {
  const url = `${BASE_URL}${fixture.path}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Cookie: `ptool_session=${encodeURIComponent(SESSION_COOKIE)}; ptool_csrf=${encodeURIComponent(CSRF_COOKIE)}`,
      'x-csrf-token': CSRF_HEADER,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(fixture.body),
  })
  const status = res.status
  let respBody = ''
  try { respBody = (await res.text()).slice(0, 300) } catch { /* ignore */ }
  return { status, respBody }
}

// --- fixture emission ------------------------------------------------------
function submitFixture(opts: {
  suffix: string
  parentId: string
  section: any
  submissionKey: string
}) {
  const { suffix, parentId, section, submissionKey } = opts
  const submissionId = `e5-${submissionKey}-${suffix}`
  const answers = section.items.map((it: any) => ({ formItemId: it.id, value: `v-${it.id}` }))
  return {
    fixtureId: `perf-e5rp-${suffix}-${section.id}`,
    fixtureClass: 'readyParent',
    instrument: 'form',
    runtimeGeneration: 'UNIFIED_V1',
    requiredUnitsN: null as number | null,
    logicalAttempt: `${parentId}:1:${submissionId}`,
    parentId,
    sectionId: section.id,
    method: 'POST',
    path: `/api/questionnaires/assessments/${parentId}/form-sections/${section.id}/submit`,
    body: {
      submissionId,
      attemptEpoch: 1,
      definitionHash: definitionHashOf(section),
      contextSnapshotHash: null,
      answers,
    },
  }
}

async function createReadyParent(studentId: string, n: number, idx: number): Promise<any> {
  const suffix = `${PREFIX}${n}-${String(idx).padStart(5, '0')}`
  const code = `E5-Q-${suffix}`
  const questionnaire = await prisma.questionnaire.create({
    data: {
      code,
      name: `E5 ready-parent ${code}`,
      creatorId: studentId,
      type: 'COURSE',
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
    },
  })
  for (let s = 0; s < n; s += 1) {
    const section = await prisma.questionnaireFormSection.create({
      data: { questionnaireId: questionnaire.id, title: `section ${s}`, position: s, contextSection: false },
    })
    const items: any[] = []
    for (let it = 0; it < SIB_COUNT; it += 1) {
      items.push({
        questionnaireId: questionnaire.id,
        sectionId: section.id,
        sectionPosition: it,
        type: 'text_input',
        label: `item ${it}`,
        required: true,
        position: it,
      })
    }
    if (items.length) await prisma.questionnaireFormItem.createMany({ data: items })
  }
  await ensureQuestionnaireFormSections(questionnaire.id)
  const sections = await listQuestionnaireFormSections(questionnaire.id)
  if (sections.length !== n) throw new Error(`expected ${n} sections got ${sections.length}`)

  const slotSet = freezeQuestionnaireActiveSlotSet({
    attemptEpoch: 1,
    scales: [],
    formSections: sections.map((s) => ({ sectionId: s.id, definitionHash: definitionHashOf(s) })),
  })
  const assessment = await prisma.questionnaireAssessment.create({
    data: {
      questionnaireId: questionnaire.id,
      userId: studentId,
      status: 'IN_PROGRESS',
      deliveryMode: 'FINAL_ONLY',
      runtimeGeneration: 'UNIFIED_V1',
      attemptEpoch: 1,
      progress: 0,
      frozenActiveSlotSetEncrypted: encryptFrozenActiveSlotSet(slotSet),
      frozenActiveSlotSetHash: slotSet.snapshotHash,
    },
  })

  // Pre-complete sections [0, n-2] through the real HTTP path so the snapshots
  // and fingerprints the aggregate finalizer needs are genuine. The finalizer
  // only fires when ALL required sections complete, so these stays IN_PROGRESS.
  const lastSection = sections[n - 1]
  for (let s = 0; s < n - 1; s += 1) {
    const sec = sections[s]
    const pre = submitFixture({ suffix, parentId: assessment.id, section: sec, submissionKey: `pre-s${s}` })
    if (pre.body.definitionHash !== definitionHashOf(sec)) throw new Error('internal hash mismatch')
    const r = await httpSubmit(pre)
    if (r.status !== 200) {
      throw new Error(`pre-complete failed for parent ${assessment.id} section ${sec.id}: ${r.status} ${r.respBody}`)
    }
  }

  // Last-section submit fixture (the one that triggers aggregate finalization).
  const last = submitFixture({ suffix, parentId: assessment.id, section: lastSection, submissionKey: 'fin' })
  last.requiredUnitsN = n
  return last
}

async function main() {
  if (process.env.PERF_ISOLATED_TEST_MODE === '1') {
    if (process.env.NODE_ENV !== 'test') throw new Error('E5 isolated mode requires NODE_ENV=test')
    const databaseUrl = new URL(process.env.DATABASE_URL || '')
    const databaseName = databaseUrl.pathname.replace(/^\//, '')
    if (!databaseName || databaseName !== process.env.PERF_FIXTURE_DB_NAME) {
      throw new Error('E5 isolated mode requires PERF_FIXTURE_DB_NAME to match DATABASE_URL')
    }
    if (!OUT.startsWith('/tmp/')) throw new Error('E5 isolated output must stay under /tmp')
    if (process.env.E5_AUTH_OUT && !process.env.E5_AUTH_OUT.startsWith('/tmp/')) {
      throw new Error('E5 isolated auth output must stay under /tmp')
    }
  }

  const passwordHash = await bcrypt.hash(STUDENT_PASSWORD, 10)
  const student = await prisma.user.upsert({
    where: { username: STUDENT_USERNAME },
    create: {
      username: STUDENT_USERNAME, passwordHash, role: 'STUDENT', nickname: STUDENT_USERNAME,
      isActive: true, mustChangePassword: false, teacherApproved: true,
    },
    update: {
      passwordHash, role: 'STUDENT', isActive: true, mustChangePassword: false,
      isFrozen: false, tokenVersion: 0,
    },
  })
  await login()
  if (process.env.E5_AUTH_OUT) {
    mkdirSync(dirname(process.env.E5_AUTH_OUT), { recursive: true })
    writeFileSync(process.env.E5_AUTH_OUT, [
      `PERF_AUTH_TOKEN=${SESSION_COOKIE}`,
      `PERF_CSRF_TOKEN=${CSRF_COOKIE}`,
      '',
    ].join('\n'), { mode: 0o600 })
  }
  const out: Record<string, any[]> = {}
  console.log(`Stage5 ready-parent seeder: N_counts=${JSON.stringify(CNT)} sib_items=${SIB_COUNT} base=${BASE_URL}`)
  for (const nStr of Object.keys(CNT).map(Number).sort((a, b) => a - b)) {
    const n = Number(nStr)
    const M = CNT[n]
    out[`parentN${n}`] = []
    for (let i = 0; i < M; i += 1) {
      out[`parentN${n}`].push(await createReadyParent(student.id, n, i))
      if ((i + 1) % 50 === 0) console.log(`  parentN${n} ${i + 1}/${M}`)
    }
    console.log(`  parentN${n} done (${M})`)
  }
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(out))
  console.log(JSON.stringify({ out: OUT, counts: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])) }, null, 2))
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1 })
  .finally(async () => {
    await prisma.$disconnect()
    process.exit(process.exitCode || 0)
  })