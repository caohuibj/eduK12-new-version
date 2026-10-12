# Huiteacher｜PR1–PR6 跨模块联合静态 Review 与修复记录（2026-10-12）

**仓库**：`caohuibj/eduK12-new-version`  
**唯一开发分支**：`feat/huiteacher-pr1-education-identity`  
**本轮初始 HEAD**：`3675e2a240e2242354ddb1e9630753054c0921e9`  
**初始 main**：`96aad102e591eef4b59c3cc51db7d4c6f23cfc6b`  
**本轮代码修复后、写本文件前 HEAD**：`3e1ddd96adff40d09c869820e667ed079ed42cb2`  
**代码修复后对 main**：ahead 176／behind 113，149 changed files（多轮 PR1–PR6 的累积差异；不是六个已创建的 GitHub PR）。本记录提交本身将使分支 HEAD 再前移，必须在后续工作开始时再次查询。

**状态**：仅完成 GitHub 源码静态 Review、实际修复、提交／Push 和测试源码补充。未创建 GitHub PR、未启动 CI、未合并、未进行生产部署或任何数据库迁移；本分支 Actions 运行数为 **0**。未执行的验收不能当作已通过证据。

## 一、本轮确定的修复

| 责任模块 | 发现的问题 | 修复与可核验源码提交 | 受影响的正式定向检查（尚未执行） |
| --- | --- | --- | --- |
| PR1／PR6：平台治理 | 已有独立教育产品授权接口，但主域无对应正式平台管理员页面；Teacher 原跳转到 Training，未形成管理员实际可用入口 | `6b5c5a1`、`626da7e`：主域 `/admin/education-products` 新增仅 SYSTEM_ADMIN 可进入的管理界面、产品分开开通与停用、Teacher 管理员授予／撤销、密码 step-up；Teacher 仅提供跨域链接，不共享会话。Backend 原有 `listEducationTeacherAdmins`、root Origin 权限来自更早同分支提交 | 主域管理员身份与 CSRF，School／Teacher 会话拒绝，产品授权及页面键盘操作 |
| PR2／PR5：Run 授权 | 通用 `publishAssessmentRun` 可能允许已被撤销 Teacher 产品管理员的教师通过原活动创建者身份继续发布 Teacher-bound Run | `a85cba1`：所有属于 Teacher Evaluation 的 Run 发布，必须具备当前有效 Teacher Product Admin；`222c9b7` 增加真实隔离数据库的撤销→通用发布拒绝→恢复授权验收源码 | 真实隔离 PG 中 Run Ownership 与 revoke／republish、不影响普通 School 专业交付 |
| PR5／PR6：学生隐私来源 | 普通 PR6 纵向改进可把学生评教活动标题当作已发布证据使用，从而避开 PR5 受控群体报告与跨轮保护；关闭但没有 FINAL 的普通评价也能被当作来源 | `cc2b18d`、`ea1771f`、`ed59949`：服务层与新增 DB trigger 双重限制，只能引用正式完成 Run 或正式提交的非私人观察，排除学生评教作为 PR6 来源并加拒绝测试 | Source 审核、student privacy ledger、reassessment INSERT guard、撤销后拒绝 |
| PR3／PR5：Form 群体统计 | Survey V2 官方 FINAL 的 `MATRIX/MATRIX_MULTIPLE` 为嵌套 `rawAnswers[q][row]`，原 Teacher 群体统计按 `rawAnswers[q:row]` 读；REFUSED 由 `missing[]` 保存而非原始答案 | `bde7b60`：成人组织报告和学生评教都使用正式归一化结构及独立 `missing` 向量；不动 Survey FINAL 和 scorer。 `8014d32` 提交真实 Survey V2 正式归一化、矩阵／拒答／小单元抑制的定向测试源码 | 正式 Form V2 规范化与不同题型选项频数、受众小单元抑制、兼容旧已冻结数据 |
| PR2／PR5：条件分页 | 作答组件用“显示页数量”推算最终页，却向 TaskForm 传原始页面索引，隐藏中间页时可能在后续页面完成之前允许 FINAL | `059a423`、`3e1ddd9`：以最后一个可见页的**原始页索引**门控提交，抽取纯工具函数；增加中间页、末页隐藏的测试源码 | 390/768/1440 条件问卷完成与 FINAL 禁止提前提交 |

以上仅代表源码已修，不代表验证通过。本轮未更改评分规则、学术解释、产品订阅数据，也未运行任何迁移。

## 二、PR1–PR6 联合审查分区与边界

**PR1 身份与产品：** School／Teacher 使用同一教育用户与学校基础关系，各有独立 Host Cookie/Origin、entitlement、ProductRoleGrant；平台开通管理仍须已有 ADMIN 账号的独立会话及二次密码。重点回归 School-only、Teacher-only、双产品学校及撤销授权后下一次 API 的效果。

**PR2 Assessment Run 与 Survey Form：** Teacher 配置中的 Run 绑定与发布资源必须由当前 Teacher 产品管理员控制；作答沿用共享 START/FINAL／加密提交事务，不新增第二引擎；条件题正式答案仍由 Survey V2 验证。Form-only 不推导 Scale 分数。

**PR3 教师个人发展及组织调查：** 教师个人 Scale 仅本人报告；学校报告为达到最低样本门槛且符合同一冻结总体的选择分布，不直接公开个人答案或自由文本。矩阵／拒答统计已针对性修复。现有成年人群体跨不同工具版本的差分控制仍须在正式门禁评估，不能声称完全解决所有历史组合。

**PR4 观察、专家、共识：** 已核对活动状态、有效专家授权、私人反思与正式提交相互隔离、正式共识有独立来源和至少两人审批、教师反馈另有显式发布授权。本轮未发现需改写这些共享来源的确定性缺陷；正式 DB 与客户端验收仍未执行。

**PR5 学生评教：** 实名资格用于 START/FINAL；群体反馈仅在活动与 Run 关闭、独立有效反馈 `n>=10`、补集与小单元满足要求时按题披露；同学校同教师仅首个正式群体发布，防止跨班级与波次差分；自由文本不直接展示。PR6 不得以附带评价历史、行动来源、复评结果绕过此披露约束。

**PR6 纵向及四工作台：** 仅报告同对象、来源及工具版本、明确比较障碍；无经科学验证的跨期统一量尺则不得发布数值趋势或因果效果。改进行动记录私人／学校共享的独立访问控制，完成证据及复评采用加密、受控状态和单次不可变关联。B3 品牌使用用户明确批准的源图，尚未有 390/768/1440 浏览器截图或与原图像素核验。

## 三、下一步正式检查（仅记录，不执行）

| 当前冻结范围 | 必需检查及要识别的故障 | 唯一主要位置 | 本轮可复用证据 | 时间与失败处理 |
| --- | --- | --- | --- | --- |
| PR1／PR2／PR5 发布权限与共享身份 | School 与 Teacher entitlement/role 反向隔离、账户撤销后通用 Run 无绕过、FINAL 唯一和并发幂等 | GitHub 候选正式隔离 PostgreSQL + 受影响身份与 Run 契约 | 无（测试源码不等于测试结果） | 选定受影响作业后冻结预算，失败只复验相关项 |
| PR3／PR5 Form 结果适配 | MATRIX／MATRIX_MULTIPLE、REFUSED／NOT_SHOWN、条件分支、样本压制，不出现原始答案或个人时间戳 | GitHub 后端受影响定向用例；同 DB 场景消费一次 | 无 | 不重跑无关 SJT/Cognitive |
| PR4／PR6 纵向数据来源 | 未结束／无正式证据／学生评教引用拒绝；私人反思不变共识；DB trigger、隐私账本并发／回退 | GitHub 隔离 PG、迁移／权限契约 | 无 | 如迁移失败先定位具体 SQL |
| 管理员入口与 TaskForm 及 Logo | ADMIN vs Teacher 独立身份、CSRF、真实 390/768/1440 和键盘路径、条件页 FINAL 门控及 B3 源图 | GitHub 只构建前端一次并复用受影响浏览器候选 | 无 | 前端图形/页面部分不触发无关后端全回归 |
| 合并／生产入口 | main 漂移、同一产物与版本、外层 TLS／Nginx／Host、有限就绪、受影响短流程和有效回退 | **需要未来另行用户授权**；GitHub 正式候选后服务器只做运行时确认 | 无 | 当前严格不合并／不部署 |

## 四、不能报告为完成的项目

1. **正式验收、CI、数据库迁移、合并、生产发布：一律未执行**；不提供伪造的绿灯结论。
2. 分支与 `main` 漂移仍有 113 个提交；正式集成前需要逐项解决共用 Prisma schema、Survey V2、前端/容器和数据访问契约冲突。不能不审查就覆盖 main。
3. PR6 工具版本相同仅表示来源的一个维度一致；评价者、样本、情境和量表测量等值性未得到正式证明，不生成可靠纵向量化发展报告。
4. 学生评教严格单次受控报告、多班级重复报告默认不开放；这不是自动完成的纵向评教分析。
5. 界面真实浏览器截图、B3 原稿实际渲染及无障碍、Host TLS/DNS/Nginx 和反向 School 心理数据隔离仍需要将来真实候选验收。

**执行约束**：继续使用唯一分支，不创建 PR，不触发 CI、不合并、不操作服务器或执行数据迁移。先冻结后续实际输入与最小门禁；发布需要额外授权。
