# 首条 native 产品旅程：登录课程 MOT

2026-10-26；本轮观察 HEAD `4b91b5acff3f9830722c65107e60f188be297909`。根 dot 扩大授权后实现真实业务消费者，首项由 ANT 改为 MOT，因 ANT 的真实物理 geometry 尚未冻结，未拿 CSS 图伪造物理校准。本步没有改任何测验协议／计分算法／时序、数据库 schema、权限配置、迁移、锁或 CI。

## 已开发与实际验证

- `prisma/seeds/native-cognitive.ts::seedNativeMotConfig(db)`：真实可调用的单项登记入口，轻接现有 `seedCognitiveConfigs`。只登记 **MOT 1.1.1/1.1.0、configVersion 1.0.0** 的一份 DRAFT base config（体验参数）；research/experience 用真实 profile patch 冻结，不复制两行同版本配置。不创建账户／权限，不自动发布；重复执行保留既有 PUBLISHED/RETIRED、publishedAt、accessPolicy。同 version 内容不同即拒绝，遇并发唯一冲突读回并核内容，绝不覆盖。其余三项未 seed／发布。
- `task-resource.ts`：score-free 元数据分流；native 始终持有真实 TaskDefinition，legacy 保留原 entry。没有把 native 装进 `RegistryEntry`、没有 fake score、没有 standard alias。`catalog.service.ts` 的真实 `/tests` 消费者现在可提供 native 双 profile 元数据；真实新施测路径本步只准入 MOT 登录课程，推荐标志本身不充当准入锁。
- `library/product-readiness.ts` 按定义实际声明的 profiles 核配置；旧 standard 要求仍由原 publication gate 对 legacy 强制，四项 native 使用原已实现的精确双 profile 规则。
- `freezeNativeAssignmentProfile` 冻结实际 native identity、protocolSignature、profile/config hash 及 v2 metric/quality/report 完整快照与版本。`readFrozenReport` 拒绝混合 tuple、版本或定义字节，不能偷偷找当前报告代替旧冻结报告；legacy 冻结历史仍保持原读取边界。
- `assignment.service.ts`／`assignment-measurement-release.ts` 保留课程归属、config PUBLISHED、材料实例化授权和 profile 检查；native 课程发布在同一事务内冻结 profile 并创建真实 measurement source release。没有因 getter 存在自动发布。共享 composite/library wrapper 复制未放开 native。
- `release.service.ts` 保留真实活跃 SYSTEM_ADMIN 发布权限、状态条件写及测量来源发布，只补 native configVersion／实际 delivery 支持检查。
- `session.service.ts` 保留成员资格、时间窗、quota、owner、participant、epoch 和既有 UNIFIED admission；实际 native START 不再要求 legacy RegistryEntry。native DTO 补真实 `sessionSnapshot`、`submissionId/submissionPayloadHash`，其余 `definitionHash/protocolSignature/profile/config/seed/attemptEpoch/sessionEpoch` 保持服务器冻结事实。`attemptEpoch` 是既有服务校验的 child `attemptNo`，`sessionEpoch` 来自已冻结 admission，不由前端自造。
- 未改主线独占的 controller/routes/FINAL 服务。使用既有 UNIFIED FINAL→原生 scorer→冻结 v2 report/result→DB core raw 的真实路径：`scoreEncrypted=null`，响应不出现 score。MOT 有可用完整结果正常生成描述报告；all-invalid 也能合法完成并隐藏表现指标；不存在用假 0 避开 legacy 阻碍。

**当前闭环范围**是已授权登录者本人、真实普通课程的 MOT；公开 token 创建／公开 START／native public 读取及 native composite/library delivery 明确不支持。原 Survey Go/No-Go literal/设备/反馈协议未动；高级 library catalog 的 legacy family/domain join、全局认知标签检索未完成，不称四项已全部入库。其余三个定义的 v2 resolver 与 metadata 存在不等于已可投放。原 trial/completion 服务已明确拒绝 UNIFIED 渐进写入／旧完成，故不改这些旧路径或造 legacy 分数。

## 新检查原件（云端、单 worker）

| 原件 | 实际结果 |
| --- | --- |
| `postgres-run1.json` | 真实隔离 PG：配置发布权限→双 profile/source freeze→成员 START/owner/public 拒绝一项 PASS；FINAL 一项失败。合成 fixture 把圆点中心记为 touch，末端可能重叠，真实 scorer 正确拒绝 `MOT response does not identify the rendered object`。评分／几何规则未改。失败 fixture 源 `postgres-run1-test-source.ts.txt` 与原 pre-run SHA **逐字节一致**，原失败仍保留。 |
| `postgres-run2-seed-and-final.json` | **2 PASS**、exit 0，4.67 s。根 dot 此时新增真实 seed 要求，使首项 fixture 来源改变，所以重验该实际登记链；第二项只修合法 keyboard fixture，实测正常及 all-invalid FINAL、raw 一份、无 score、epoch/hash/owner 拒绝、精确 replay 和变更 payload 拒绝。真实业务函数／Prisma／guard／scorer均不 mock。 |
| `resource-boundaries.json` | **4 PASS**、exit 0，2.05 s。seed RETIRED 保留／分歧拒绝（明确 mock DB 的负例）；native 无 score 方法及 legacy entry 原对象；混合冻结报告 tuple/定义字节拒绝；legacy standard 要求保留。不是旧 scorer 复测。 |
| `native-types.check.json` | 首轮类型失败保留：新增 fixture 的结果 union／literal 缩窄、configVersion 声明，以及手选 roots 漏真实 auth.ts 的 Express Request 增补。没有因此改生产权限。 |
| `native-types-run2.check.json` | 修正上述声明／缩窄并纳入真实 auth root后 **exit 0**，17.31 s；真实 backend tsconfig，14 个直接影响入口、noEmit，仅为 Prisma seed 扩 rootDir；检查前后源码 SHA 稳定。不是全应用构建。 |

后续类型修复只增加结果存在性缩窄／合法既有 configVersion 类型，不改变已通过业务输入的数值／分母；新增 public/composite scope 检查及 legacy 冻结历史读取保护没有重跑旧 scorer、seed goldens 或时序。证据各自保留实际输入身份，不把旧失败或旧成功改写成“最终全套 PASS”。

隔离 DB 为主线提供的 loopback `cognitive_native_test`／`cognitive_native_20261026`，显式 opt-in URL 并校验与 DATABASE_URL 相同、test 命名。只创建／清理自己 UUID 前缀的 users/course/assignments/session/config/release fixtures；未 truncate，共享 schema 中其他 agent fixture 未改。只 dotenv 文件读取被测试 harness 禁止，所有密钥为明确合成 fixture key，不读取 local.env／生产凭据。未执行整库 seed、默认管理员脚本、Prisma generate/db push、迁移、真实 COS、CI 或部署。当前锁定 Prisma client／隔离 DB 由主线预先提供，未新增权限或临时生产凭据。

## PR356 对齐与交接

`pr356-comparison.json` 记录最新 PR356 **a57b6c8d1a671209b55ae5558da0964c1d4eea6f**（Open/Draft，非合并）定向读取结果：10 个相关 cognitive 共享源及既有 cognitive seed，共 11 个改动前本地 HEAD blob 均与该头相同，无该处覆盖冲突。58c43e22 只保留早期观察，不当当前头。

当前 native schema/FINAL/report 已有真实 PG 业务证据；前端 MOT adapter、真实 HTTP/浏览器一体旅程、完整 raw COS 归档和读取由其他本轮消费者继续接线，不把本步业务函数检查冒充其已完成。`status.json` 记录精确源码与原件 hash／检查来源／未验证事项。本子 agent 未 commit/push／写 Notion；根 dot 负责独立审查与提交。
