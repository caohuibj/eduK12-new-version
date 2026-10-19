# C12 在线 SJT：实现检查点

2026-10-18，基于 `8f4a5288dbe17387d4dad96e1cdf854412c4e009`，仅当前助手云节点，独立工作树；无生产、Mac、PR 或 CI 操作。

## 冻结范围

- 提取无产品关系的 SJT 定义、验证、受控多选、编译、归一化核心。Survey 保留原兼容入口与产品 compiler profile；真实基线 7 模块独立执行的 V1/V2 完整序列化输出、definitionHash/contentDigest 逐字一致，合成 fixture 记录 base、各原 Git blob 和 SHA-256。
- 新 `sjt-online-v1` 文档复用原作者所有权、CAS、摘要、审计、独立管理员审核与不可变 release。原 `sjt-upload-v1` 不转换，显式分派。人工 golden 必须手填全部期望值（含 null），覆盖合法派生组合和允许的缺失/拒答；预览不回填 oracle。
- 新发布包与 attempt 冻结保护的 display、compiler、responseProtocol、definitionHash/displayHash；公共投影不含贡献矩阵。文本优先，图片与完整许可模型留 C13。
- 新 FINAL 只由服务端冻结协议授权，真实选项数组/明确状态先验证再映射共同 scorer；raw-v2 保存原始数组顺序、状态与计时，不造占位。旧 FINAL/raw-v1 的 min-one 和历史 unsigned/hash 不变。
- 任务资格与评分独立：至少一个实质回答且全部原 display.required 问题有实质回答才满足。全空和 required 合法拒答可提交但不满足；optional 缺失可使指标 null，不能因此把选填暗中变必答。仅新 online canonical 标记参与父任务投影。
- 前端抽取无图片受控编辑器，Survey wrapper 保留既有图片；正式作者工作台在线编制/修订/审核，runner 显示真实多选而非派生组合。
- 无数据库迁移：既有作者 Json、冻结 Json 和 raw 协议版本列可承载新格式；严格 schema 已显式扩展而非全局放宽。

## 本检查点验证

- 官方 registry 独立 backend/frontend npm ci；fresh Prisma 5.22.0；Node 24.21.0。
- 当前节点独占 measurement.lock，原 backend 全部 build 前置通过，修复类型边界后 TypeScript 编译通过。
- backend 8 文件 73 项定向测试通过：online compiler/golden、raw/freeze/FINAL持久化与重放、旧上传、release、旧snapshot、Survey V1/V2多选契约。
- frontend 应用 TypeScript 与 29 项已有/新增定向测试通过；新增实际 runner checkbox→原始数组封存 FINAL 测试通过。后续小型公开 respondent/顺序投影检查单列。
- 新真实 PG/HTTP harness 已编写，尚未执行。检查点不是 C12 完整验收，也不是 CI 成功。

保留的失败：首两次 backend tsc 分别发现 Zod input/output 泛型和通道 required 类型误用，已针对修复；前端新增测试首轮误判既有按钮 disabled，改为验证 handler 拒发并提示，未放宽业务保护；基线脚本 tsx CLI 遭 IPC EPERM，改用已支持的 node --import tsx，同权限未绕过。

## 下一接续

真实受限 PG/HTTP：在线 create/CAS/review/不可变发布→课程→恢复→真多选 FINAL/replay→公共报告→原 CSV/ZIP/download 权限；新空/拒答/部分有效的 null 与任务资格；required 缺失、旧空/客户端协议升级拒绝。绑定实际源码、dist、配置及工具摘要，保留失败和清理证明。浏览器 C25、CPU/RSS/数据库性能 C26；不以共享代码宣称性能收益。

## 独立审查后的定点修复

- 科学审查发现 partial/all-null golden 可伪满足选项覆盖。已改为每个实质选项/合法派生组合必须在所有问题完整实质回答、全部人工期望为有限数字的样例中覆盖；缺失/拒答独立覆盖，不要求题间笛卡尔积。两模型均有“全 null 覆盖”及“仅一个完整样例仍不足”的拒绝测试。
- 新 raw-v2 研究重构严格匹配 frozen online 协议，按原始选择归一化一次并复核完整派生响应（含 RT）；拒答/无法判断保留精确 missingness。原研究权限与 embedded 禁止不变。
- 父任务只纳入 required 冻结 SJT 槽位的资格；optional 工具不阻断其他 required 工具。题内 optional 缺失与工具槽位 optional 分别处理。
- inbox 原历史 SJT 保持纯 scalar 列表，只有新 online 已完成 ID 进行一次 owner-bound canonical batch；旧协议不取/解密 blob。定向测试证明 query/decrypt 调用边界，不作为真实字节或性能收益。
- 在线新建路由仅检查协议选择，作者 service 编译一次；精确 release 的定义/golden 校验后，在 freeze 一次完整核验 online 源，未来 persisted snapshot 解析仍完整校验。无跨请求授权缓存。
- 修复后 backend TypeScript 与 7 文件 54 项受影响测试通过；额外旧 FINAL/研究导出/Form任务投影等 5 文件 34 项已通过。先前相同输入成功项不重复全跑。
- 首真实 PG/HTTP 已过 online 创建/CAS/digest/独立发布/不可变、权限负例、成员恢复、真实多选 FINAL/replay、原始数组/RT协议保存及公共报告的手算 9。随后 harness 错从精简 canonical 读取 coverage 而失败；已改从保存的完整评分结果断言独立情境=2，分数=9断言仍保留。该次 failed 原样保存，cleanupVerified=true；未把未执行导出/空 FINAL 计为通过。

## 限定实际验收（2026-10-18 10:51 UTC）

固定源码 `564f2f60a391aa1bb4d631e0d9c3c7e7a0de5b9f`，tree `aea6f5901677651449fe435294aa65ea881804f3`。协议/效率与科学独立源码复审均给予限定 GO；动态证据见 `c12-evidence/index.json`。

- 第二轮真实 PostgreSQL/Redis、受限 runtime 角色、生产 dist，health/ready 200；126 次 HTTP、12 组全部通过。
- 在线作者 create/CAS/revision/digest、空错 golden 拒绝、自审与非owner拒绝、另一管理员审核、发布后不可改；资源与课程编制沿原 C11 链。
- 学员课程开始/恢复、两情境三题真多选 SUM+MEAN、原始 `['b','a']` 顺序与明确状态保存 raw-v2、FINAL/replay 一次 raw/一次 canonical；完整结果手算 9 与两个独立情境通过。
- 原公共/教师报告、原 export queue CSV 和 ZIP，逐值核对 canonical metric/null/hash/版本，默认无 raw/贡献列；非owner读取/FINAL/报告/下载均拒绝。
- 新全选填空、合法拒答均 null 且持久 parent NOT_SATISFIED；只有部分实质作答、optional 缺失时 null 但 parent SATISFIED。required 缺失拒绝，旧空 FINAL 与客户端注入新协议拒绝且无 raw 写入。
- 新 standalone 空 FINAL 的 inbox 投影为 SUBMITTED_NOT_SATISFIED。单条新增资格读取实测 canonical 密文 3050 字节、解密后 JSON 1464 字节、HTTP inbox 7170 字节；这些仅为诊断，C26 再测 CPU/RSS/DB 扩展。旧协议 metadata-only 与新协议一次 batch 边界另有定向 mock 查询/解密断言。
- 最终 dist 5033 文件，组合 SHA-256 `cb245fa67e346bfe470739771f0f566934b56b0bb349fbea7eeb5b6df9a8bf89`；Node v24.21.0、fresh Prisma、schema、锁文件及 harness 摘要绑定于证据。两轮自身服务 cleanupVerified=true，cleanupErrors=[]。
- 前端最终冻结 respondentType 和跨情境题序修正通过应用 TypeScript 与 online 6 项测试；此前 29 项和实际 runner 集成通过，次数不作无去重求和。

保留首 HTTP failed 和所有类型/组件失败日志，不改写为成功。没有运行真实浏览器、正式 CI、生产部署或完整性能验证；C13/C25/C26 仍待后续。

基线临时执行器的 stdout 未单独落盘：仅保留工具退出结果与固定原源码 blob/完整输出 fixture；不补造执行历史。基线固定输出随后被正式定向测试消费并通过。
