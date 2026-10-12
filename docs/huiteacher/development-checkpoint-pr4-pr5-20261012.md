# Huiteacher｜PR4 代码收口与 PR5 启动记录（2026-10-12）

**统一开发分支：** `feat/huiteacher-pr1-education-identity`  
**本记录代码基线：** `ae75dc4b4af54b345c1ba2acf178407528fde47c`  
**最新已核对 main（不自动 rebase/merge）：** `935a6d5cd7d0acfe1b4b84b5c247cf6d3da6586c`  
**正式工程规范：** [Huiteacher v1.2](https://app.notion.com/p/3f6d27635a38818d9bbddaf9ec8a48fa)

> 仅代表**分支内代码已推送**；**没有执行 CI、运行集成测试、合并、部署或生产验收**。不把“有源代码/测试文件”标记为质量门禁成功。当前特性分支 Actions 数为 0；没有为 Huiteacher 创建正式 GitHub PR。本轮继续单分支堆叠开发。

## PR4｜开发代码状态：主要范围已收口，统一验证待执行

| 功能 | 源码实现 | 仍需正式验证 |
|---|---|---|
| 现场活动 | CLASSROOM/MEETING/TEACHING_RESEARCH/FIELD_VISIT；纯现场活动只在存在已接受且未过期受邀者时 OPEN，普通 ASSESSMENT 不允许空 Run 开放 | 状态迁移及受邀者并发撤销 |
| 外部专家／同行 | 共享教育账号、一次性注册/领取邀请、按活动授予 EXPERT/PEER，期限与撤销控制；不自动成为心理业务成员 | Teacher-only/School-only/双产品跨校准入 |
| 现场 Form 与观察 | 复用已发布 Form V2 定义，绑定至现场事件；Form 结构化提交、单独加密正式证据，带版本摘要；事实、正式反馈和私人反思分开 | 题型、草稿恢复、冻结哈希、数据库触发器、手机端 |
| 多评价者／人类协商 | 两名不同正式评价者的正式来源、冻结证据、修订版本、本人审阅同版哈希与两个签署、最终提交 | 签署并发、来源撤销/过期、共识不可被误认为均值 |
| 正式结果分发 | 管理者仅向对应 PERSON 被评价教师受控发布 FORMAL_FEEDBACK 或已提交共识；独立会话、授权与隐私判断；私密日志不在反馈中 | 访问权变更、回退、客户端 |
| **本轮补齐** | `fieldForm.service.ts` 新增仅对本校 Teacher PRODUCT_ADMIN 可读取的**已提交 FORMAL_FEEDBACK 结构化证据**：近期 MFA、当前产品授权、表单版本、密文哈希、产品/记录 ID 全部匹配，逐次访问审计；不返回专家身份或私人反思。管理页面按需读取；测试提交 | 测试未运行；必须用隔离 PostgreSQL 验证会话和越权路径 |

**阶段判断**：PR4 的主要开发流程和静态权限边界已有代码，不需要重复建设评价引擎，可转入 PR5；**PR4 不等于 CI 完成、不等于合并资格**。如后续类型或真实运行发现问题，仅修订受影响部分。

## PR5｜已经开始，当前为“任务配置/资格预览”，并非完整学生评教

本轮 PR5 已在同一分支新增：

1. `20261012001800_huiteacher_student_eval_config` 与 Prisma Model：`huiteacher_student_eval_configs`，不可改写的 **Teacher 人员 target + 真实 StaffClassAssignment + 班级 + 已发布 Form V2 digest**。DB 触发器拒绝非 ASSESSMENT 草稿、无任教关系、跨校资源、非正式 Form 和不匹配 target。
2. `studentEvaluation.service.ts`：配置只由本校 Teacher 产品管理员操作；必须经过已有 USER、Teacher PERSON target、有效 TEACHER persona/StaffClassAssignment 的严格匹配。列出**该教师**实际班级任教候选，不凭姓名称谓匹配或猜测学科。
3. `studentEvaluation.routes.ts`：配置、已核验任教关系、资格预览三类接口；敏感操作要求本校产品管理权和近期 Teacher MFA。**`HUITEACHER_STUDENT_FEEDBACK_ENABLED` 默认未启用时返回 404**，不会因为仅部署新代码就开放评教。
4. `HuiteacherStudentEvaluationManager.tsx`：管理端（另受 `VITE_HUITEACHER_STUDENT_FEEDBACK_ENABLED` 控制）选定合法任教关系／Form，冻结配置并查看本人学校的资格人数/阈值。无学生正式评价按钮或原始数据读取。
5. `huiteacherStudentEvaluation.postgres.integration.test.ts`：合成 Teacher-only 学校、真实学生共享 User 与班级关系、教师 staff appointment、错配/越权/10 人阈值对抗，**仅提交，未执行**。
6. 误发布保护：已配置的学生评教任务无法走普通教师 SELF Run 草稿创建接口；先前存在的普通 SELF Run 也不能被追认成学生评教。学生评教必须等待独立学生→教师关系的正式 Run 适配。

**设计边界不变：** School 与 Teacher 一套教育账号，两个 Host 各自登录，无 SSO。Teacher-only 学校不必先开通心理健康服务；学生无需第二套账号。学生评教需要 School 学生身份、当期班级关系和学校核验的实际任教关系；不读取心理测量报告、学业成绩或教育绩效评价。

### PR5 接下来需实现（尚未完成）

- 为经学校核实的 **TEACHER subject + STUDENT respondent** 配置独立于 TEACHER SELF 的授权 Form V2 resource/Disclosure Contract，`relationshipKind=CLASS_TEACHER_STUDENT`，明确教学班适用边界及产品范围。
- 标准 Assessment Run 在发布时冻结唯一 target teacher/class/current students；**不得**将同班其他教师自动加入评价，也不得将曾登录的 School 学生当作 Teacher 心理业务成员。防重复/撤销/本人作答资格应复用现有 Run。
- 受限学生 Task Inbox→START→正式加密 FINAL，`HUITEACHER_FORM_V2` 正式提交适配学生角色和师生关系；学生不得浏览 Teacher 学校后台/个人教师报告。
- 教师群体反馈：最小独立样本、固定人口防差分、自由文本审核、关闭后授权披露、无学生逐人答案/身份映射；教师与校方受众不同，不能将群体分布映射成科学 Scale 得分或排名。
- 前端学生参与入口及学校业务双产品权限反向验证。所有正式 CI 与浏览器/DB 用例暂不执行。

## 最小正式验证矩阵（用户暂停，均**未执行**）

| 变更 → 故障 | 唯一主要位置 | 可复用证据 | 时间预算 |
|---|---|---|---|
| PR4 field evidence／consensus → 访问越权、记录篡改、错误签署 | GitHub 受影响隔离 PostgreSQL+后端契约 | 无本轮正式通过证据 | 最终差异冻结后逐 job 确认 |
| PR5 DB／学校任教关系 → 跨校或错误教师绑定、旧数据变更 | GitHub 受影响隔离迁移/数据库契约 | 无 | 同上 |
| PR5 API／UI → 产品权限、MFA、表单误发布、响应式 | GitHub 受影响后端+前端类型/交互检查 | 无 | 同上 |
| 正式部署 → 版本/证书/回退错误 | 仅在单独批准的生产发布核对同一产物、有限就绪与一条短流程 | 仅未来合格同一 digest | 当前不执行 |

差异涉及数据库/跨产品 ACL，正式提交 PR 时需要由**当时完整差异**按仓库 `AGENTS.md` 和 `docs/release/README.md` 保守分类，不得制造“PR4 PR5 已绿”假门禁。本地签名接纳目前仅支持文档/发布工具，**应用检查不能冒充本地证据已被 CI 正式接纳**。

**仍暂停：** 学生成绩及考试—教师匹配、SSO、复杂教务、重新建设计分引擎、未经科学审核的标准常模和绩效排名。
