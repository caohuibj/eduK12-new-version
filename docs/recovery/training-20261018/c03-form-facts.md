# C03 typed Form 基础：限定范围完成

范围：`CompositeAssessmentItem.formDefinition` 可空 JSON 单题公共 `FormQuestion` → 统一 Form 定义/答案校验 → canonical FINAL payload → V2 encrypted collection facts → definition-bound aggregate/report reader。旧定义不新增 null 键进入 hash；旧 V1 facts 不改写。新增迁移只追加 nullable JSONB，无 UPDATE/backfill。

`formDefinition` 保存单个公共 `FormQuestion`，`itemKey` 是冻结定义稳定键，提交的 `formItemId` 仍是数据库题目 ID。adapter 显式映射到公共 key；矩阵 value 是 `rowKey → string/string[]` 对象，转换为公共行键校验再持久化结构化事实。number 不转字符串进入 FINAL 或事实；String answer 列只作旧消费者兼容投影。V2 reader 校验区段、字段、类型、规范化值和版本，缺失权威快照时禁止回退 String 列。

新 formType 使用 number/long_text/date/time/likert/matrix/matrix_multiple/rank_order/slider/constant_sum，对应公共大写类型。C03 不开放这些类型的编制 API 或新 UI；C04/C05 负责开放及控件。旧五种题型无定义时原语义不变。公开 FINAL composite 协议支持 typed 值，旧 Questionnaire FINAL 协议不扩展。

明确拒绝未接入的 displayIf、refusal、other、exclusive、typed contextKey 和 question.image。图片资产归属/保留/授权及 V3 策略留给后续，不借用 Survey 产品权限。发布/FINAL 检查整段稳定键唯一和公共定义体积预算。复制保留单题配置；C04 编制应生成 `q_<item UUID>` 稳定键，C06 做引用图重映射。

报告从权威 typed 快照读取，仅兼容显示为无损 JSON 文本，未完成 C07 结构化报告布局。typed 导出在 C07 无损 CSV/ZIP/SAV 合同接入前明确报 TYPED_FORM_EXPORT_NOT_AVAILABLE，避免旧80字符列截断。旧报告和导出保持原路径。整卷提交仍先完成 Form section，再交 Scale units；whole report graph 已带 formDefinition，最终聚合消费 V2 reader，不新增第二套提交协议。

## 验证状态（2026-10-18）

- 独立 worktree、独立离线 npm ci 419 包、Node 24.21.0、fresh Prisma Client 5.22.0。最终 tsc 编译通过。
- 基础 checkpoint：typed 24 + optional Form/V32-1 15 = 39/39。最终增量：typed 25 + results 20 + legacy answer validation 5 = 50/50；results 测试需要 COGNITIVE_MODULE_ENABLED=true。
- 真实 PG16.15 从 C02 合成166迁移 dump恢复至167：203张旧表的旧列投影逐表一致；新增 form_definition 全 NULL。旧冻结定义hash/V1 FINAL/教师报告仍可读取。
- 最终业务源码 `50c0bc2a3103ddbf432cea3e9cad17a880097a0e`：真实 HTTP 42请求、7组检查全部通过。number/matrix/null/旧题混合V2、非法输入、复制、FINAL幂等、canonical报告和String投影毒化后重建、typed导出400/旧导出200、whole Scale receipt→worker→COMPLETED/aggregateInputHash/报告均有实证。
- 精确来源、运行dist/schema/client/hash、HTTP检查、清理结果见 `c03-evidence.json`。证据摘要无账号密钥；私有合成dump/运行凭据不入Git。四个隔离服务全停止，未触碰C02服务。
- 失败记录保留：TIME缺时区和DB options undefined的单测fixture已修；JSON复制DbNull编译问题已修；HTTP分组fixture已修；导出前置loader缺items导致500已以导出专用授权轻量查询修复；未隐藏或把早期整轮失败改为通过。导出count集成在原授权查询中，无每次旧导出额外防御查询。

## 已知风险：whole timestamp / session timezone 契约

真实隔离PG默认继承Asia/Tokyo时，whole租约所有身份谓词通过，唯 whole_accepted_at exact equality失败。TIMESTAMP(3)原文16:56，Prisma读取16:56Z，绑定timestamptz显示次日01:56+09；raw Date写入及比较依赖会话UTC。此问题非本次typed引入，但属于原有健壮性风险，不能声称非UTC兼容已修。

本次C03和既有C02 local-stack harness显式启动 timezone=UTC；重新创建typed/whole合成测评后全链路通过。未修改原有receipt、租约守卫或生产代码。后续Training批次应优先核对真实部署连接会话的UTC契约，统一审查 whole-receipt-atomic、report-outbox、scale batch raw时间参数策略，并增加UTC/Asia-Tokyo双时区回归；不能只对单处比较cast或降低exact acceptedAt保护。

## C04/C05 接口交接

- `formDefinition` 是单个公共 `FormQuestion`，不是完整 `FormDefinition`。formType小写snake映射公共大写type；NUMBER/LONG_TEXT/DATE/TIME可先开放，prompt必须等于formLabel、required必须等于formRequired。TIME必须提供公共规则要求的timeZone。
- 编制保存应生成稳定唯一 `q_<item UUID>` itemKey；复制保留定义稳定键、数据库ID重新生成，整段不得key碰撞。提交使用DB formItemId，服务端显式映射公共键，不能字符串替换引用图。
- 目前public add/update schema仍旧五题型且无formDefinition；新增编制必须覆盖schema→存储→copy→preflight/publish。公共core不改旧五题型及可选null语义。
- FinalCompositeAssessment和FinalQuestionnaireAssessment前端作答适配均需支持typed值，禁止Number/Object先String化；本次仅composite FINAL wire扩展，旧独立 Questionnaire FINAL协议未扩展，不能直接把公共前端类型放宽当服务端支持。
- 拒绝image/displayIf/refusal/other/exclusive/contextKey保持到对应授权/策略实现；复用公共Form控件时不得导入Survey产品权限/API。
- 旧题继续V1；区段包含typed才V2，V2整段包括旧字段均以权威快照读取，缺失或不匹配fail-closed。报告目前为无损JSON文本兼容显示；结构化布局和无损导出属C07，不列本次全功能验收。

检查在当前节点完成；未启动CI、未改workflow/生产/Mac。未做浏览器交互验收。
