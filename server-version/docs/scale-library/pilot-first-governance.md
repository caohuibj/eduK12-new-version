# Pilot-first Publication + Research-upgradable Governance

> PR-SL2 建立。本文档是 Scale Library 治理契约的一部分：产品生命周期与科学成熟度
> 是两条独立状态轴，PILOT 是完整正式的产品状态。

## 四条不等式（必须同时成立）

```text
PUBLISHED != RESEARCH_GRADE
PILOT != incomplete product
Scientific Evidence Matrix != universal publication blocker
RESEARCH_GRADE != formal clinical certification
（Reference maturity != Scientific maturity）
```

## 两条状态轴

| 轴 | 取值 | 权威源 | 升级方式 |
|---|---|---|---|
| PRODUCT LIFECYCLE | DRAFT → PUBLISHED → RETIRED | `ScalePackageV2.releaseStatus`（code）+ DB `Scale.status`（部署态） | 既有 package 发布流程 |
| SCIENTIFIC MATURITY | PILOT → RESEARCH_GRADE | `ScaleCatalogManifestV1.scientificMaturity`（catalog governance metadata） | Admin/Expert 治理行为；学生/家长/普通教师不感知 |

**PUBLISHED + PILOT 是完整、正式、可上线使用的正常产品状态。** 上线前置条件只有：

```text
ScalePackage 稳定 + scoring 正确 + rights 合法 + localization 可用 + Pilot 报告完整
```

## 分层门（pilot-publication-gate.ts）

| 层 | 性质 | 内容 |
|---|---|---|
| Product correctness | HARD | valid ScalePackageV2/DefinitionV2、响应集/transform/missing policy、golden cases、runner 可执行 |
| Rights | HARD | InstrumentAuthorization（唯一 rights truth）：electronic/display/scoring/translation、territory/locale、有效期 |
| Localization | HARD | LocalizationManifestV1 存在且通过治理审核、instrument/version 与 package 及 target locale 匹配、content locale 可用 |
| Respondent applicability | HARD | 请求的 respondent 必须在 catalog 声明范围内 |
| Scientific completeness | SOFT（永不阻塞） | 无常模/无 invariance/无 device 等价性/无重测/无 responsiveness/矩阵不完整 → researchGaps + limitations + warnings |

`LocalizationManifestV1` 只保存来源、版本、适配和审核 provenance，不声明翻译/数字化/商业
权利；这些权利只能由 `InstrumentAuthorization` 判定。已有 TEXI 专用 manifest 的历史字段
保持兼容，但通用 publication evaluator 不把它们当作 authoritative rights truth。

只有缺失直接意味着「当前产品输出本身不成立或具有误导性」（rights denied、wrong
locale/respondent、已知无效 scoring、unusable localization 等）才 fail closed。

## 报告等级与成熟度解绑

L1 SCORE_ONLY / L2 DESCRIPTIVE / L3 REFERENCED_INTERPRETIVE 与 PILOT /
RESEARCH_GRADE 不一一绑定；六种组合都合法。PILOT 不把报告降级为 raw-only。
L3 必须绑定真实 ACTIVE versioned reference；local_pilot / literature_beta 支撑的
L3 必须使用试行措辞（「相对于当前本地试行参考样本……」），禁止宣称全国常模、
正式常模、标准化全国排名。RESEARCH_GRADE + 无 reference 同样不得凭空产生 percentile。

## Research-grade readiness（research-readiness.ts）

ADMIN/EXPERT ONLY 的纯 read model，NON-BLOCKING。证据相关性由声明的 intended use
决定（NOT_APPLICABLE 逻辑）：一次性教育描述用途不被强制要求 responsiveness 或
进展监测证据。输出 `READY | PARTIAL | NOT_ESTABLISHED` + strengths/gaps/evidenceRefs。
不做 workflow engine、不做自动晋升、不进 submit 路径。

## 证据矩阵的职责

Scientific Evidence Matrix = scientific provenance + research backlog +
future upgrade evidence + admin/expert audit。矩阵不完整 → research gap /
limitation，**不是**发布 blocker。证据可持续新增而不触碰 definition
（hash 不变，见 catalog-version-semantics.md 不变量 1）。

## Version Semantics Audit 结论（SL1 遗留 review 项）

**scoring-only change → 只 bump scoringVersion，不要求 bump instrumentVersion**
（情况 B：解耦已被架构支持）。证据：package identity = key+instrumentVersion
（hash 不参与 identity）；frozen admission snapshot 在冻结时烙印
definitionHash/scoringVersion 并在 FINAL submit 断言，历史结果不受影响；
`ScaleResultV2.method` 独立烙印各版本轴。操作要求（不改变架构）：
1. scoring 变更后经既有发布/seed 流程刷新 DB `Scale` 行 definitionHash
   （`scaleDefinitionFromRecord` 的一致性门要求行 hash = package hash）；
2. reference entries 按新 scoringVersion 重新声明
   （`validateScalePackage` 强制 entry.scoringVersion === definition.scoringVersion）；
   旧 scoringVersion 的 results 将得到诚实的 reference unavailable（version_mismatch）。

## Runtime 效率承诺（Gate C）

Catalog / Evidence / Maturity / Research readiness / Localization review metadata
全部不进入 per-item answer save、checkpoint、FINAL submit、score()、completion
finalizer。本 PR 全部为 metadata 契约 + 纯 evaluator；热路径零新增查询与计算。
