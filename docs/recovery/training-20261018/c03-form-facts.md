# C03 typed Form 基础：实现 checkpoint（未完成真实 PG/HTTP 验证）

范围：`CompositeAssessmentItem.formDefinition` 可空 JSON 单题公共 `FormQuestion` → 统一 Form 定义/答案校验 → canonical FINAL payload → V2 encrypted collection facts → definition-bound aggregate/report reader。旧定义不新增 null 键进入 hash；旧 V1 facts 不改写。新增迁移只追加 nullable JSONB，无 UPDATE/backfill。

`formDefinition` 保存单个公共 `FormQuestion`，`itemKey` 是冻结定义稳定键，提交的 `formItemId` 仍是数据库题目 ID。adapter 显式映射到公共 key；矩阵 value 是 `rowKey → string/string[]` 对象，转换为公共行键校验再持久化结构化事实。number 不转字符串进入 FINAL 或事实；String answer 列只作旧消费者兼容投影。V2 reader 校验区段、字段、类型、规范化值和版本，缺失权威快照时禁止回退 String 列。

新 formType 使用 number/long_text/date/time/likert/matrix/matrix_multiple/rank_order/slider/constant_sum，对应公共大写类型。C03 不开放这些类型的编制 API 或新 UI；C04/C05 负责开放及控件。旧五种题型无定义时原语义不变。公开 FINAL composite 协议支持 typed 值，旧 Questionnaire FINAL 协议不扩展。

明确拒绝未接入的 displayIf、refusal、other、exclusive、typed contextKey 和 question.image。图片资产归属/保留/授权及 V3 策略留给后续，不借用 Survey 产品权限。发布/FINAL 检查整段稳定键唯一和公共定义体积预算。复制保留单题配置；C04 编制应生成 `q_<item UUID>` 稳定键，C06 做引用图重映射。

报告从权威 typed 快照读取，仅兼容显示为无损 JSON 文本，未完成 C07 结构化报告布局。typed 导出在 C07 无损 CSV/ZIP/SAV 合同接入前明确报 TYPED_FORM_EXPORT_NOT_AVAILABLE，避免旧80字符列截断。旧报告和导出保持原路径。整卷提交仍先完成 Form section，再交 Scale units；whole report graph 已带 formDefinition，最终聚合消费 V2 reader，不新增第二套提交协议。

## 验证状态

- 独立 worktree，独立离线 npm ci 419 包，Node 24.21.0，fresh Prisma Client 5.22.0。
- 新 typed 24 测试 + 既有 optional Form/V32-1 15 测试：39/39 通过。
- 首轮两条 fixture 失败：TIME 未声明公共规则要求的时区；模拟 DB formOptions 用 undefined 而非 null。只修 fixture，没有放宽产品规则。
- 首轮 tsc 发现新增 JSON 可空字段的复制路径需要 Prisma.DbNull，已修。下一次 tsc --noEmit 通过；最终编译另记录。
- 尚未声称真实数据库迁移、HTTP、whole worker、报告或浏览器通过。下一步使用 C02 合成166迁移快照独立恢复，核对旧行/冻结hash不变、新列全null，再运行167上的 typed FINAL/重放/报告/拒绝导出与 whole 路径。使用当前节点独立 state/端口/受限角色，不触碰 C02 栈或生产。

检查主要位置为本节点；不启动 CI，不改 workflow/生产/Mac。已完成且输入一致的旧前置manifest检查沿用 C02 输入，不重复无关平台门禁。预计真实 PG/HTTP 检查 10–15 分钟，失败保留并定点修复。
