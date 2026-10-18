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
