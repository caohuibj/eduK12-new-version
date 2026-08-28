import { prisma } from '../config/database'

type Kind = 'standalone' | 'questionnaire' | 'classroom'

const value = (name: string): string | undefined => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const usage = (): never => {
  throw new Error(
    'usage: pr25-reconcile-attempts --kind standalone|questionnaire|classroom --winner-id ID --loser-id ID [--loser-id ID ...]',
  )
}

const loserIds = (): string[] => {
  const result: string[] = []
  for (let index = 0; index < process.argv.length; index += 1) {
    const candidate = process.argv[index + 1]
    if (process.argv[index] === '--loser-id' && candidate) result.push(candidate)
  }
  return [...new Set(result)]
}

/**
 * Reconciliation is deliberately explicit: the operator supplies both the
 * authoritative winner and every row to abandon. No ordering heuristic is
 * applied and no row is deleted.
 */
async function main(): Promise<void> {
  const kind = value('--kind') as Kind | undefined
  const rawWinnerId = value('--winner-id')
  const losers = loserIds()
  if (!kind || losers.length === 0 || !['standalone', 'questionnaire', 'classroom'].includes(kind)) usage()
  if (typeof rawWinnerId !== 'string' || rawWinnerId.length === 0) usage()
  const winnerId = rawWinnerId as string
  if (losers.includes(winnerId)) throw new Error('winner-id must not also be a loser-id')

  await prisma.$transaction(async (tx) => {
    if (kind === 'standalone') {
      const winner = await tx.assessment.findFirst({
        where: { id: winnerId, status: 'IN_PROGRESS', questionnaireAssessmentId: null, compositeAttemptId: null },
        select: { id: true, scaleId: true, userId: true },
      })
      if (!winner) throw new Error('winner is not an active standalone assessment')
      const rows = await tx.assessment.findMany({ where: { id: { in: losers } }, select: { id: true, scaleId: true, userId: true, status: true, questionnaireAssessmentId: true, compositeAttemptId: true } })
      if (rows.length !== losers.length || rows.some((row) => row.status !== 'IN_PROGRESS' || row.questionnaireAssessmentId || row.compositeAttemptId || row.scaleId !== winner.scaleId || row.userId !== winner.userId)) {
        throw new Error('losers do not match the winner standalone scope')
      }
      await tx.assessment.updateMany({ where: { id: { in: losers }, status: 'IN_PROGRESS' }, data: { status: 'ABANDONED' } })
      return
    }

    if (kind === 'questionnaire') {
      const winner = await tx.questionnaireAssessment.findFirst({ where: { id: winnerId, status: 'IN_PROGRESS', tokenId: null }, select: { id: true, questionnaireId: true, userId: true } })
      if (!winner) throw new Error('winner is not an active logged-in questionnaire assessment')
      const rows = await tx.questionnaireAssessment.findMany({ where: { id: { in: losers } }, select: { id: true, questionnaireId: true, userId: true, tokenId: true, status: true } })
      if (rows.length !== losers.length || rows.some((row) => row.status !== 'IN_PROGRESS' || row.tokenId !== null || row.questionnaireId !== winner.questionnaireId || row.userId !== winner.userId)) {
        throw new Error('losers do not match the winner questionnaire scope')
      }
      await tx.questionnaireAssessment.updateMany({ where: { id: { in: losers }, status: 'IN_PROGRESS' }, data: { status: 'ABANDONED' } })
      return
    }

    const winner = await tx.classroomQuestion.findFirst({ where: { id: winnerId, startedAt: { not: null }, endedAt: null }, select: { id: true, classroomId: true } })
    if (!winner) throw new Error('winner is not an active classroom question')
    const rows = await tx.classroomQuestion.findMany({ where: { id: { in: losers } }, select: { id: true, classroomId: true, startedAt: true, endedAt: true } })
    if (rows.length !== losers.length || rows.some((row) => row.classroomId !== winner.classroomId || !row.startedAt || row.endedAt)) throw new Error('losers do not match the winner classroom scope')
    // Classroom questions have no attempt status; ending explicitly selected
    // losers is the reversible equivalent of abandoning them.
    await tx.classroomQuestion.updateMany({ where: { id: { in: losers }, endedAt: null }, data: { endedAt: new Date() } })
  })
  process.stdout.write(`${JSON.stringify({ kind, winnerId, abandoned: losers.length })}\n`)
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'reconciliation failed'}\n`)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
