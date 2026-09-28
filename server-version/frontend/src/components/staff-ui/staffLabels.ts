export const staffLabels = {
  run: '测评批次',
  runs: '测评批次',
  track: '测评项目',
  reporting: '报告分析',
  delivery: '安全事项与导出',
  refresh: '刷新',
  save: '保存修改',
  create: '创建',
} as const

export const lifecycleLabel = (value: string) => ({
  DRAFT: '草稿', PUBLISHED: '已发布', CLOSED: '已关闭', CANCELLED: '已取消',
  PREPARING: '准备中', ACTIVE: '进行中', ENDED: '已结束', ARCHIVED: '已归档',
}[value] || value)
