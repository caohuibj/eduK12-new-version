# Teacher 浏览器审计问题修复（2026-11-23）

基于 `f51b2b5aa139934eeda41d573e4ff80b0ea4b564` 的本地工作区修复，覆盖本轮审计的 6 项功能问题和 7 项体验问题。当前结果是本地代码与定向验证，没有激活 CI 或部署生产。

| 编号 | 修改结果 | 主要位置 |
| --- | --- | --- |
| FUNC-001 | StrictMode 清理失效请求时释放操作锁，旧响应不覆盖新请求，也不能解锁后续写入 | `EducationCompositionStudio.tsx` |
| FUNC-002 | 同行进入事实观察记录；专家继续填写固定问卷与专业意见，沿用原有角色授权 | `HuiteacherFieldWorkspace.tsx` |
| FUNC-003 | 刷新同时回读当前共识的确认数；保留本地未保存文字，版本冲突时提示保留文字后重新核对 | `HuiteacherConsensus.tsx` |
| FUNC-004 | 已授权工作区与已知分区可从刷新、前进和后退恢复；保留草稿离开保护 | `HuiteacherApp.tsx` |
| FUNC-005 | 受邀列表包含活动状态；草稿活动明确显示等待开放，并禁止填写 | `observer.service.ts`、`HuiteacherFieldWorkspace.tsx` |
| FUNC-006 | 任务已取消的开放活动提供“取消活动并结束”，经确认后进入取消终态 | `HuiteacherEvaluationStudio.tsx` |
| UX-001 | 发布错误使用服务端具体 issues，并显示页码、题号和字段位置 | `HuiteacherFormStudio.tsx` |
| UX-002 | 管理员按本校登录名检索并选择观察者；外部专家通过受控邀请码领取；既有邀请显示账号名 | `organization.routes.ts`、`observer.service.ts`、`HuiteacherFieldManager.tsx` |
| UX-003 | 小屏工作区及分区导航以两列展开，核心入口不依赖横向滑动 | `huiteacher-workspace-layout.css` |
| UX-004 | 教师自评声明、作答提示、成长及邀请状态中文化，任务编号和版本技术资料收进详情 | 共用量表编辑器及 Teacher 页面 |
| UX-005 | 入库申请仅校验四项必填元数据，作者及版权说明允许留空 | `EducationPrivateScaleSharing.tsx` |
| UX-006 | 从同一 FINAL 的冻结准入定义映射选择题、矩阵、排序等答案文字，保留拒答、未显示及零值 | `fieldComposition.evidence.ts`、`fieldEvidenceDisplay.ts` |
| UX-007 | 取消活动草稿前显示活动名和影响；拒绝确认不发送写请求 | `HuiteacherEvaluationStudio.tsx` |

## 验证

- 前端相关 94 个不同回归用例通过：首次组件集合 58 项、直接消费者集合 34 项、新增可选资料及历史导航 2 项；对测试数据或页面文案造成的失败只定向复验。主要文件包括 `EducationCompositionStudio.test.tsx`、`EducationPrivateScaleSharing.test.tsx`、`HuiteacherConsensusRefresh.test.tsx`、`HuiteacherPracticePages.test.tsx`、`HuiteacherWorkspaceLayout.test.tsx` 和 `HuiteacherRunPreview.test.tsx`。
- 后端相关 88 个不同回归用例通过，覆盖固定证据完整性、显示投影、专家角色契约、路由及原生边界。新增冻结准入测试初次缺少 parent 哈希字段，补齐测试数据后单独复验通过。
- 前端应用和后端 TypeScript 检查通过；全部改动前端文件的 ESLint 无错误，保留 6 个已有 Hook 警告。
- 最终前端正式构建通过。构建时仍有现有的大包体积提示。导航依赖在代码复核中收紧后，以变更后的输入重新构建并复验。
- Node.js、Playwright 与系统 Chromium 执行的 46 项不同浏览器检查，最新结果全部通过。覆盖八身份移动入口、真实检索与邀请、同行事实记录、两位独立专家的 FINAL 和意见、共识双人确认及一次刷新发布、取消确认和终态、八身份与跨校检索权限、无效表单错误位置、可选资料实际提交/撤回、旧证据回读、开发及本地正式构建。

所有首次失败、测试定位错误及定向复验记录均保留在 `/workspace/teacher-fixes-20261123`，没有删除早期结果来计算通过率。截图及逐项修复清单见该目录的 `修复验证报告.html`、`data/state.json` 和 `data/fixes.json`。

## 数据与范围

原测试数据继续保留。新增独立的三方观察活动、事实记录、两份正式意见及双签共识；原来任务取消后仍开放的活动已通过修复后的入口进入取消终态。入库回归申请提交后已正常撤回，保留审计记录。

证据显示是读取投影，不改写原始答案、加密证据、FINAL 摘要或报告权限。没有冻结定义的旧记录保留原始记录详情，不根据当前草稿猜测答案。

本地正式构建通过隔离的浏览器文档传输访问真实本地 API；不构成线上 DNS、TLS 或部署验收。本轮没有重新执行缺少正式授权资源的认知、情境、整包与多波次报告正向流程；这些范围沿用原审计的覆盖限制。School 共用组件以回归用例验证，本测试学校只开通 Teacher。
