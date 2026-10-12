# Huiteacher｜PR5 收口与 PR6 源码接续检查点（2026-10-12）

**唯一开发分支：** `feat/huiteacher-pr1-education-identity`  
**正式依据：** [Notion 工程实施规范 v1.2](https://app.notion.com/p/3f6d27635a38818d9bbddaf9ec8a48fa) 与产品功能蓝图 v1.1。  
**最近检查到的 main：** `96aad102e591eef4b59c3cc51db7d4c6f23cfc6b`。  
**冻结前基线：** `295db7b76752230a03280f7854153c10c7d41880`；PR5/PR6 后续提交见该分支 Git history。本文件提交本身会前移 HEAD，故不可将其中的历史 SHA 冒充当前 HEAD。  

> **状态：本分支仅已提交/推送源码，没有正式 PR、CI、合并、生产部署或数据库迁移。** 测试代码已经提交，但**没有执行或通过证据**。PR5 判定为「源码阶段主要闭环完成，需正式验证」；PR6 判定为「已进入连续开发，部分实现，尚未收口」。此文件不代表可以投产。不得自动激活 CI。

## PR5｜完成的代码链路与风险边界

- **学校配置：** `huiteacher_student_eval_configs` 精确冻结同组织 PERSON 教师目标、有效学校任教分配、合法班级及已发布 Form V2 资源摘要；不用行政班推断所有学科任教关系。
- **唯一 Run：** `createHuiteacherStudentEvaluationRun` 在事务内写入正式 Assessment Run、活动链接、一个 `huiteacher-student-form:<id>` Track；普通教师 SELF Run 创建仍拒绝承接此配置。
- **参与资格与学生入口：** 原 SCHOOL 教育账号直接在 Teacher Host 独立登录；教师与学生有各自的产品权限；学生只进入自己的任务列表、Form START/FINAL 和完成回执。冻结主体 TEACHER、作答人 STUDENT、`CLASS_TEACHER_STUDENT`，校验本次 StaffClassAssignment 和学生班级记录。未获资格或被撤销者不能形成新 FINAL。
- **幂等 FINAL：** 复用 PR2 的 `HUITEACHER_FORM_V2`、Survey V2 条件与回答规范化、加密不可变 FINAL、唯一 attempt、关系 Assignment 和 Run execution 原子完成。刷新或重放不能形成第二份权威答案。Form-only 不计算未经验证的 Scale 总分。
- **闭环与隐私：** Run/活动关闭后才允许披露；冻结参与总数须 `N>=10`，有效独立学生 `n>=10`，若不全部完成则未作答补集至少 5 人。每题小单元及其可推导补集按整题抑制，原始文字永不直接披露；不给教师或普通管理员查询逐人身份、答案、个人时间戳、任意筛选。只允许本人被评价教师或本校 Teacher 产品管理员查看合法群体结果。
- **跨轮保护收紧：** `20261012001900` 的披露账本及 `20261012002000` 的唯一索引将首版限制到**同一学校、同一教师至多一轮公开学生群体反馈**（不同班级/工具均受约束）。这比逐班级账本更保守，但能阻断未知重叠班级中的差分风险；跨班级和多轮报告需 PR6 另做科学/隐私审查，不能直接打开。
- **正式代码测试（未执行）：** `huiteacherStudentEvaluation.postgres.integration.test.ts` 与 `huiteacherStudentEvaluationRuntime.postgres.integration.test.ts`，涵盖 Teacher-only、School-only、双产品账号、任教匹配、未授权 START、重复及并发 FINAL、角色撤销、任务关闭、部分参与率、拒答/文本/单元抑制及不可改写披露账本。

**PR5 本轮关键修复：** `2d7078d` 强制合法参与学生人数下限、跨班级防差分；`31e83a6` 清理已经过时的“学生 Run 适配未发布”错误语义。此前连续 PR5 实现提交从 `8f8c8de` 到 `295db7b`，均在**同一分支**。

**PR5 不能声称：** 已通过类型检查、Prisma 迁移、真实 PostgreSQL 合约、浏览器 390/768/1440、CSRF/Origin/MFA、正式 CI 或生产 Host/TLS。学校管理员和被评价教师的受众权限需要在第一轮真实测试中再次确认。

## PR6｜已启动的范围

| 源码阶段 | 实际提交与实现 | 明确尚未实现 |
| --- | --- | --- |
| C1 稳定对象时间线 | `0b91bcf`：`timeline.service.ts` 按 Teacher 产品管理授权读取目标/Event/Run 的版本化事件元数据，避免读取个人 FINAL | 不是经审核的量表分数趋势；无同指标/样本/情境可比性科学证明，不能画结论性曲线 |
| C2 改进模型与权限 | `fcae475`、`3df78fc`、`eafac41`：`huiteacher_improvement_actions` 增量迁移、Prisma 模型、私人与学校共享两受众、目标与已关闭事件关联、加密目标/计划/证据、状态/版本锁/不可变历史、审计；本人目标精确教育 User 发现 | 独立于任何学校的个人自主管理目标、跨学校协作、实物附件证据和复杂 OA 不纳入此源码阶段 |
| C3 工作台 | `026e25c`、`a60c6b0`：教师私人发展、学校目标时间线与共享改进、专家受控观察/共识分开导航；平台治理明确转现有独立入口 | 平台治理并没有在 Teacher 身份下重新授权；B3 火 Logo 正式文件、完整视觉和无障碍验收未完成 |
| C4 上线配置准备 | `32181f9`：canonical Compose 对 backend 三个开关及 frontend 两个构建期开关进行**默认 false** 映射，Dockerfile 不意外内建开启学生评教或改进行动 | 正式 Host DNS、TLS、外层 Nginx 路由、生产 Compose 现状、迁移执行、回退和浏览器证据都未验证 |
| C5 审查与集成测试源码 | `0f72002`：真实隔离 PG 上私人/学校 ACL、证据加密、关闭状态、不可变触发器、越权与撤销测试；`31e83a6` 修订 PR5/PR6 语义 | 尚未运行。需要同一候选树的源码审查、类型/Prisma/受影响端到端验收、精确 CI 及正式 Host 检查 |

### PR6 下一步不可跳过的工作

1. 将同一对象的各次评价按照**来源、目标、方法、工具版本、授权受众、抽样/评价者情境**核对可比性。当前接口一律 `SOURCE_METADATA_ONLY`；科学条件不足只并列历史，不自动计算变化分数或组织绩效排名。
2. 学校管理、教师、专家的 390/768/1440 页面、表单、键盘操作、加载/空态与交互一致性逐屏收口；获取并准确集成用户定稿的 **B3 火形 Logo**，不要以 CSS 的「火」字占位假称 B3 定稿。
3. 完整校验 PR1–PR6 的身份、会话、SQL 迁移、加密/权限、Science/FINAL、School 心理接口反向隔离；补充并审查标准候选浏览器/接口用例，避免重复测试已有相同输入的正式证据。
4. 处理此分支相对 `main` 已发生的大量主干漂移。特别是 Prisma schema、后端 Router、Survey Form V2 参与页面与核心 NORMALIZER 变化，不能盲目覆盖 main；用户未授权合并和部署。
5. 生产阶段须**另获授权**核对 `teacher.eduk12.top` TLS/DNS、外层入口、安全 Cookie、Origin/CSRF、实际 Compose `eduk12-prod` 与迁移可逆性；所有功能开关保持关闭直到正式验收。

## 最小验证矩阵（本轮均未执行）

| 冻结改动 | 必需检查与所防故障 | 唯一主要执行位置 | 可复用正式证据 | 预算/停止 |
| --- | --- | --- | --- | --- |
| PR5 冻结任教关系、FORM START/FINAL、披露账本与 PR6 improvement schema | Prisma/SQL DDL/FK/触发器失败，重复/重放 FINAL，错校/错班、敏感群体泄露 | GitHub 正式候选的**真实隔离 PostgreSQL** 与受影响后端测试；同候选一次 | **无**；仅有尚未执行的测试源码 | 隔离 DB 与受影响后端检查按正式 job 实际预算冻结；失败先定位，只复验失败项 |
| PR6 timeline/action/ACL | 错误受众、私人日志外泄、版本竞争、错误跨产品关联 | GitHub 受影响安全与积分/授权契约（同一 DB 候选时消费一次） | **无** | 不额外跨本地/CI/服务器整套复测 |
| PR5/PR6 Teacher 前端与产品 Host | 入口错误、不可见任务、受保护报告错误呈现、390/768/1440 交互缺陷 | GitHub 受影响前端类型/构建及候选浏览器 | **无** | 前端构建一次供浏览器复用；轻量作业超约 5 分钟定位具体阻塞 |
| 正式上线候选与发布 | 错误合并源、镜像 digest 不一致、Host 证书或回退失败 | 另获授权后：GitHub 正式合格产物 → 服务器仅确认版本/就绪/一条短流程/回退 | **无** | 目前不部署、不运行迁移 |

按实际完整差异保守适用发布路线 C；用户暂停 CI 时绝不自行执行或制造成功证据。新的 PR6 标志 `HUITEACHER_IMPROVEMENT_ENABLED`、`VITE_HUITEACHER_IMPROVEMENT_ENABLED` 均默认关闭，原 PR5 学生评教亦默认关闭。**应用本地签名结果尚无正式 CI 接纳通道，不得冒用。**

## 本轮执行边界

- **未新建分支；未新建 GitHub PR；未合并 main；未触发 CI；未操作生产服务器；未执行 DB 迁移。**
- 只推送原分支的阶段性 Commit、进行 GitHub 源码静态 Review、提交隔离 DB 测试代码与安全关闭的候选配置。
- PR5 在「源码阶段」交付；PR6 已开始但不宣称整版完成或可上线。
