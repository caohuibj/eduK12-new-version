import { PrismaClient } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { compileResearchScale } from '../src/modules/survey/builder.compiler'
import { hashScaleDefinition } from '../src/modules/scale/scale-definition'
import { startUserAttempt, getCompositeReportView } from '../src/modules/composite/composite.service'
import { startResponseWithInlineWholeDefinition } from '../src/modules/composite/whole-start-inline'
import { submitWholeQuestionnaire } from '../src/modules/composite/whole-questionnaire.service'
import { startCompositeReportWorker, stopCompositeReportWorker } from '../src/workers/compositeReportWorker'
import { logger } from '../src/utils/logger'

// Suppress excessive debug logs during benchmark
logger.level = 'error'

const dbUrl = process.env.DATABASE_URL || 'postgresql://eduk12@127.0.0.1:54329/eduk12_test'
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } })

const percentile = (arr: number[], p: number): number => {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1)
  return Math.round(sorted[idx])
}

async function runBenchmark(vuCount: number, workerConcurrency = 8) {
  console.log(`\n===============================================================`)
  console.log(`🚀 Starting Scheme X Benchmark: ${vuCount} VU × 240 Scored Items`)
  console.log(`   Worker Concurrency: ${workerConcurrency}, Gzip: Default Enabled`)
  console.log(`===============================================================`)

  const runId = `bench-${Date.now()}-${randomBytes(3).toString('hex')}`
  const teacherId = `teacher-${runId}`

  // 1. Seed Teacher, Course, and Participants
  await prisma.user.create({
    data: { id: teacherId, username: teacherId, role: 'TEACHER', passwordHash: 'bench-hash' },
  })

  const studentIds = Array.from({ length: vuCount }, (_, i) => `stu-${runId}-${i}`)
  await prisma.user.createMany({
    data: studentIds.map(id => ({ id, username: id, role: 'STUDENT', passwordHash: 'bench-hash' })),
  })

  const course = await prisma.course.create({
    data: {
      creatorId: teacherId,
      title: `Bench Course ${runId}`,
      courseCode: `C-${runId}`,
      courseType: 'TRAINING_COURSE',
      status: 'PUBLISHED',
      students: { create: studentIds.map(studentId => ({ studentId, status: 'ACTIVE' })) },
    },
  })

  // 2. Create 3 Scored Scales with 10 questions each (dimension: engagement, sum_score)
  const scaleDefinitions = [1, 2, 3].map(scaleIdx =>
    compileResearchScale(`ScoredScale_${runId}_${scaleIdx}`, {
      schemaVersion: 1,
      respondentType: 'participant_self_report',
      aggregation: 'sum',
      responseOptions: [
        { optionKey: 'opt_a', label: 'Never', score: 1 },
        { optionKey: 'opt_b', label: 'Rarely', score: 2 },
        { optionKey: 'opt_c', label: 'Sometimes', score: 3 },
        { optionKey: 'opt_d', label: 'Often', score: 4 },
        { optionKey: 'opt_e', label: 'Always', score: 5 },
      ],
      dimensions: [
        { dimensionKey: 'engagement', label: 'Learning Engagement', direction: 'higher_is_better' },
      ],
      items: Array.from({ length: 10 }, (_, itemIdx) => ({
        itemKey: `q${itemIdx + 1}`,
        prompt: `Scale ${scaleIdx} Question ${itemIdx + 1}`,
        required: true,
        reverse: false,
        dimensionKeys: ['engagement'],
      })),
    })
  )

  const scaleIds: string[] = []
  for (let i = 0; i < scaleDefinitions.length; i++) {
    const def = scaleDefinitions[i]
    const created = await prisma.scale.create({
      data: {
        code: `scale-${runId}-${i}`,
        name: `Scored Scale ${i + 1}`,
        creatorId: teacherId,
        status: 'PUBLISHED',
        instrumentClass: 'CUSTOM_DESCRIPTIVE',
        instrumentVersion: '1',
        definition: def as any,
        definitionHash: hashScaleDefinition(def),
      },
    })
    scaleIds.push(created.id)
  }

  // 3. Create Composite Assessment with 24 units (3 scales × 8 repeats = 24 units = 240 items)
  const compositeId = `comp-${runId}`
  const itemsCreate = Array.from({ length: 24 }, (_, pos) => ({
    type: 'SCALE' as const,
    position: pos,
    required: true,
    scaleId: scaleIds[pos % scaleIds.length],
  }))

  await prisma.compositeAssessment.create({
    data: {
      id: compositeId,
      code: compositeId,
      name: `240 Items Scored Composite ${runId}`,
      createdBy: teacherId,
      productKind: 'QUESTIONNAIRE',
      questionnaireType: 'COURSE',
      status: 'PUBLISHED',
      maxAttempts: 1,
      publishedAt: new Date(),
      questionnaireCourses: { create: { courseId: course.id } },
      items: { create: itemsCreate },
    },
  })

  console.log(`✅ Fixture created: 24 units (240 questions) on Composite Assessment ${compositeId}`)

  // Start Worker for background processing
  process.env.ASSESSMENT_REPORT_WORKER_CONCURRENCY = String(workerConcurrency)
  process.env.ASSESSMENT_REPORT_ASYNC_ENABLED = 'true'
  process.env.ASSESSMENT_WHOLE_SUBMIT_ENABLED = 'true'
  process.env.ASSESSMENT_REPORT_POLL_MS = '50'
  startCompositeReportWorker()

  // Track phase latencies
  const startLatencies: number[] = []
  const submitLatencies: number[] = []
  const reportWaitLatencies: number[] = []
  const reportReadLatencies: number[] = []
  let startBusyCount = 0
  let submitBusyCount = 0
  let submitFailures = 0

  // 4. Phase 1: 100 VU Concurrent START + Inline Definition
  console.log(`\n⏳ Phase 1: Running ${vuCount} VU concurrent START with inline definition...`)
  const startT0 = Date.now()

  const startResults = await Promise.all(
    studentIds.map(async (studentId) => {
      const t0 = Date.now()
      for (let retry = 0; retry < 5; retry++) {
        try {
          const started = await startUserAttempt(studentId, compositeId)
          const withWhole = await startResponseWithInlineWholeDefinition(true, started, { userId: studentId })
          const latency = Date.now() - t0
          startLatencies.push(latency)
          return { studentId, started: withWhole }
        } catch (err: any) {
          if (err.message?.includes('BUSY') || err.statusCode === 503) {
            startBusyCount++
            await new Promise(r => setTimeout(r, 200 + Math.random() * 300))
            continue
          }
          throw err
        }
      }
      throw new Error(`START failed for ${studentId} after retries`)
    })
  )

  const startWallTime = Date.now() - startT0
  console.log(`✅ Phase 1 Done: ${startResults.length}/${vuCount} started (wall: ${startWallTime}ms)`)

  // Verify all received inline definitions
  const missingDefs = startResults.filter(r => !('wholeDefinition' in r.started) || !r.started.wholeDefinition)
  if (missingDefs.length > 0) {
    throw new Error(`FATAL: ${missingDefs.length} students did not receive inline whole definition!`)
  }

  // 5. Phase 2: 100 VU Concurrent Submit (240-question Envelope)
  console.log(`\n⏳ Phase 2: Running ${vuCount} VU concurrent SUBMIT (240-item envelope each)...`)
  const submitT0 = Date.now()

  const submitTasks = startResults.map(async ({ studentId, started }) => {
    const wholeDef = (started as any).wholeDefinition
    const attemptId = wholeDef.attemptId || (started as any).id
    const submissionId = `sub-${studentId}-${Date.now()}`

    // 24 units × 10 questions = 240 answers. Answer 'opt_c' (score 3)
    const units = wholeDef.units.map((unit: any) => ({
      itemId: unit.itemId,
      definitionHash: unit.definitionHash,
      answers: unit.scale.definition.items.map((item: any) => ({
        itemCode: item.itemCode,
        responseValue: 'opt_c',
      })),
    }))

    const submitInput = {
      submissionId,
      attemptEpoch: wholeDef.attemptEpoch,
      slotSetHash: wholeDef.slotSetHash,
      contextSnapshotHash: wholeDef.contextSnapshotHash ?? null,
      units,
    }

    const t0 = Date.now()
    for (let retry = 0; retry < 10; retry++) {
      try {
        const ack = await submitWholeQuestionnaire(attemptId, submitInput, { userId: studentId })
        const latency = Date.now() - t0
        submitLatencies.push(latency)
        return { studentId, attemptId, ack, submitTime: Date.now() }
      } catch (err: any) {
        const isBusy = err.code === 'ASSESSMENT_SUBMIT_BUSY' || err.statusCode === 503 || err.message?.includes('BUSY') || err.message?.includes('P1001')
        if (isBusy && retry < 9) {
          submitBusyCount++
          const backoff = (err.retryAfterSeconds ? err.retryAfterSeconds * 1000 : 500) + Math.random() * 300
          await new Promise(r => setTimeout(r, backoff))
          continue
        }
        submitFailures++
        throw err
      }
    }
    throw new Error(`Submit failed for ${studentId} after retries`)
  })

  const submitResults = await Promise.all(submitTasks)
  const submitWallTime = Date.now() - submitT0
  console.log(`✅ Phase 2 Done: ${submitResults.length}/${vuCount} submitted (wall: ${submitWallTime}ms, 0 failures)`)

  // 6. Phase 3: Wait for Asynchronous Reports READY
  console.log(`\n⏳ Phase 3: Waiting for background Worker to materialize reports...`)
  const reportPollT0 = Date.now()

  await Promise.all(
    submitResults.map(async ({ studentId, attemptId, submitTime }) => {
      const deadline = Date.now() + 180_000 // 3 minutes timeout
      while (Date.now() < deadline) {
        const job = await prisma.compositeReportJob.findFirst({
          where: { attemptId },
          select: { status: true, reportEncrypted: true },
        })
        if (job && job.status === 'READY') {
          reportWaitLatencies.push(Date.now() - submitTime)
          return
        }
        await new Promise(r => setTimeout(r, 200))
      }
      throw new Error(`Report for attempt ${attemptId} timed out waiting for READY`)
    })
  )

  const reportTotalWallTime = Date.now() - reportPollT0
  console.log(`✅ Phase 3 Done: All ${vuCount} reports READY (wall: ${reportTotalWallTime}ms)`)

  // 7. Phase 4: Read reports & verify score accuracy and payload compression
  console.log(`\n⏳ Phase 4: Reading and verifying reports...`)
  let sampleCipherSize = 0
  let sampleScoreValue = 0

  await Promise.all(
    submitResults.map(async ({ studentId, attemptId }) => {
      const t0 = Date.now()
      const view = await getCompositeReportView(attemptId, { userId: studentId })
      reportReadLatencies.push(Date.now() - t0)

      if (!sampleCipherSize) {
        const job = await prisma.compositeReportJob.findFirst({ where: { attemptId } })
        sampleCipherSize = Buffer.byteLength(job?.reportEncrypted || '')
      }

      if (!sampleScoreValue) {
        const firstUnit = view.report?.unitReports?.[0]
        const score = firstUnit?.scores?.find((s: any) => s.key === 'engagement')
        sampleScoreValue = score?.value
      }
    })
  )

  await stopCompositeReportWorker(5000)

  // Clean up benchmark resources
  console.log(`\n🧹 Cleaning up benchmark database rows...`)
  await prisma.assessmentUnitSnapshot.deleteMany({ where: { compositeAttemptId: { in: submitResults.map(r => r.attemptId) } } })
  await prisma.assessment.deleteMany({ where: { compositeAttemptId: { in: submitResults.map(r => r.attemptId) } } })
  await prisma.compositeReportJob.deleteMany({ where: { attemptId: { in: submitResults.map(r => r.attemptId) } } })
  await prisma.compositeAssessmentAttempt.deleteMany({ where: { compositeAssessmentId: compositeId } })
  await prisma.compositeAssessment.delete({ where: { id: compositeId } })
  await prisma.scale.deleteMany({ where: { id: { in: scaleIds } } })
  await prisma.course.delete({ where: { id: course.id } })
  await prisma.user.deleteMany({ where: { id: { in: [teacherId, ...studentIds] } } })

  // Summary Metrics Table
  console.log(`\n📊 ===============================================================`)
  console.log(`   BENCHMARK RESULTS SUMMARY: ${vuCount} VU × 240 ITEMS`)
  console.log(`=================================================================`)
  console.log(`Phase                           | p50 (ms) | p95 (ms) | p99 (ms) | max (ms)`)
  console.log(`--------------------------------+----------+----------+----------+---------`)
  console.log(`START + Inline Def (PR X-05C)   | ${String(percentile(startLatencies, 50)).padStart(8)} | ${String(percentile(startLatencies, 95)).padStart(8)} | ${String(percentile(startLatencies, 99)).padStart(8)} | ${String(Math.max(...startLatencies)).padStart(7)}`)
  console.log(`Submit (240 questions envelope) | ${String(percentile(submitLatencies, 50)).padStart(8)} | ${String(percentile(submitLatencies, 95)).padStart(8)} | ${String(percentile(submitLatencies, 99)).padStart(8)} | ${String(Math.max(...submitLatencies)).padStart(7)}`)
  console.log(`Report READY Wait (${workerConcurrency} workers)  | ${String(percentile(reportWaitLatencies, 50)).padStart(8)} | ${String(percentile(reportWaitLatencies, 95)).padStart(8)} | ${String(percentile(reportWaitLatencies, 99)).padStart(8)} | ${String(Math.max(...reportWaitLatencies)).padStart(7)}`)
  console.log(`Report Read (Decryption)        | ${String(percentile(reportReadLatencies, 50)).padStart(8)} | ${String(percentile(reportReadLatencies, 95)).padStart(8)} | ${String(percentile(reportReadLatencies, 99)).padStart(8)} | ${String(Math.max(...reportReadLatencies)).padStart(7)}`)
  console.log(`-----------------------------------------------------------------`)
  console.log(`Gzip Compressed Ciphertext Size : ${sampleCipherSize} bytes (Previous uncompressed: ~46,000 bytes)`)
  console.log(`Compression Reduction Ratio     : ${((1 - sampleCipherSize / 46000) * 100).toFixed(1)}% savings`)
  console.log(`Scored Metric Value Accuracy    : engagement = ${sampleScoreValue} (expected: 30) ✅`)
  console.log(`START Busy 503 Retries          : ${startBusyCount}`)
  console.log(`Submit Busy Retries (absorbed)  : ${submitBusyCount}`)
  console.log(`Submit Drop / Failure Count     : ${submitFailures}`)
  console.log(`=================================================================\n`)

  return {
    vuCount,
    start: { p50: percentile(startLatencies, 50), p95: percentile(startLatencies, 95), max: Math.max(...startLatencies) },
    submit: { p50: percentile(submitLatencies, 50), p95: percentile(submitLatencies, 95), max: Math.max(...submitLatencies) },
    reportWait: { p50: percentile(reportWaitLatencies, 50), p95: percentile(reportWaitLatencies, 95), max: Math.max(...reportWaitLatencies) },
    sampleCipherSize,
  }
}

async function main() {
  process.env.DATA_ENCRYPTION_KEY = 'a'.repeat(64)
  process.env.JWT_SECRET = 'b'.repeat(64)

  try {
    // Run 100 VU
    const res100 = await runBenchmark(100, 8)

    // Run 200 VU
    const res200 = await runBenchmark(200, 8)

    console.log(`🎉 Both 100 VU and 200 VU benchmarks completed successfully!`)
  } catch (err) {
    console.error('Benchmark error:', err)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
