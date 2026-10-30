# 旧授权精确证据只读盘点

基于 `f4beaea17e2f86563fca56fce4dba44588cb701b`，新增可复现的 opt-in PostgreSQL 盘点测试；没有应用代码、迁移、路由或授权写入。与初始 `legacy-presence-inventory.json` 不同，本次不仅统计 marker：使用原解析器匹配 T1 的入口、接收者、发行者、学校、授权 ID/修订、原依据结构，再逐项对上原组合 C/P/R、measurement 及内容 hash。`HISTORY` 纯来源验证不要求当前源在线或 use 存活，不取 latest，也不以专业审查代替历史事实。

每次连接只允许显式列出的 localhost:55439 合成库，事务使用 REPEATABLE READ 并执行 `SET TRANSACTION READ ONLY`，`SHOW transaction_read_only=on` 必须通过。来源最多128、每类 grant128、审计512，超界停止而非按部分行判成功。比较前后 grant、审计、来源及 measurement 全行状态 hash；数据库 Date 仅在该状态比较序列化为 ISO，原配置身份 hash 算法不变。执行没有内容/权限回填或迁移。

| 独立保留库 | 实际结果 |
| --- | --- |
| precise_general_test_20261029 | Training：精确来源证据1、legacy1 |
| precise_training_named_configuration_test_20261029 | Training：精确来源证据4 |
| precise_survey_standard_use_test_20261029 | Survey：精确4、legacy1；克隆原有 School2、Teacher1精确 |
| precise_education_lifecycle_test_20261029 | School3、Teacher2精确 |

四次最终检查各1 PASS，全部原来源检查无问题，前后状态 hash 相等。按库列出，不能将克隆的重复历史相加为平台存量。精确项建议 `PRESERVE_EXISTING_BINDING`；无证据项只建议 `KEEP_LEGACY_NO_BACKFILL`，不取消旧合法行为。损坏或冲突记录会标 `EVIDENCE_REQUIRES_REVIEW / NO_AUTOMATIC_MIGRATION`，不会从新默认 R/profile 制造历史。

复现：先按仓库规则建立专用合成库、使用实际已生成历史的 fixture；为当前保留库设置现有隔离数据库环境及 `PRECISE_READONLY_INVENTORY=1`，运行 `npx vitest run src/__tests__/assessment-authorization/exact-authorization-inventory.postgres.integration.test.ts`，`PRECISE_READONLY_INVENTORY_EVIDENCE` 指向单独 JSON。一般库/远端库/未具名库均拒绝。这是只读 evidence inventory，不是通用生产迁移命令；空新库不冒充旧授权验收。

原始失败未覆盖：首轮误用不存在的 Prisma Survey model，general wrapper URL 名不同；修正实际 schema/环境后，第二轮在状态摘要遇到 Date 被 strict canonical 拒绝。两个问题均发生于只读检查，未修改运行时 canonical；修正状态摘要后四库分别通过。首轮类型也发现上述字段假设和 isolated closure 缺现有 Express augmentation，已按实际类型修正。最终直接闭包类型检查退出0。逐轮原报告与时间保存在 `exact-authorization-inventory-raw.json`。

边界：本次不验证当前 issuer/recipient 有效性、不复活权限、不签发新 artifact、不转换 legacy，不迁移任务/已发布快照/个人许可/历史报告。原来源由应用现有不可变表和可信已执行 fixture 提供，并非独立数据库外签名证明。没有向数据库插入 malformed 行；原严格身份解析器的负向证据沿用，盘点失败状态显式保留。生产盘点、runtime DB role、迁移正式接纳、认知历史及有界 CI 尚未执行。
