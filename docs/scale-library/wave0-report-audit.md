# Scale Library Wave 0 报告审计

> SL4 Wave 0 审计基线：PR #73 原始基线 `2ed9e4e5c3e0a14a39dcfa48e67ed1eb5edb5b6e`；本轮已以 merge commit `aa66aed518253f055de3a6a26c65c79edbd48ee4` 同步最新 `origin/main` `54a406fe77e4fd72f51de752fe93b8fd2031b5f3`。
> 本文只记录现有代码事实与本 PR 的产品完整性门禁，不引入新的 scoring/runtime。

## 判定口径

- `PASS`：现有 package / report definition 已具备产品所需能力，并有可复用的运行时投影。
- `FIX`：本 PR 需要补齐的 Library 或报告产品面。
- `LIMITED_BY_REFERENCE`：当前只提供描述性结果，缺少适用的真实 reference；不能生成 percentile 或常模声称。
- `LIMITED_BY_RIGHTS`：package 或部署 locale/territory 尚未通过 `InstrumentAuthorization` 与既有 package gate。

## Wave 0 审计矩阵

| Instrument | Scoring | Dimensions | Report | Guidance | Limitation | Reference | Rights | Localization | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| ADEXI v2 (`adexi_v1@2.0.0`) | PASS；working memory / inhibition | PASS；2 个 canonical dimension | PASS；2 个 interpretation、headline、summary、disclaimer | PASS；reflection / strategy / environment | PASS；描述性自评、无诊断、无群体比较 | LIMITED_BY_REFERENCE；`referencePolicy=none` | LIMITED_BY_RIGHTS；package 与 DB 默认保持 DRAFT/HIDDEN，必须通过 durable authorization | PASS；package content locale 为 `zh-CN`；需按部署授权判定 | FIX；Library + 产品级报告回归 |
| WHO-5 zh-CN (`who5@1.0.0`) | PASS；raw total + percentage | PASS；overall raw score 与 derived percentage | PASS；headline、方向、描述性解释、disclaimer | PASS；reflection / support | PASS；无中国常模或诊断声称；非商业约束 | LIMITED_BY_REFERENCE；`referencePolicy=none` | LIMITED_BY_RIGHTS；WHO-5 仍由既有 non-commercial + durable authorization gate 决定 | PASS；Chinese PR source，content locale 为 `zh-CN` | FIX；Library + 产品级报告回归 |
| SDQ Parent zh-CN (`sdq_parent_zh_cn@1.0.0`) | PASS；subscales + total difficulties | PASS；5 个 subscale + total | PASS；家长观察语境、headline、解释、disclaimer | PASS；观察型 guidance | PASS；英国切点仅文献对照，非大陆临床常模 | LIMITED_BY_REFERENCE；`referencePolicy=none` | LIMITED_BY_RIGHTS；既有 SDQ package / authorization gate | PASS；Chinese parent source，content locale 为 `zh-CN` | FIX；Library + 产品级报告回归 |
| SDQ Teacher EN T4-10 (`sdq_teacher_zh_cn@1.0.0`) | PASS；subscales + total + impact custom scorer | PASS；5 个 subscale、total、impact | PASS；English source identity 与 T4-10 范围已声明 | FIX；total 有 reflection / support，其余维度 guidance 为空，需要产品层确认可读性 | PASS；English source locked、非诊断、非大陆常模 | LIMITED_BY_REFERENCE；`referencePolicy=none` | LIMITED_BY_RIGHTS；zh-CN signed translation 未完成；英文 source 仍受既有 gate 约束 | LIMITED_BY_RIGHTS；package content locale 为 `en`，产品 key 不代表中文已完成 | FIX；Library 治理说明 + report completeness regression |
| TEXI Parent EN (`texi_parent_zh_cn@1.0.0`) | PASS；working memory / inhibition / total mean | PASS；2 个 factor + descriptive total | PASS；English source、headline、解释、disclaimer | FIX；factor 有 guidance，total mean 需要产品层明确“分开阅读” | PASS；13–19、informant rating、非诊断 | LIMITED_BY_REFERENCE；`referencePolicy=none`；不能显示常模 | LIMITED_BY_RIGHTS；需要 signed authorization/localization gate | LIMITED_BY_RIGHTS；English source，zh-CN display 不能臆造 | FIX；Library 治理说明 + report completeness regression |
| TEXI Teacher EN (`texi_teacher_zh_cn@1.0.0`) | PASS；working memory / inhibition / total mean | PASS；2 个 factor + descriptive total | PASS；English source、headline、解释、disclaimer | FIX；factor 有 guidance，total mean 需要产品层明确“分开阅读” | PASS；13–19、informant rating、非诊断 | LIMITED_BY_REFERENCE；`referencePolicy=none`；不能显示常模 | LIMITED_BY_RIGHTS；需要 signed authorization/localization gate | LIMITED_BY_RIGHTS；English source，zh-CN display 不能臆造 | FIX；Library 治理说明 + report completeness regression |

## 已确认的代码事实

1. 6 个 package 均已由 `scale-package.registry.ts` 注册，且拥有 `ScaleDefinitionV2`、golden cases 与 report definition。
2. 所有 package 的 `releaseStatus` 当前为 `DRAFT`；现有 `prisma/seeds/scales.ts` 只对 ADEXI 标准 package 做默认 seed，Library 不能假设数据库里已经有 6 个可启动的实例行。
3. 所有 6 个 package 当前 `referencePolicy` 均为 `none`，因此报告必须保持描述性，不生成 percentile、norm 或跨 respondent/locale/territory 的推断。
4. `ScaleResultV2` / `ScaleUnitReport` 已将 score、interpretation、caveat、disclaimer 与版本方法快照投影到 standalone、questionnaire、composite 报告；SL4 不改变 scoring、reference selection、FINAL submit 或历史冻结机制。
5. `ScaleCatalogManifestV1`、`LocalizationManifestV1`、`InstrumentAuthorization`、L1/L2/L3 eligibility 与 pilot governance evaluator 已存在，但还没有 Wave 0 的 code-owned manifest 集合、Library read model、详情页面或治理 metadata 投影。
6. 现有 `/scales` 是教师/管理员的量表 CRUD、发布、导出页面；现有 `/student/scales` 是已授权给学生的测评实例列表。两者都不是 Library discovery/detail surface。
7. Wave 0 六个 manifest 当前不把官方来源、授权来源或论文引用伪装成 Scientific Evidence Matrix 记录：`evidence=[]`；WHO-5、SDQ、TEXI 等来源引用仍保留在 executable package `source` 与 localization provenance。Library evidence summary 在无记录时明确显示未录入本地验证证据，不作验证、常模或诊断声称。
8. Library read model 在请求未显式提供 locale 时按每个 localization manifest 的 `targetLocale` 计算 availability；显式 `locale` 仍作为部署上下文参与 locale gate。这样 English source detail 直接加载不会被缺省 `zh-CN` 错误限制。

## SL4 产品完整性补齐项

- 为 6 个 identity 提供 code-owned catalog manifest 与 localization provenance 入口，不复制 scoring 或 rights truth。
- 组装不含 item text、options、scoring transform、custom scorer 或内部 legal note 的 Library read model。
- 从 Library read model 支持 list/detail/filter，并把 launch 交给现有 `/scales/:scaleId/assessments` start flow。
- 增加每个 Wave 0 package 的 golden score → report 完整性回归，覆盖 headline、解释、guidance、limitations、reference wording 与 disclaimer。
- 对无 reference、local pilot、literature beta 的文案做 fail-closed / truthful 断言；不新增 L4，也不因 `PILOT` 自动降为 score-only。
