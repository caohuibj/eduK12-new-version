# Training 精确组合管理与匿名链路：开发检查点

本检查点基于 main `2de32609e1888cf28b73cb26e2c0cf38b11ff875` 和共同契约提交 `8ebeed92424c0fc9eefe41620e34d75074fdbe69`。这是任务 1 的一段可审查实现，**不是量表四入口或 PR2 验收完成声明**。未访问生产，未向真实用户授权，未修改 Bundle 引擎。

## 已接入

- Training「资源与授权」增加「固定量表配置」。管理员读取批准组合的标题、C/P/R 版本和可分配状态，经已有精确授权 API 分配；旧 resourceId 授权界面保留。
- 目录只投影必要标题/版本，不逐卡解密或编译；新增两个读取接口仍检查当前 Training 独立入口管理身份，系统管理员、其他入口管理员和普通教师不能借此分配。授权写入继续复用原有 issuer、接收者、精确 hash、requestId 和版本并发校验。
- 针对当前接收者回读授权；过时异步响应、身份/hash 不匹配、部分名单和未知写入结果阻止继续写入。原发行者可回读和撤销已退出目录的配置，其他管理员不能接管。
- GENERAL 公开问卷复用已有精确 C/P/R 来源及 T2/T3 冻结逻辑，允许没有课程的合法容器。携带课程身份的 GENERAL、旧容器和未知类型仍拒绝。COURSE 的原有管理范围校验保留。

## 实际验证

在独立 localhost PostgreSQL/Redis 中，经正常安装、发布、真实三例审批试运行和授权，验证现有合法来源 `academic_self_concept_biology_zh_cn@1.0.0`。没有用 SQL 伪造 ONLINE，也没有把审批 trial 当成被试全过程。

- 管理 API：7 个真实 PostgreSQL/HTTP 案例通过，覆盖独立入口身份、精确授权回读、requestId 冲突、任意 hash、跨入口、自我授予的双资格、原发行者边界及退出后撤销。
- 匿名 GENERAL：1 个真实全过程案例、27 个 HTTP 请求通过，包含草稿来源固定、发布不变、公开链接、匿名 START、背景表单 FINAL、量表 FINAL 幂等、恢复、普通撤权、历史回读及其他教师越权。
- 该匿名案例中，普通撤权后：旧草稿发布/已发布问卷新 START 均拒绝；已经入场的作答可恢复和完成；历史报告仍按既有数据 ACL 读取。冻结来源和 admission 内容 hash 前后一致。
- 原生冻结报告内部为 READY；教师输出为 UNAVAILABLE，是原有个体解释披露策略的结果。没有为验收放宽教师报告权限。
- 来源单测 81 项、新管理 UI 组件 6 项、父管理界面回归 13 项通过。问卷消费者初次回归 84 项中 83 项通过，1 项是原先断言 GENERAL 禁用精确组合的旧行为；现按新需求更新该断言并单独重跑，其他 83 项不机械复跑。最新执行结果及输入/报告 hash 见配套 verification 文件。
- 前端应用类型检查、改动文件 lint 和后端实际依赖闭包类型检查分别留证。早期后端检查发现两处测试 fixture 的可空返回类型，使用仅编译期断言修正；运行代码未变，原 HTTP 结果保留并明确其测试源字节。

可复现执行入口（先在空的专用本地库应用正式迁移；运行前设置正常测试密钥、JWT、Origin 和本地 Redis，勿在聊天或 Git 中保存凭据）：

```sh
PRECISE_CONFIGURATION_ISOLATED=1 PRECISE_CONFIGURATION_TEST_DATABASE_URL="$DATABASE_URL" npx vitest run src/__tests__/assessment-authorization/training-configuration-management.postgres.integration.test.ts --maxWorkers=1
PRECISE_GENERAL_JOURNEY=1 PRECISE_GENERAL_TEST_DATABASE_URL="$DATABASE_URL" npx vitest run src/__tests__/assessment-authorization/training-general-exact-journey.postgres.integration.test.ts --maxWorkers=1
```

两个 fixture 各用一个空库，分别限定 `127.0.0.1:55439/precise_authorization_test_20261029` 和 `127.0.0.1:55439/precise_general_test_20261029`；Redis 为 `127.0.0.1:56389/0`。失败或成功后的库均保留，不 reset、不改旧状态重跑。它们不是面向生产的装载脚本，也不是浏览器验收。

## 继续事项与边界

1. 接收者业务配置命名、默认配置/多授权歧义处理、统一 selectedBinding 消费、管理员手动 C/P/R 组合、完整机械兼容提示仍需收口。目前新增界面分配的是已有系统批准组合，不能把这项等同于任意合法 C/P/R 搭配已实现。
2. Survey、School、Teacher 的本轮新增 UI/授权闭环尚未实现。School/Teacher 必须补精确入口批准与正式 manager + 精确分发委托，不能硬写 use grant 绕过系统批准。既有 custom-library、个人量表、自评和被试权限分别保留。
3. 认知已在单独素材库装入 11 个受控 DRAFT 候选，并验证 22 份 experience/research 冻结回读；本分支没有把候选运行时合入 main，也没有完成认知四入口授权。
4. DOT 三份量表的六份报告原件尚无可取得的远端提交。此前被拒的 seed/注册写入不由本任务间接代做；没有声称这些原件已经装载。
5. 尚未执行真实浏览器端到端、四入口完整回归、同环境性能基线/对照或正式 CI。现有平台 Draft 路由会启动两个平台轻量作业，Ready 路由会退回全平台；必须先准备正确、有界且 fail-closed 的适用路由，再开 Draft PR。不得用 skip 或改保护绕过门禁。
