/** License metadata is descriptive only; it never grants entry or account access. */
export const scaleRightsStatusLabel = (status: string): string => ({ NOT_EVALUATED: '版权许可不作为系统门禁（未评估）', SELF_AUTHORED: '自编来源已确认', APPROVED: '已批准', EVIDENCE_PENDING: '证据待补充（不阻断试行）', NOT_GRANTED: '尚无授权记录', SCOPE_MISMATCH: '授权范围不匹配', INELIGIBLE: '授权当前不可用' }[status] ?? status)
