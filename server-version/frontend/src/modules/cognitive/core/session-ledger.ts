/**
 * 本地 Session 进度账本（Stage B v1.1 §21 Resume/Refresh Contract）。
 *
 * 用途：本浏览器**可证明**的进度来源。后端没有 GET submitted-trial-progress 端点，
 * 因此只有账本里记录的 trialIndex 才是前端能证明的进度：
 *  - 每笔 append 成功后才写账本（trialIndex = 该笔 index）；
 *  - 无账本 / 无法证明 → RECOVERY_REQUIRED（禁止默认为 0 / 猜测 / 重提旧 trial，v1.1 §21.2）。
 *
 * key 设计：
 *  - `cognitive:session:<sessionId>` = { status, trialIndex }（trialIndex=-1 表示尚未提交任何 trial）
 *  - `cognitive:assignment:<assignmentId>` = sessionId（entry 页分流：开始/继续/已完成）
 */

export interface SessionLedger {
  status: string
  /** 最后一次成功 append 的 trialIndex；-1 = 尚未提交任何 trial。 */
  trialIndex: number
}

const SESSION_KEY = (sessionId: string) => `cognitive:session:${sessionId}`
const ASSIGNMENT_KEY = (assignmentId: string) => `cognitive:assignment:${assignmentId}`

export function readSessionLedger(sessionId: string): SessionLedger | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY(sessionId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as SessionLedger
    if (typeof parsed.trialIndex !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export function writeSessionLedger(sessionId: string, ledger: SessionLedger): void {
  try {
    localStorage.setItem(SESSION_KEY(sessionId), JSON.stringify(ledger))
  } catch {
    // localStorage 不可用（隐私模式等）：静默失败，不影响主流程
  }
}

export function readAssignmentSessionId(assignmentId: string): string | null {
  try {
    return localStorage.getItem(ASSIGNMENT_KEY(assignmentId))
  } catch {
    return null
  }
}

export function writeAssignmentSessionId(assignmentId: string, sessionId: string): void {
  try {
    localStorage.setItem(ASSIGNMENT_KEY(assignmentId), sessionId)
  } catch {
    // 同上
  }
}
