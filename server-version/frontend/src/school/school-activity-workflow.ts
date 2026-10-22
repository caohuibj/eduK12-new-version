export type SchoolActivityState = 'DRAFT' | 'SUBMITTED' | 'OPEN' | 'PAUSED' | 'CLOSED'

const runStatusLabels: Record<string, string> = {
  DRAFT: '准备中', PUBLISHED: '已发布', CLOSED: '已收尾', CANCELLED: '已取消',
}
export const schoolRunStatusText = (status: string) => runStatusLabels[status] ?? '状态待确认'

// Read-only projection of the two existing lifecycles, never an authorization decision.
export function schoolActivityNextStep(status: SchoolActivityState, runStates: string[], ownPsychologyPublisher=false) {
  if(ownPsychologyPublisher){
    if(status==='DRAFT')return {owner:'活动心理教师',text:'配置授权班级、活动内容和测评项目，完成配置后可自行开放本人活动。'}
    if(status==='SUBMITTED')return {owner:'活动心理教师',text:'核对授权范围后开放本人活动；测评批次仍需单独预览和发布。'}
    if(status==='PAUSED')return {owner:'活动心理教师',text:'活动已暂停，现有作答也受到限制；确认当前授权范围后可恢复开放。'}
    if(status==='OPEN'&&runStates.includes('DRAFT'))return {owner:'活动心理教师',text:'活动已开放，但仍有测评批次未发布。请选择本人准备的批次，预览参与人数后正式发布。'}
  }
  if (status === 'DRAFT') return { owner: '活动准备教师', text: '配置参与班级、活动内容和测评项目，完成后提交学校审核。' }
  if (status === 'SUBMITTED') return { owner: '学校管理员', text: '审核活动并批准开放；活动开放后，测评批次仍需单独预览和发布。' }
  if (status === 'PAUSED') return { owner: '学校管理员', text: '活动已暂停，现有作答也受到限制；请先确认是否恢复开放。' }
  if (status === 'CLOSED') return { owner: '有报告权限的人员', text: '活动已结束不代表测评批次已收尾或报告已就绪。请到已授权的报告入口核对发布条件。' }
  if (runStates.includes('DRAFT')) return { owner: '学校管理员', text: '活动已开放，但仍有测评批次未发布。请选择准备中的批次，预览参与人数后正式发布。' }
  if (runStates.includes('PUBLISHED')) return { owner: '活动负责教师', text: '测评已发布，参与者可在授权任务入口作答；发布状态不代表作答已完成。' }
  return { owner: '活动负责教师', text: runStates.length ? '请核对各测评批次状态；结果是否可见仍取决于独立报告规则。' : '当前没有测评批次。活动开放不会自动创建或发布测评。' }
}

type AdmissionSummary = {status:string;rosterExpectedCount:number;eligibleCount:number;registeredCount:number;unresolvedIncidents:number}
export function schoolClassApprovalReasons(summary: AdmissionSummary | null) {
  if (!summary) return ['请先刷新班级状态。']
  const reasons: string[] = []
  if (summary.status !== 'CLOSED') reasons.push('请先由学校管理员关闭班级注册。')
  if (summary.rosterExpectedCount !== summary.eligibleCount) reasons.push('资格人数与预期名册不一致，请学校管理员核对名册。')
  if (summary.eligibleCount !== summary.registeredCount) reasons.push('注册人数与资格人数不一致，请核对注册进度。')
  if (summary.unresolvedIncidents !== 0) reasons.push('仍有注册异常待处理，请先在账号恢复与异常处理中完成核对。')
  return reasons
}
