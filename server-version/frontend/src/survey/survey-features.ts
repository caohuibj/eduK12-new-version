import { ClipboardList, FolderOpen, ScanLine, ChartNoAxesCombined } from 'lucide-react'

/** Summarized from the current Survey implementation, not a promise of deployment. */
export const surveyFeatures = [
  {
    path: '/features/research-projects', title: '研究项目', description: '组织项目与研究波次', icon: FolderOpen,
    introduction: '以研究项目组织工具、波次和数据，让每一次探索有迹可循。',
    points: ['在同一项目内管理研究说明、工具、采集波次和数据。', '选择单次独立匿名，或事先告知关联方式的多波次采集。', '按研究进程发布、暂停、结束与归档，保留已冻结内容的版本。'],
    note: '研究者仅由管理员邀请开通，登录时需要双因素验证。研究数据限本人及明确授权的项目范围。',
  },
  {
    path: '/features/research-tools', title: '研究工具', description: '表单、量表、情境与认知', icon: ClipboardList,
    introduction: '选择适合研究问题的工具，在编制、预览和修订中逐步完善内容。',
    points: ['Form 表单：编制题目、选项与分页，支持批量录入。', 'Scale 量表与 SJT 情境判断：设置条目、维度或情境，保留研究性计分定义。', '认知测验：使用受控模板；刺激呈现、时序和输入采集由既有测验程序执行。', '先做结构检查和试答预览，再在发布时冻结工具版本与评分来源。'],
    note: '自编工具用于研究探索，不因可以发布就获得正式科学资格；涉及外部内容和图片时仍需相应授权。',
  },
  {
    path: '/features/research-participation', title: '发布与参与', description: '知情同意与链接采集', icon: ScanLine,
    introduction: '通过独立研究邀请链接参与，先了解研究，再决定是否作答。',
    points: ['以研究波次安排发布、招募和收集，开放前检查并冻结内容。', '参与者通常无需平台注册账户，经研究邀请链接了解研究并确认知情同意。', '按当前研究设置提供恢复入口；暂存、工具完成和整轮正式提交分别确认。', '完成后提供完成确认与非诊断性的通用反馈。'],
    note: '单次匿名不关联其他波次；多波次以研究内编号连接回答，属于假名化研究，须明确告知关联方式。研究发布按环境开通情况提供。',
  },
  {
    path: '/features/research-data', title: '数据与分析', description: '项目内统计与受控导出', icon: ChartNoAxesCombined,
    introduction: '在项目内查看研究进度、回答与描述统计，按波次整理和导出数据。',
    points: ['查看项目与波次的采集进度，区分完成、缺失、拒答和撤回等状态。', '查看逐题描述统计；符合条件的多波次研究可按研究内编号关联。', '通过受控导出获取 CSV、变量编码字典与 Manifest，保留批次和来源说明。'],
    note: '数据分析与导出按当前环境和权限提供。敏感导出需要近期双因素验证；统计结果不自动构成个人诊断或因果结论。',
  },
] as const

export type SurveyFeature = (typeof surveyFeatures)[number]
