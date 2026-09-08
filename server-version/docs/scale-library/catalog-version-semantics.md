# Scale Catalog 版本语义（七个版本轴）

> PR-SL1（Scale Library Catalog Foundation）锁定。本文档是 Library 治理契约的一部分：
> 任何修改版本语义的 PR 必须同步更新本文件与
> `backend/src/__tests__/scale/scale-library-catalog-version-semantics.test.ts`。

## 七个版本轴

| # | 版本轴 | 载体 | 变化时递增 | 变化时**不**递增 |
|---|---|---|---|---|
| 1 | `instrumentVersion` | `ScalePackageV2.instrumentVersion` | 量表内容/题目/响应集变更（产生新 package） | 计分规则变更（见下方 audit 结论）、catalog 元数据、reference 数据、本地化文本 |
| 2 | `scoringVersion` | `ScaleDefinitionV2.scoring.scoringVersion` | 计分规则、transform、missing policy、score 结构变更 | 题目文案微调（不改变分值映射）、本地化文本、catalog |
| 3 | `reportVersion` | `ScaleDefinitionV2.report.reportVersion` | 报告结构/解释/免责声明变更 | 计分规则、题目内容 |
| 4 | `referenceVersion` | `AssessmentReferenceSetDefinition.referenceVersion` | 参考数据/统计量/人群范围变更 | package 定义、catalog |
| 5 | `localizationVersion` | `LocalizationManifestV1.localizationVersion`（SL2-C1 落地；TEXI 专用契约仍用 `fixedSourceVersion`） | 授权翻译/回译/术语/本地心理测量学证据变更 | `scoringVersion`（翻译变化永不自动升级计分版本）、`catalogManifestVersion` |
| 6 | `catalogManifestVersion` | `ScaleCatalogManifestV1.catalogManifestVersion` | 任何 manifest 内容变化（identity/construct/population/administration/intendedUse/evidence/referenceApplicability/scientificMaturity，含 citation 修订） | 其他六个轴；`hashScaleDefinition(definition)` |
| 7 | `InstrumentAuthorization.version` | `InstrumentAuthorizationRecordV1.version` | 批准后的 amend/evidence 替换（append-only，从 1 开始） | package/definition/reference/catalog |

## Version Semantics Audit 结论（SL2，回答 SL1 遗留 review 项）

**scoring-only change → 只 bump `scoringVersion`，不要求 bump `instrumentVersion`**
（情况 B：解耦已被现有架构支持，无需 runtime 重构）。依据：

- package identity = `key + instrumentVersion`；`hashScaleDefinition` 不参与
  identity（registry 仅校验 hash 计算稳定性）；
- frozen admission snapshot 在冻结时烙印 definitionHash/scoringVersion，并在
  FINAL submit 断言——历史 attempt 与 result 不受后续 scoring 变更影响；
- `ScaleResultV2.method` 独立烙印 instrumentVersion / scoringVersion /
  reportVersion / definitionHash。

scoring-only 变更的两个操作要求（均为既有流程，不改变架构）：

1. 经既有发布/seed 流程刷新 DB `Scale` 行 definitionHash
   （`scaleDefinitionFromRecord` 的一致性门要求行 hash = package hash）；
2. reference entries 按新 scoringVersion 重新声明（`validateScalePackage` 强制
   entry.scoringVersion === definition.scoringVersion）；旧 scoringVersion 的
   results 得到诚实的 reference unavailable（version_mismatch），不会误读。

## 不变量（有自动化测试锁定）

1. **catalog 元数据永不进入 ScaleDefinitionV2**：修改任何 catalog 字段（包括
   evidence citation）只要求 `catalogManifestVersion` 递增，
   `hashScaleDefinition(definition)` 完全不变。
2. **本地化变化不升级计分**：`localizationVersion++` 永不自动导致
   `scoringVersion++`（SL2 起由 `LocalizationManifestV1` 契约强制）。
3. **rights 变化只走授权版本轴**：授权范围（electronic/scoring/translation/display、
   territory/locale、commercialNature）只能通过 `InstrumentAuthorization` 新版本表达；
   catalog 不保存 `isLicensed` / `canUseCommercially` 之类的第二 rights 事实源。
4. **reference 与 package 解耦**：`referenceVersion` 独立于 `instrumentVersion` 与
   `scoringVersion` 演进；package 通过 `referencePolicy` 声明它消费哪个版本。
5. **catalog binding 只看身份**：`ScaleCatalogRegistry` 以
   `instrumentKey + instrumentVersion` 绑定 `ScalePackageV2`；catalog 的科学内容
   变化不产生新的 package，也不要求 package 重新发布。

## 边界

- 本文档随 SL1 建立并在 SL2 完成 audit 修订，是**元数据层**版本语义；不改变任何 scoring/runtime 行为。
- 轴 5 已随 SL2-C1 `LocalizationManifestV1` 落地；TEXI 专用契约（`fixedSourceVersion`）保持原样，直至其迁移到通用契约（另行 PR）。
- 新增版本轴（如 Bundle/AnalysisProtocol 的版本）必须走独立 PR 评审，不在本文档静默扩展。
