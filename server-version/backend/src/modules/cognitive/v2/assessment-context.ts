import {
  assessmentContextHashMatches,
  decryptAssessmentContext,
  type AssessmentContextV1,
} from '../../assessment-context'
import { freezeCompositeAttemptContext } from '../../../services/assessmentContextService'
import type { CognitiveAssessmentContextReference } from './types'

export interface CognitiveAssessmentContextState {
  context: AssessmentContextV1 | null
  reference: CognitiveAssessmentContextReference | null
}

type ContextDb = {
  compositeAssessmentAttempt?: {
    findUnique: (args: any) => PromiseLike<{
      contextSnapshotEncrypted: string | null
      contextSnapshotHash: string | null
    } | null>
  }
}

const readStoredContext = (row: {
  contextSnapshotEncrypted: string | null
  contextSnapshotHash: string | null
}): CognitiveAssessmentContextState => {
  if (!row.contextSnapshotEncrypted || !row.contextSnapshotHash) {
    throw new Error('Composite cognitive session is missing the frozen assessment context')
  }
  const context = decryptAssessmentContext(row.contextSnapshotEncrypted)
  if (!assessmentContextHashMatches(context, row.contextSnapshotHash)) {
    throw new Error('Composite assessment context hash mismatch')
  }
  return {
    context,
    reference: { schemaVersion: 1, snapshotHash: row.contextSnapshotHash },
  }
}

/** Standalone sessions intentionally carry no participant context. */
export const ensureCognitiveAssessmentContext = async (
  db: ContextDb,
  session: { compositeAttemptId: string | null },
): Promise<CognitiveAssessmentContextState> => {
  if (!session.compositeAttemptId) return { context: null, reference: null }
  if (!db.compositeAssessmentAttempt) throw new Error('Composite assessment context store is unavailable')

  const row = await db.compositeAssessmentAttempt.findUnique({
    where: { id: session.compositeAttemptId },
    select: { contextSnapshotEncrypted: true, contextSnapshotHash: true },
  })
  if (row?.contextSnapshotEncrypted && row.contextSnapshotHash) return readStoredContext(row)

  // This is the server-side safety net for old composite attempts or a caller
  // that reached completion before the explicit context-freeze UI step.
  const frozen = await freezeCompositeAttemptContext(db as never, session.compositeAttemptId)
  return {
    context: frozen.context,
    reference: { schemaVersion: 1, snapshotHash: frozen.hash },
  }
}

export const readCognitiveAssessmentContext = async (
  db: ContextDb,
  session: { compositeAttemptId: string | null; requiresFrozenContext?: boolean },
): Promise<CognitiveAssessmentContextState> => {
  if (!session.compositeAttemptId || session.requiresFrozenContext === false) return { context: null, reference: null }
  if (!db.compositeAssessmentAttempt) throw new Error('Composite assessment context store is unavailable')
  const row = await db.compositeAssessmentAttempt.findUnique({
    where: { id: session.compositeAttemptId },
    select: { contextSnapshotEncrypted: true, contextSnapshotHash: true },
  })
  if (!row) throw new Error('Composite assessment attempt not found')
  return readStoredContext(row)
}
