# Pilot-first Publication + Research-upgradable Governance

> PR-SL2 建立；2026-09-11 按统一 Scientific Maturity Governance 更新。
> 产品生命周期与科学成熟度是两条独立状态轴，PILOT 与 RESEARCH_READY 都是完整正式的可发布产品状态。

## 核心不等式

```text
PUBLISHED != RESEARCH_READY
PUBLISHED != RESEARCH_GRADE
PILOT != incomplete product
Scientific Evidence Matrix != universal publication blocker
RESEARCH_READY != formal norm certification
RESEARCH_GRADE != formal clinical certification
Reference maturity != Scientific maturity
```

## 两条状态轴

| 轴 | 取值 | 权威源 | 升级方式 |
|---|---|---|---|
| PRODUCT LIFECYCLE | DRAFT → PUBLISHED → RETIRED | `ScalePackageV2.releaseStatus`（code）+ DB `Scale.status`（部署态） | 既有 package 发布流程 |
| SCIENTIFIC MATURITY | PILOT → RESEARCH_READY → RESEARCH_GRADE (future) | `ScaleCatalogManifestV1.scientificMaturity`（catalog governance metadata） | Admin/Expert evidence review；不改变测量 Runtime |

**PUBLISHED + PILOT 与 PUBLISHED + RESEARCH_READY 都是完整、正式、可上线使用的正常产品状态。**

Pilot 上线前置条件保持最小：

```text
ScalePackage 稳定 + scoring 正确 + rights 合法 + localization 可用 + truthful usable report
```

## 分层门（pilot-publication-gate.ts）

| 层 | 性质 | 内容 |
|---|---|---|
| Product correctness | HARD | valid ScalePackageV2/DefinitionV2、响应集/transform/missing policy、golden cases、runner 可执行 |
| Rights | HARD | InstrumentAuthorization（唯一 rights truth）：当前部署所需 electronic/display/scoring/translation、territory/locale、有效期 |
| Localization | HARD | 当前实际内容在目标 locale 可用且 provenance 不误导 |
| Respondent applicability | HARD | 请求的 respondent 必须在 catalog 声明范围内 |
| Claim honesty | HARD | 当前报告不能输出无依据 norm / percentile / diagnosis / validation claim |
| Scientific completeness | SOFT（永不单独阻塞 Pilot） | 无常模/无 invariance/无 device 等价性/无重测/无完整 validity → researchGaps + limitations + validation targets |

`LocalizationManifestV1` 只保存来源、版本、适配和审核 provenance，不声明翻译/数字化/商业权利；这些权利只能由 `InstrumentAuthorization` 判定。

只有缺失直接意味着当前产品输出本身不成立或具有误导性（rights denied、wrong locale/respondent、已知无效 scoring、unusable localization 等）才 fail closed。

## 报告等级与成熟度解绑

L1 SCORE_ONLY / L2 DESCRIPTIVE / L3 REFERENCED_INTERPRETIVE 与 PILOT / RESEARCH_READY / RESEARCH_GRADE 不一一绑定。成熟度不能凭空产生 reference；RESEARCH_READY + `referencePolicy=none` 完全合法。

L3 必须绑定真实 ACTIVE versioned reference；local_pilot / literature_beta 支撑的 L3 必须使用试行措辞，禁止宣称全国常模、正式常模或标准化全国排名。

## Research readiness

Research Ready 是当前内容建设的 evidence-based 升级目标，重点检查：

- content / construct / intended-use documentation；
- rights / source / localization provenance；
- research capture 与数据字典；
- 首轮、用途相关的 empirical validation；
- exact identity 与方法可复现性。

它不是固定万能 checklist；证据相关性由 intended use 和 instrument family 决定。没有适用正式 reference 不能阻止 Research Ready。

现有 `research-readiness.ts` 中更高门槛的 research-grade evaluator 保留用于 future RESEARCH_GRADE，不得反向成为 Pilot publication gate。

## 证据矩阵的职责

Scientific Evidence Matrix = scientific provenance + research backlog + future maturity evidence + admin/expert audit。
矩阵不完整 → research gap / limitation，而不是 Pilot 发布 blocker。证据可以持续新增而不触碰 definition hash。

## Version semantics

Scientific maturity metadata 变化不改变 `hashScaleDefinition(definition)`。

如果只新增证据、完成 Research Ready review：

```text
PUBLISHED + PILOT
        ↓ governance/evidence update
PUBLISHED + RESEARCH_READY
```

不要求创建新的测量版本。

如果题目、scoring 或其他 measurement contract 发生实质变化，则按现有 version semantics 创建/更新 exact identity；新 identity 默认回到 PILOT，不继承旧版本成熟度。

## Runtime 效率承诺

Catalog / Evidence / Maturity / Research readiness / Localization review metadata 不进入 per-item answer save、checkpoint、FINAL submit、score()、completion finalizer。Scientific maturity 是治理元数据，不是 capability switch。
