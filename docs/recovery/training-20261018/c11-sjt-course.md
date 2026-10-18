# C11 SJT 课程链：实现检查点

2026-10-18，基于 `a5be4c6fa40ba15d945f20dd4588666b3c0885e5`，仅当前助手云节点开发；不操作 Mac、生产、PR 或 CI。

## 冻结范围

- 正式上传 release 与内置题包共用异步精确版本解析。单次操作批量去重，发布/复制/编制校验不读取整个上传目录；原父子事务在首次准入时锁定上传 release，retire 串行且失败回滚全部父子事实。
- 已存在 embedded attempt 先读取其原冻结事实，不以当前目录状态重新决定恢复或计分。当前 releaseStatus 仅元数据投影。课程、成员、次数、截止、principal 与 epoch 原检查保留。
- 资源列表仅投影公开摘要，不加载完整包/答案键。教师自评题包不得编入学员课程；合法学生型上传保留 PILOT 科学上下文与原评分。
- 原公共导出批量读取 accepted canonical snapshot，只追加 SJT 指标、quality、version/hash/null 摘要及其指纹。无 SJT raw/模板读取、不新增评分器/runtime/worker；独立研究导出 embedded 拒绝和 grants 不变。
- 无迁移。C12 多情境/受控多选新协议、C13 完整许可/图片未实现。

## 本检查点真实状态

- 独立 backend npm ci（原锁文件、官方 registry、缓存离线命中）成功；fresh Prisma Client 5.22.0。
- Node 24.21.0 下，measurement.lock 独占运行全部原 build 前置（bundle manifest/onboarding、situational manifest/onboarding、scale instruments/onboarding/qualification）与 TypeScript 编译成功。
- 针对性单测、真实 PostgreSQL/HTTP 全链、retire 竞争正在准备，尚未声称通过。
- 新 HTTP harness 尚未冻结；历史 authoring / situational-bundle 资产仅复用源码，不冒称本候选已验收。
- 浏览器留 C25；当前已知 Chromium EPERM 不重试绕过。性能留 C26，此处仅查询/存储诊断，不声称收益。

## 接续检查

主要执行位置为当前云节点，重型检查串行：精确解析/上传/原SJT/bundle/导出/受影响课程单测；真实教师上传学生型→另一管理员审核→课程发布→成员开始/恢复→FINAL/replay→parent/公共报告→原队列 CSV/ZIP；自审/跨课/非会员/非owner/错respondent；retire 首准入竞争无残留；旧builtin匿名与受影响 C09/C10 混合短链。保留失败原日志并绑定最终源码、dist、配置和工具，不把备份当CI成功。

## 审查修复检查点

- 独立审查指出导出缺失 required snapshot 不能默默当 null，以及必须绑定父冻结 slot。已修为批量加载去重共享冻结 plan，复核 parent epoch/hash、精确 instrument/version/definition/runtime/scorer；缺 required、required skip 和外来槽位失败关闭。合法缺失以 terminal_state 单独区分；摘要协议 v2。
- 预检保留本次操作的精确版本 success/error Map；资源、内容和逐项错误定位共享一次上传读取/验证，不失败后逐项重取完整包。
- 修复后 TypeScript 编译成功。精确release/原SJT准入/bundle/canonical导出/投影/原export以及copy定向测试已实际通过；authoring与typed-export原成功输入未改变。
- 保留测试执行失败：Vitest 4不支持旧minWorkers参数；旧认知测试设置ON晚于ESM加载，执行时显式ON；旧copy选择断言补上C10已有轻量admission投影；新测试两处fixture分别修正合法artifact UUID和创建slot时不能传既存snapshotHash。没有放宽业务断言或功能保护。
- 新增 `c11-sjt-http.py` / `c11-sjt-smoke.mjs`，合成真实HTTP验收尚待执行。脚本绑定dist及输入摘要，使用受限runtime角色，退出清理本次服务；无真实用户数据。

## 真实HTTP发现后的管理详情修复

首次HTTP仅因合成脚本把ADMIN送入Training登录入口而401，已改为正式 `/auth/login`，不改认证权限。第二次HTTP通过正式上传/独立审核及自审、非owner、teacher包拒绝，随后真实详情读取暴露 `mapItemForTeacher` 仍依赖builtin科学目录而500。

已修为按本次列表/详情全部精确release一次SQL scalar投影：校验identity、release/package状态、definitionHash格式及官方上传固定AUTHOR_KEY_SUM/scorer元数据；只投PILOT，不加载完整模板、不编译，不将元数据显示当作运行资格。已停用release仍可管理查看；首次准入继续完整校验。

此修复TypeScript编译与12项release测试通过；受影响copy/addItem此前同一映射更改69项通过，随后追加scalar完整性guard仅消费release查询。两次HTTP失败原记录保存且均cleanupVerified=true；不得冒称完整链通过。新增独立混合HTTP脚本覆盖Form→C09 Scale timing→上传SJT，可分phase执行，避免对同输入已通过流程重复。

## C11 限定实际验收（2026-10-18 10:32 UTC）

固定源码 `bcd11eab619d2047d5055197b7393ccf75296c72`，tree `deb812973774305178a341c02113cfa434a95a13`。独立源码审查已对管理metadata增量给限定GO；动态最终复核另记录。脱敏原始结果及失败记录见 `c11-evidence/index.json`，不属于CI证明。

- 当前候选真实 PostgreSQL/Redis、受限非owner运行角色、生产dist，health/ready均200；175次真实HTTP，SJT 119次/10组，混合56次/3组。
- 正式上传学生型→另一admin审核→课程发布→成员开始/恢复→FINAL/相同重放→父/教师报告→原导出队列CSV和ZIP逐值canonical摘要成功。自审、错respondent、非会员、跨课、非owner读取/FINAL/下载均拒绝；拒绝无父子/报告job新增。
- 上传学生型匿名FINAL/replay/公共报告成功；既有builtin匿名开始/恢复/FINAL/replay/公共报告和无recovery拒绝成功。
- 真实retire竞争观察到API在release `FOR SHARE`等待；退役事务提交后首次准入拒绝。前后全库计数均parent=3、SJT child=3、report job=2，无残留。已准入冻结attempt仍可完成，已完成报告/hash保持不变；正式HTTP retire另有成功验证。
- 成员和匿名各一条 Form→Scale可选计时→上传SJT 混合链成功，每单元FINAL/replay、冻结Training课程、精确200ms计时、3个已完成snapshot和原报告均核验。原CSV保留Scale/SJT canonical值，默认无计时披露列，C09能力未扩张。
- 两份上传路径均核对既有示范all-A的E=3，不改变评分。导出保留null/zero、quality、version/hash，required缺失和冻结身份错配有定向失败关闭测试。
- 最终dist 4997文件，组合SHA-256 `b14abad692be664b89367edb0ca700074560aa853c269d406391aedaef3b6375`；Node v24.21.0/fresh Prisma/schema/锁文件及全部harness输入摘要见证据。服务清理verified=true，无cleanup错误。
- 原始失败记录保留：两次HTTP失败、CLI/环境/测试fixture失败均未改写为通过。后续只复验受影响检查，成功且输入不变项目不重新全跑。

仍不声称真实浏览器、生产部署、正式CI或性能收益。C12、C13、C25、C26留原后续范围。
