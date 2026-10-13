import { ClipboardList, FolderOpen, ScanLine, ChartNoAxesCombined } from 'lucide-react'

/** Summarized from the current Survey implementation, not a promise of deployment. */
export const surveyFeatures = [
  {
    path: '/features/research-projects', title: '研究项目', description: '组织项目与研究波次', icon: FolderOpen,
    introduction: '以研究项目组织工具、波次和数据，让每一次探索有迹可循。',
    points: ['创建、编辑和管理本人研究项目。', '选择单次独立匿名或研究内可关联的多波次采集。', '按研究进程发布、暂停、结束与归档。'],
    note: '研究者仅由管理员邀请开通，登录时需要双因素验证。研究数据限本人及明确授权的项目范围。',
  },
  {
    path: '/features/research-tools', title: '研究工具', description: '编制 Form、Scale 与 SJT', icon: ClipboardList,
    introduction: '编制 Form、Scale 与 SJT，在保存、预览和修订中逐步完善研究内容。',
    points: ['可视化编辑题目、选项与分页，支持批量录入。', '通过结构检查和试答预览确认问卷。', '发布时冻结内容版本，保留工具及评分来源。'],
    note: '自编工具用于研究探索，不因可以发布就获得正式科学资格；涉及外部内容和图片时仍需相应授权。',
  },
  {
    path: '/features/research-participation', title: '发布与参与', description: '知情同意与链接采集', icon: ScanLine,
    introduction: '通过独立研究邀请链接参与，先了解研究，再决定是否作答。',
    points: ['以研究波次安排发布、招募和收集。', '参与者通常无需平台注册账户，经研究邀请链接直达任务。', '完成后提供完成确认与非诊断性的通用反馈。'],
    note: '单次匿名不关联其他波次；多波次以研究内编号连接回答，属于假名化研究，须明确告知关联方式。研究发布按环境开通情况提供。',
  },
  {
    path: '/features/research-data', title: '数据与分析', description: '项目内统计与受控导出', icon: ChartNoAxesCombined,
    introduction: '在项目内查看研究进度、回答与描述统计，按波次整理和导出数据。',
    points: ['区分完成、缺失、拒答和撤回等样本状态。', '查看逐题结果及有条件的跨波次匹配。', '通过受控导出获取数据与变量说明。'],
    note: '数据分析与导出按当前环境和权限提供。敏感导出需要近期双因素验证；统计结果不自动构成个人诊断或因果结论。',
  },
] as const

export type SurveyFeature = (typeof surveyFeatures)[number]
