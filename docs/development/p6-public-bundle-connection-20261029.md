# P6 公共原生 Bundle 接线

本批把已授权公共原生 Bundle 的目录、精确来源及只读预览接到 School/Teacher 现有资源登记和任务链。
沿 PR388 的实例、发布、START、FINAL 与已存报告运行，不新增引擎、审批流程、权限缓存或数据表。
初始 main 为 `bac276fa5`；收尾 main `dc0f46ba5` 仅增加四行 CI main 观察 fetch，不改变应用输入。

## 能力与边界

- School 仍要求本校心理教师；Teacher 仍要求本校产品管理员。系统管理员发行精确 U；参与者没有工具库作者权。
- U 固定完整包的物理 release ID/content hash、原 grant ID/version，不能以新 grant 修复旧撤权。
- 目录元数据不授予分发权。选择已发布原始完整来源，沿原有 source/C/P/R/素材分发许可登记。
- 原包成员、顺序、参数、已有单项报告和综合报告不变。原来没有选择单项报告时，可以另选本入口已授权的精确 R；不替换原包综合报告。
- 新登记、发布、新使用/START 检查当前权限；已入场继续和历史反馈沿冻结结果。START 底层已有签名准入，新接线不重复加载/编译版本。
- 复用 PR388 的 Profile 报告；对 schema1 原生声明式包，只投影已存、受众允许的结论/限制文字，不发原始 engine payload 或 Context 答案。
- EVC candidate B 的模型、参数、7–12 年级/student SELF 未改变，Teacher 成人入口继续拒绝 youth 包。本批 Teacher 使用明确合成的描述性工程夹具，不是已验证成人工具。
- GOVERNED_PACKAGE 保留只读预览，不宣称已完成其教育执行适配；未创建复杂包编辑器或任意混编能力。

清理了旧 P6 重复的 `instantiate.ts` 及其专属测试；现有 Training/School 实例化和年级 Context 保留 main 实现。

## 给授权入口对话的现有接口

`GET /api/admin/permissions/education-package-sources?entry=SCHOOL|TEACHER&q=...&cursor=...`
使用原强管理登录/MFA边界，返回已发布原生包的 `sourceRef`、`catalogKey`、版本及适用性提示；无参与者数据。
原 `POST /api/admin/permissions/content-grants` 继续签发 root `material.use`：subject 为实际接收作者，scope 为该入口/本组织，resourceKeys 为目录返回的完整 `catalogKey`，不可转委托。
`admin-authority.service.ts` 只扩展 package key/批量 header 辨认，保留原组织、接收者当前作者、MFA及撤销检查；没有改 C/P/R 权限语义。

产品端仍走原 private-tools `/package-sources` 和 `/preview`。
原登记 `/source-candidates` 可带 URL 编码 JSON `publicPackage=sourceRef`；`/preparations` 新增可选 `publicPackage:sourceRef`。
服务器冻结包 U 与来源，不接收客户端参与身份。其余登记/审核/发布、任务资源选择、START 和报告 URL 不变。
包入口复用现有登记组件；固定原 P/R 选择，补选 R 仍受原服务验证。

## 唯一验证位置与证据

本轮 Node24.21.0；TypeScript/Vitest/Prisma 实际版本与锁文件相符。原始命令、stdout、退出码、reporter、输入哈希保存在独立云端 `/workspace/p6-public-bundle-evidence`。
这些是本地原件，不冒充正式 CI 或历史已签名证明。

| 要证明什么 | 实际结果/主要执行位 | 使证据失效的变化 |
|---|---|---|
| 精确包协议、U、来源和不可编辑边界 | `package-contracts` 20 个唯一合同用例通过；access 收窄后仅复验其中受影响的两例 | 包协议、grant/来源或所消费的 helper |
| 目录→原登记、原参数 priority/R、保存时不丢状态 | 新 UI 接线用例修夹具后通过；两个报告投影用例通过，共 3 个唯一用例 | 相关客户端、组件或接口形状 |
| 系统授权→正确作者目录可见→精确引用→原登记/发布→真实 START，两个入口分别验证 | `package-postgres-r3` 两用例均实际到达撤 U、新 START 拒绝和旧 START 恢复；整条调用最终因后续夹具参数错误 FAIL，不能记完整 PASS | 组织、来源、U、发布或 START 输入 |
| 撤 U 后完成、单项/综合反馈、非本人无报告 | 保留上述已 START 的两个真实记录；`package-postgres-completion-r2` 一例内分别完成 School/Teacher，PASS；已完成的 School 不重新交卷 | FINAL、当前读者或报告投影；不重算原模型 |
| 类型与 CommonJS 初始化 | 前后端原生产 tsc 预检退出0；最终变化闭包中仅旧测试 fixture 有类型诊断，修后只复验该闭包通过；三个真实 router 的 CommonJS 冷加载通过 | 对应实际模块/配置/依赖或模块格式 |
| PR388 的 Profile/计分/恢复 | 复用已合并证据和未改实现，不重跑原模型、整套 PG/浏览器矩阵 | 实际科学内容、计分、Profile、冻结/恢复输入变化 |
| 正式资格 | **未运行**，本批 Draft 不激活重型 CI | 由最终精确候选及适用路线决定 |

原失败全部保留，不累计重跑次数作为覆盖量。新旧记录分别标出 FAIL、过滤及未运行。

## 本次错误与下一次最小 CI

我写的夹具先后误用了登记编号、活动开放顺序、撤权 JSON 的 requestId、getAttemptState 的身份参数，以及把服务端 null 拒绝当成异常。
这些不是产品漏洞。已按实际公开函数/请求 schema 修正；剩余完成旅程复用已 START 记录，不再重建前置数据。
独立类型工具初版缺少前端 matcher 和后端 Express 全局 augmentation；原错误保留，补入真实全局声明后通过。
旧 fixture 的 ES2020 replaceAll 和 targetPolicy 字面量类型以等价字符串替换/类型标注修正，不改变业务断言。
后续夹具先核完整函数签名、schema及测试源码类型，再执行数据库旅程，避免把测试工具错误混成产品错误。
按交接限制，本次未向 Notion 写原件或重试此前拒绝；这里只保留可脱敏回写的条目。

最终候选先由 DOT 读 diff/原件，沿仓库现有受影响执行器冻结范围；PR388 固定 marker/旧 green 不可直接作为新 P6 资格。
所需新资格仅为变化的前后端各一次构建、相关 SAST/依赖与稳定 gate；浏览器只补公共目录到登记/已发布资源的代表接线，不重复 Profile/评分或四入口矩阵。
本地新增合同/PG证据仅在既有正式接纳机制明确审阅支持后复用，不声称当前已自动接纳。
预计正式缺项约10–20分钟，排队/下载另计；超过5分钟指出具体等待项，不扩成全平台。
未部署、未激活生产工具、未修改保护或执行 GitHub APPROVE。
