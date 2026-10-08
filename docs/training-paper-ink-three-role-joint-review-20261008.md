# Huisurvey Training｜纸墨·见山 三入口联合 Review（2026-10-08）

**审计基线（仅源代码）：**
- [PR #246](https://github.com/caohuibj/eduK12-new-version/pull/246) `feat/training-paper-ink-entry@75ecb0d4`。
- [PR #247](https://github.com/caohuibj/eduK12-new-version/pull/247) `feat/training-course-flow@988ad1a7`，base = PR1。
- [PR #248](https://github.com/caohuibj/eduK12-new-version/pull/248) `feat/training-admin-governance@d61ea07c`，base = PR2。
- **本轮未执行 CI、完整 TS build、单元测试、浏览器/E2E、真实 PostgreSQL 集成、生产发布、域名 DNS/TLS。** GitHub mergeable/behind=0 只表示叠放关系和 Git 可合并，不能证明功能验收。
- 因现对话环境无法运行完整仓库与已登录浏览器，本轮提供的页面图仅是**基于源码重建的静态示例预览**，有显式标注；严禁将其作为真实 UI 截图或 Visual QA 证据。

## 一、三个入口的边界

| 角色 | URL / 首页 | 功能结构（源码已接线；实际运行仍待验证） |
| --- | --- | --- |
| 学员（现有 STUDENT） | `training.eduk12.top` 两身份入口 → 登录／课程码注册 → `/student` | 我的课程／加入课程；进入 `/student/courses/:courseId` 后只展示作业、打卡、测评；在原有 submission / Scale / Cognitive / Composite / Bundle Runtime 中完成；个人反馈仅按产品披露权限 |
| 培训师（现有 TEACHER） | `training.eduk12.top` 两身份入口 → 教师码注册／平台审核／登录 → `/dashboard` | 我的课程／创建课程；课程页作业、打卡、测评三个标签，成员管理和培训结果快捷入口；“课程设置”内改名／介绍、轮换课程码、暂停／恢复招募、结束课程；课程作者可对已报名有效学员进行受限全局密码恢复（一次性凭据交付／旧会话失效／首次改密／审计），但不能冻结全局账号 |
| 管理员（现有 ADMIN） | **统一 Huisurvey 后台** `/admin/training`；不是 training 域名的第三个登录身份 | 培训师审核及注册码、材料与测评授权入口、课程监管、固定包／报告方案与内容审核，复用既有账号／资源／权限数据库，未新增 Training admin role |

**重要差异：** 学校原版 Course 与培训版仍共用 User、Course、CourseStudent、MaterialGrant；host 用于前端产品呈现，**不是**服务端租户隔离；普通培训师如在其他入口创建课程，是否在培训版混列仍需产品决策或真实 ProductRealm。现有组织 GROUP/longitudinal 与课程师生正式关系量表尚未适配/发布，**不属于这三个 PR 已交付内容**。

## 二、近期源码 Review / Fix 清单

- PR1：纸墨色彩、宋体和手绘的入口／两角色极简首页；登录注册文案；课程分页；移动端保留微型手绘；拓展深层标准业务页 paper/ink 的排版、表格、按钮、弹窗、44px 触控范围；TrainingContextBack；Training 非组织/关系页面暂停无关 discovery 但直接组织/关系深链接仍可使用。
- PR2：从课程页发布作业、打卡、标准 Questionnaire、Standalone Cognitive；新增 CourseSettings（课程码轮换／暂停与恢复报名／结束课程的确认）；新增只读课程投放 inventory（Legacy Questionnaire / new Questionnaire / Scale / Legacy Composite / Bundle / Standalone Cognitive），不含作答／评分／个人报告；学员页面作业草稿、打卡截止和组合测评开闭时间状态区分；后续更新的 >100 门课程权限验证型预选及 `studentTasks?courseId=` 来源过滤已保留。
- PR3：统一管理端课程／资源授权导航；学员 roster 操作触控目标与文案优化；教师课程内受限密码重置，事前资格与锁内重新校验、特殊角色保护、tokenVersion 与首次改密、临时凭据一次性视图、非秘密审计；全局冻结仍是 PLATFORM SYSTEM_ADMIN；后端 `/courses/join` 增强 STUDENT 角色核验。
- 本轮发现 PR2 有新的 12 个提交尚未进入 PR3 的风险，已在 PR3 创建非强制双父提交，复制相关 11 处最新源码差异，之后 compare 显示 PR3 对 PR2 **behind=0、mergeable=true**。

## 三、按角色必须验收的功能

### 学员
1. 空账号课程码注册、已有账号加入课程、重复码／码轮换／暂停报名／结束课程／跨课程报名。
2. 自己的两门以上课程、作业草稿保存→最终提交、已截止打卡、课程任务独立来源；不可把公开但未布置问卷当课程任务。
3. 标准 Scale、Cognitive、Composite、Bundle（含合规 Situational）实际启动/恢复/FINAL/个人反馈；冻结科学报告及资源披露门禁不因 Training host 变更。
4. 移动端 390px / 768px 的表单、任务卡片、错误／空态、返回课程和焦点操作。

### 培训师
1. 注册码→审核→登录→创建课程→课程码→学生加入→成员列表／移除／本人课程受限密码恢复；不能重置其他课程学员、冻结全局账号或重置高权限人员。
2. 课程设置中的改名、轮换码、暂停／恢复报名、结束课程；先确认后发请求，更新结果与新课程码实时呈现。
3. 作业、打卡和测评发布及授权：已有独立 Scale、认知、Legacy/new Questionnaire、Composite/Bundle 均在课程只读清单中看到真实投放，不泄露未授权项目或原始数据。
4. 作业批改与结果查看：通过当前原有管理系统页面和数据工作台，禁止把组织群体/longitudinal 报告呈现为培训课程报告。

### 平台管理员
1. canonical ADMIN 登录／`/admin/training`、审核培训师、注册码、材料使用授权发放／查看／撤销、课程监管、固定包和报告方案内容治理。
2. 非 SYSTEM_ADMIN 不可执行全局用户冻结与强制密码重置；系统管理员操作需保留旧审计、限流和事务守卫。课程培训师只拥有与本人课程相应的学员密码恢复例外。
3. Training 页面本身不是独立租户，检查所有入口的业务授权均由后端独立实施；移动端工作区布局与表格正确。

## 四、Merge Gate 与实际截图要求

1. 在 **PR3 累计 head** 的隔离开发环境执行完整 TS typecheck、lint、frontend unit、backend unit、PostgreSQL 强权限集成（不允许 skip）、build。
2. 先在 Stack 的累计 head 做完整浏览器覆盖，**再按 PR1 → PR2 → PR3** 的层级解决每个 PR 对各自当前 base 的 required checks。禁用基于标题或源码静态评价直接宣告“全部 CI 通过”。
3. 真实截图必须来自实际运行应用的认证会话，按 390/768/1440px 拍摄：培训入口、学员首页+课程+提交+结果、培训师首页+课程设置+发布+成员管理+临时密码弹窗（使用测试数据，不泄露真实凭据）、Admin 培训管理 hub + 资源授权页。
4. 外部 `training.eduk12.top` 的 DNS/TLS/ingress 还未在本轮 PR 部署；不能把静态还原当成该域名已正常运行的证据。

**当前判断：三个入口的设计/源码路径已覆盖约定的一期范围，QA与运营上线尚待验证；群体报告、纵向报告、正式师生关系测评和跨产品 ProductRealm 仍未实现培训独立产品能力。**
