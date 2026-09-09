# Scale Library Wave 0 产品缺口审计

## 当前能力盘点

| 能力 | 当前状态 | 证据 | SL4 处理 |
|---|---|---|---|
| Scale list | 有，但不是 Library | `frontend/src/pages/ScaleList.tsx` 仅为教师/管理员管理 DB `Scale`；`StudentScales.tsx` 只列出当前学生已获得的实例 | 新增只读 Library list，保留既有管理/学生入口 |
| Catalog registry | 有 contract/evaluator，已有 Wave 0 source set | `backend/src/modules/scale/library/catalog-manifest.ts`、`catalog-registry.ts` 与 `wave0-catalog.ts` | 以 registry/read model 继续维护，不复制 runtime/rights |
| Filter | 无 Library filter | 现有管理页只有 tags filter；没有 construct/respondent/age/locale/intended-use/availability | 新增简单 keyword + 结构化 filters，不做搜索引擎 |
| Detail route | 无 Library detail | `/scales/:id` 是教师量表编辑；学生直接进入 runner | 新增 metadata-only detail route；launch 复用既有 start mechanism |
| Admin/expert metadata surface | 有 authorization 管理页，但无 Library provenance view | `pages/admin/InstrumentAuthorization.tsx`；没有 catalog/evidence/localization/reference 聚合详情 | 在 detail 中按现有 role/auth 只给 ADMIN 治理展开区，不造新 ACL |
| Protected text leakage | 现有教师编辑页可编辑/预览题目，学生 runner 需要题目；没有 Library endpoint 因而暂无独立 Library 泄露面 | `ScaleEdit.tsx`、`ScaleAssessment.tsx` | Library read model/endpoint 明确排除 items/options/scoring keys/custom scorer/legal internals |
| Availability | 既有 package/DB/authorization gates 分散在发布与学生访问流程 | `scale-package-gates.ts`、`scale-access.ts`、`InstrumentAuthorization` repository | Library 只投影 gate 结果：`AVAILABLE` / `RESTRICTED` / `NOT_AVAILABLE`，不创建第二套 rights 状态 |
| Launch integration | 现有学生 start endpoint 可用 | `POST /api/scales/:scaleId/assessments` 与 `ScaleAssessment` | detail 只导航到既有 start flow；不造 Library attempt service |
| Report rendering | standalone `ScaleResult` 与 composite/questionnaire `ScaleUnitReportCard` 已存在 | `modules/reporting/ScaleUnitReportCard.tsx`、`pages/student/ScaleResult.tsx` | 以产品级 Wave 0 regression 证明完整性；不改 scoring/finalizer |
| History/reanalysis | 既有 assessment result/history 机制存在 | `GET /api/scales/assessments/:assessmentId`、`GET /api/scales/assessments/my` | 增加回归断言，确保 metadata 更新不改 frozen result |

## 设计边界

- Library 是 source packages、catalog manifests、authorization evaluator、localization provenance 与 reference metadata 的 read model，不是新的 runtime 或 source of truth。
- 普通用户只看到发现、适用性、用途、语言、可用性、限制与 truthful reference summary；不展示 scientific maturity、完整 evidence matrix、protected item text 或 scoring internals。
- ADMIN 可以在同一详情页展开治理 provenance；沿用现有 `ADMIN` role，不创建 expert role 或新 ACL engine。
- availability 由 package release、现有 package gate、locale/territory 与 durable `InstrumentAuthorization` 共同决定。catalog alone 不能提升为 `AVAILABLE`。
- Library list/detail 允许读取 code-owned metadata 与既有授权摘要；answer save、checkpoint、score、reference computation、FINAL submit、completion transaction 不读取 Library。

## 已知 Wave 0 缺口

1. 6 个 package 的 package release status 当前仍为 `DRAFT`；发布/授权与真实 DB deployment 状态必须保持既有 gate 语义，不能由 Library 按钮绕过。
2. package report 已有核心字段，但 teacher SDQ 与 TEXI total mean 等维度的 guidance 需要产品层回归确保不出现空的用户关键区块。
3. package reference policy 当前为 `none`；Library/Report 必须明确“没有可用群体参考”，不得写成全国常模或百分位。Wave 0 的 Scientific Evidence Matrix 也保持为空，待未来有明确核实的科研证据后再追加记录。
4. SDQ teacher、TEXI parent/teacher 的 English source 与 zh-CN product key 不能混同；未有 signed localization 时只能展示 English source / restricted reason。缺省 Library locale 必须采用条目自身 target locale，显式部署 locale 才显示 mismatch。

## 本 PR 不做

- 不新增 instrument，不建立 semantic search、research dashboard、automatic evidence synthesis、norm recalibration、device correction 或 item preview。
- 不新增数据库表、Prisma migration、Redis/cache/indexer、background evidence job 或 submit-time catalog lookup。
- 不修改 Scale scoring、reference engine、Scale answer payload、SL3 provenance contract、unified final submit、completion transaction 或历史 result freeze。
