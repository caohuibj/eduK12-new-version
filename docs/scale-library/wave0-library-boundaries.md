# Scale Library Wave 0 边界与 PR 检查清单

## 交付对象

本 Wave 0 只覆盖现有的 6 个 scale package：

- ADEXI v2
- WHO-5 zh-CN
- SDQ Parent zh-CN
- SDQ Teacher EN T4-10
- TEXI Parent EN
- TEXI Teacher EN

Library 是由 code-owned catalog manifest、现有 package/report 定义、localization provenance、现有授权记录与现有部署记录组装出的只读 read model。它不是新的 instrument、runtime、数据库 source of truth 或发布系统。

## 可见数据边界

普通用户可以看到量表身份、构念、适用人群、施测方式、用途与限制、实际内容语言、来源摘要、参考资料状态、报告能力与当前可用性。管理员在同一详情页的受控治理区域可以看到 maturity、Scientific Evidence Matrix 记录、reference applicability、发布门结果与授权依据；沿用现有 `ADMIN` role，不新增 ACL 或 expert role。Wave 0 当前六个 matrix 均为空，来源引用不计入 evidence record。

Library payload 不包含 item text、response options、item code、scoring transform、reverse map、weights、custom scorer、answer 或内部 legal note。列表和详情均只读取 metadata；保存答案、checkpoint、计分、reference selection、FINAL submit、completion transaction 与历史结果不查询 Library。

## Availability 与授权

启动资格必须同时满足：

1. package identity 与 catalog manifest 可绑定；
2. package 已是 `PUBLISHED`；
3. 现有 `Scale` deployment 已发布；
4. 现有 `InstrumentAuthorization` 对 locale/territory、电子施测、计分和显示范围有效；
5. 现有 package gate、内容语言和 respondent 适用范围通过。

Library 只投影 `AVAILABLE`、`RESTRICTED`、`NOT_AVAILABLE`。当前 Wave 0 package 在仓库中仍保持既有 `DRAFT` 状态，未因 Library 页面自动获得启动资格；没有真实部署或授权时，页面只允许浏览目录信息。

内容语言按 package 实际 manifest 判定，不按产品 key 猜测：WHO-5、ADEXI、SDQ Parent 为 `zh-CN`，SDQ Teacher EN T4-10、TEXI Parent EN、TEXI Teacher EN 为 `en`。英文 source 不被伪装成中文本地化版本。未显式传入 locale 时，每个条目使用自身 localization `targetLocale`；显式 `locale=zh-CN` 或 `locale=en` 时，才按该部署 locale 评价不匹配原因。

## 报告边界

6 个 package 都保留现有 L1/L2/L3 报告等级，不新增 L4。报告 read model 与实际结果继续由既有 scoring/report pipeline 生成，并要求用户可见的分数、维度、headline、construct explanation、score meaning、limitations、educational guidance、truthful reference wording、disclaimer 与 history 入口保持完整。

当 package 没有适用 reference 时，报告和 Library 明确显示“未提供群体参考”或等价的描述性限制；不得生成 percentile、全国常模、诊断或跨人群推断。Scientific Evidence Matrix 只记录已核实的科研证据；Wave 0 当前未录入可用于本地验证的科研证据，来源记录、授权引用和 localization provenance 不等同于本地验证或正式常模。

## 明确不在本 PR

- 不新增 runtime class、数据库表、Prisma migration、Redis、worker、evidence indexer 或后台任务。
- 不修改 Scale scoring、reference engine、answer payload、SL3 provenance、cognitive/situational/bundle contract 或 unified final submit。
- 不添加逐题 HTTP/DB 请求，不在 completion transaction 中查目录或证据。
- 不提供 item preview、搜索引擎、自动证据综合、norm recalibration、device correction 或 protected content export。
- 不开始 SL5，也不在本 PR 合并自身。

## Draft PR 验收清单

- [x] Wave 0 report/library gap audit 已提交。
- [x] 6 个 code-owned manifest 已绑定现有 package registry。
- [x] read-only list/detail/filter API 与前端浏览、详情、可用性和既有启动入口已提交。
- [x] ordinary/admin 可见边界、授权、语言和 protected-content 约束已提交。
- [x] 6 个 package 的 report completeness 回归与报告卡片展示回归已提交。
- [x] 缺省 locale 按每个条目的实际内容语言计算；English detail 可直接加载且不会出现伪造的 zh-CN mismatch。
- [x] Wave 0 source provenance 与 Scientific Evidence Matrix 语义分离；管理员 projection 不再生成 `CONTENT_VALIDITY` / `UNKNOWN` 来源记录。
- [ ] 独立分支的完整 backend/frontend/build/数据库集成验证完成后更新 PR 状态。
- [ ] 新 Draft PR 的 fresh merge-ref CI 全部通过后停止，不执行 merge 或 SL5。
