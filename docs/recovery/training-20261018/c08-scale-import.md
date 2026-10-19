# C08 · Training Scale CSV 导入

## 范围与执行清单

- 基线：`d3775439861f43f321b24e839590632d25eed687`，独立 `recovery/training-c08-scale-import-20261018` 分支。
- 修改：公共纯 Scale 导入 parser、既有 Scale 路由新增 preview/confirm、ScaleEdit 题目页、定向测试及隔离 HTTP harness。无数据库 schema/迁移、无评分或运行时分叉，不改 C07 导出/报告。
- 故障 → 检查：非法/重复键、CSV 引号/边界、响应集/分数漂移 → parser 固定人工断言与原 Form golden；预检伪造、版本竞态、越权和部分写入 → 真 PG/HTTP；前端丢输入/重复确认 → 组件测试；接口类型/产物遗漏 → 仅后端 tsc 与前端类型/构建。
- 主要执行位置：当前隔离云节点。重型步骤通过 TOOLS/.measurement.lock 串行；不 push、不创建 PR、不触发 CI、不碰生产或旧 C02 进程。
- 输入未变的既有科学 scorer、公共 Form oracle 直接消费；不重生成旧 golden。20–30 分钟源码 checkpoint 目标已提前完成，首 checkpoint `e2779ef2` 后已修可信预检凭据。

## 编制合同

这是向已保存的合法自定义描述性量表追加题目，不是标准量表导入或科学定义自动推断。须先在编辑器保存至少一题、一套共享 responseSet 及现有计分项。导入不能创建第二套响应选项、改写原题、原分值、license、source、report 或 scorer；CSV 只能显式选择已有计分项并指定 identity/reverse。导入后使用原发布检查和发布入口，发布定义继续不可变。

CSV 的五列全部必需，大小写精确，可调整列顺序：

`item_code,prompt,reverse,score_keys,response_set_key`

示例：

```csv
item_code,prompt,reverse,score_keys,response_set_key
Q2,"可以含逗号、换行及双引号的题干",true,total|dimension,default
```

- `item_code`/计分项/响应集稳定键：英文字母开头，后续字母、数字、下划线或短横线，最多 64 字符。重复题键（包含已有题）、重复计分项引用、未知列、未知计分项拒绝。
- `reverse` 仅接受明确的 `true`/`false`；`score_keys` 用 `|` 列出已有直接按题目计分的指标；不猜测总分或维度归属。
- `response_set_key` 必须等于现有唯一共享响应集；CSV 不能提供新分值或每题选项。
- 原始 UTF-8 输入最多 200000 字节；导入后最多 200 题；题干 1–16000 字符，共享选项最多 100 项、标签最多 2000 字符。科学合法性仍由已有 `validateScaleDefinition(CUSTOM_DESCRIPTIVE)` 判定。
- 复用公共 Form 的纯 `parseCsvRows` tokenizer，仅增加 export，不改变旧算法；Scale 独立严格引号/表头/列数校验，支持 BOM、带引号逗号/换行/双引号。

## 确认与治理

- `/scales/:id/import/preview`：显式 `expectedUpdatedAt`，当下 owner/admin、CUSTOM_DESCRIPTIVE、DRAFT 和复制来源许可检查；返回题目/score/共享选项摘要，不写数据库。
- `digest` 是公开 checksum：协议、资源、actor、revision、原始 CSV SHA-256、完整基准定义 canonicalHash、结果定义 canonicalHash。原 CSV 的空白或末尾换行变化也必须重新预检。
- `previewToken` 是另行服务器签发的 HMAC-SHA256 短期预检凭据，以现有 `config.assetSigningSecret` 做用途隔离，绑定 checksum 与 `previewExpiresAt`，有效期 10 分钟；不建立新密钥或 nonce 表。
- `/confirm` 验签与有效期，再在事务中行锁重新读取并复验 owner/source/status/revision/科学定义/checksum，写前复查有效期。客户端自行重算 checksum、跨 actor、换原 CSV、换基准定义及过期凭据均不能保存。
- 只在同一事务写定义与 `AssessmentManagementEvent(action=SCALE_IMPORT)`。审计仅存原内容 hash/字节数、count、前后 revision、digest、结果 definitionHash；无 CSV、题干或预检 token。
- 新 `updatedAt = max(now, old+1ms)`，因此同毫秒确认也递增。重复确认/并发 loser 返回 409，不重复追加；审计插入失败回滚定义。P2025/P2034 映射为冲突。
- 使用授权不变成改编权；标准量表及已发布版本拒导入。复制草稿沿用 exact source/license gate 和 media 同事务保留逻辑。
- UI 只在已保存输入上预检，展示共享选项分值、题目反向设置和明确计分项，确认才保存。错误保留 CSV、清除旧预检，状态可访问且无自动重试；pending ref 防双击，导入期间禁止另存/发布/切换分区。

## 当前验真记录

候选 `1d9ef730244b8bdbb3a2498d5b5a1165c89c94b9`，tree `ce5e5dd5b00a97110acb2b4b1bece69f9da39539`：本单元定向验真完成。后续仅本文档及证据文件，不改变已验业务输入。静态复核绑定业务源码 `5fd00716448b951d4639d5b64bf4e71379159268`；后续两提交仅增强 HTTP 负向测试。

- parser + 原 Form oracle：74/74 通过（含原固定47-case corpus，旧golden未变）。
- 前端 ScaleEdit/CSV 组件初验：54/54 通过；签名凭据与 busy/publish 修复后仅受影响29项再次通过，其余输入未变的证据保留。
- 前后端类型通过；后端 tsc 与 frontend Vite 构建成功。Vite 原有大chunk提示仍在，不把它写成失败或性能优化。
- 真实 fresh PG16.15/Redis7.4.11、Node24.21.0、fresh Prisma、非owner runtime角色、生产dist：6/6 PG测试通过，29个HTTP请求通过。覆盖合法追加/审计、原内容更改、伪造签名、跨actor、过期、同timestamp换基准、并发确认只接受一次、STANDARD/发布拒变更、复制来源撤销、审计FK故障完整回滚。HTTP完成创建→保存初始定义→预检→确认→validate→正式scorer预览→publish，越权use-grant/student/anonymous均拒。
- 人工独立评分oracle：共享1–5分，Q1=5、Q2 reverse(1)=5，总分10；使用原`buildScaleResultForRecord`/`scale-scoring`，没有第二套评分。
- `c08-scale-import-evidence.json` 为成功隔离运行原始结果复制。原结果 SHA-256：`f73743b828aa27a6caa95e045735777eb047ddd30d0e6bae1a509479e3fc6012`。dist清单 SHA-256：`85af4128d4e8e0b8c9c1a9546c5587dabc0cd65076d8b1d8c69fb008ad424981`；API启动与消费者前后指纹完全一致，`cleanupVerified=true`。
- 定向测试日志 SHA-256：`a8bd60082a03b0b80853c3e4280425c73979a79c4d79321f39d6333c6d21c180`；最终受影响签名版构建/测试日志：`082fb62965690f94ae959a2406afd83d6d2d12cb62e712b7a2ae7f6f21aa5143`。
- 单次观测：96字节源CSV；定义JSON 1459→1686字节（+227）；新增审计metadata 382字节，无原CSV持久化。原生草稿服务预检4个SQL事件、确认6个（含BEGIN/COMMIT，不含HTTP鉴权及fixture），无按题DB查询；复制来源检查会增加固定查询。并非C26并发性能结论。

- 最初公开 checksum 不能证明服务器预检这一合同缺口已修为独立签名凭据；该缺口没有绕过既有 owner/CAS/科学定义检查。
- 原 Form 47-case 固定 golden 未变化；新增精确依赖 allowlist 只允许 `assessment-core/scale/import-parser.ts` 引用公共 tokenizer 和既有科学 Scale definition，不允许数据库/HTTP/Survey service。
- 首轮真 PG 的来源撤销期望误写 403，已有 `ScaleCopyError` 正确合同为 409；仅修测试断言。失败结果与清理状态保留在隔离 state 01。
- Chromium 环境已知 blocked，本阶段不重试，不称浏览器验收通过；C25 正式交互验收另行统一。
- C26 CPU/RSS/数据库并发尚未执行。这里只记录本次导入的源大小、定义与审计新增字节、直接服务 SQL 事件数；共享代码不是性能收益证明。

## 可独立恢复的原始日志归档

`c08-scale-import-logs.tar.gz`（11062 字节）保存13份明确白名单原始日志/非秘密status，共34217字节原内容；含首次 parser/fixture失败、首次PG 409断言失败，以及修复后契约/组件、静默类型检查与构建串行命令链、PG 6项、HTTP、lint成功输出。没有重跑任何测试；原字节保留，包括ANSI颜色和失败信息。

- 归档 SHA-256：`b9a34dfdc34c27124953f60dcf31cf7a169b778a2c020e8a7237736748993e65`。
- 外部 `c08-scale-import-logs-manifest.json` 与包内 `manifest.json` 字节一致；逐项列出归档路径、原路径根与相对名、长度和SHA-256。manifest SHA-256：`2f6394210142391558f58fe317b0e3294a404a9a5e418fd8e35819e3b8ea3dd9`。
- 已读回归档逐项校验名称/长度/字节，无绝对成员路径、目录穿越或链接。
- 现有 `c08-scale-import-evidence.json` 仍是成功 state02 的原始 `c08-runtime-result.json`；不在包中重复。归档补足它关联的完整日志、两个运行的非秘密status与state01失败结果，而非用摘要替代原始输出。
- 不含数据库、私钥、环境配置、runtime-private、fixture凭据、原CSV、pg-password或API/worker应用日志。白名单内容按凭据标识、带认证URL、私钥标记、密码字段与原CSV表头检查后封装；没有修改原文或通过涂抹隐藏失败。
- status内的`peakRssBytes`只是launcher随手观测，不授予C26性能资格；成功日志也不扩大既定验收范围。
