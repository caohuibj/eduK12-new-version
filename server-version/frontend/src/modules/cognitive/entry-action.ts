export type CognitiveEntryAction =
  | { kind: 'result'; label: '查看结果' }
  | { kind: 'continue'; label: '继续测评' }
  | { kind: 'reconcile'; label: '开始/继续测评' }

/**
 * Local ledger state may identify an exact known session, but absence of a local
 * ledger is not proof that the server has no active session. The reconcile path
 * must call the existing idempotent createSession boundary instead of claiming
 * that a new attempt will be created.
 */
export const resolveCognitiveEntryAction = (
  sessionId: string | null,
  ledgerStatus: string | null,
): CognitiveEntryAction => {
  if (sessionId && ledgerStatus === 'COMPLETED') return { kind: 'result', label: '查看结果' }
  if (sessionId && ledgerStatus === 'IN_PROGRESS') return { kind: 'continue', label: '继续测评' }
  return { kind: 'reconcile', label: '开始/继续测评' }
}
