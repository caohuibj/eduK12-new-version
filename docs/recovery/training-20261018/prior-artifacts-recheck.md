# 旧成果与持久化材料复查索引

复查日期：2026-10-18（UTC）。源码比较基线：`main@f6df9c5b21c5a0d50853d5e6e2d1bfd79389dcd0`（PR313）。本索引只记录只读核验结果，不修改验收状态，不表示丢失的 Training 集成已经恢复。下列仓库路径均相对根目录；公共基础已在重建基线内，通常应直接消费，而不是重新 cherry-pick 整个历史 PR。

## 1. 找回范围与阴性结果

- GitHub 提交接口分别查询 `7bb472565fdb9a356a226bcf6f91f1f8d6c2226c`、`82f78f8bcede97b85ae0cb6b047182ede3acc5f0`，均返回 HTTP 422 / `No commit found for SHA`。按两枚 SHA 查询 Actions 运行，均为 `total_count=0`。这证明当前可访问仓库接口无法解析它们，**不能证明从未 push**。
- 本节点另一次独立只读复查记录：原目录不可见；392 个 refs、71 条 reflog、无 stash；目标两枚 commit 及两枚 tree 均缺失。发现的 1 个 dangling commit（`91f46dfb`）、4 个 tree、15 个 blob 属于 2026-10-18 今日重建，不是上一轮丢失源码。此项来自本节点独立复查结果，不冒充本索引编写时重新运行的检查。
- 今日 `recovery/training-rebuild-20261018` 及 C03/C04 重建提交必须与旧成果分开。不能因为文件名或功能相似就标为找回。
- 旧 `guarded_load.py` 仅为 **OFFLINE SCAFFOLD**：可以参考停止条件和保护框架，不是执行过的性能数据，也不是 C26 资格。
- 本次只读取本节点仓库与已连接 GitHub 的 PR、提交、Actions 元数据；没有运行测试、触发 CI、下载 artifact、访问生产或其他电脑。新增本索引不产生新的功能通过记录。

## 2. 最重要的公共 Form 固定基线

[PR310：Shared assessment Form foundation and reviewed Training corrections](https://github.com/caohuibj/eduK12-new-version/pull/310)

- 合并提交：`5bfc326bacfc62db588967b12db5a4f70287d626`；提取实现提交：`1b388507c5eaaada29bbb3d6a0eb7bb7589ad46c`。
- PR 中的“43”指 **43 product files**，不是 43 项已完成能力或验收单元。
- `docs/shared-assessment-foundation-v1.md` 记录提取前固定的 **47 个合成案例**，覆盖 13 类 Survey Form、definition hash、归一化值与顺序、错误 name/message/path/issue 顺序、optional/null/zero/empty、拒答/隐藏/other/exclusive、历史 frozen 条件及 TEXT/CSV 导入。
- 固定材料：
  - `server-version/backend/src/__tests__/assessment-core/fixtures/form-foundation-cases.json`
  - `server-version/backend/src/__tests__/assessment-core/fixtures/form-foundation-golden.json`
  - `server-version/backend/src/__tests__/assessment-core/form-foundation-corpus.ts`
  - `server-version/backend/src/__tests__/assessment-core/form-foundation.contract.test.ts`
- 公共后端：`server-version/backend/src/modules/assessment-core/form/{definition,answers,runtime,import-parser}.ts`；公共前端：`server-version/frontend/src/modules/assessment-core/form/`。
- 固定 golden 必须保留为旧行为 oracle，不能用重建候选代码重生成后再宣称兼容。公共 normalizer 要求已经验证的 definition，不能直接接收未验证 wire data。
- 此提取没有启用 Training 新题型，没有新增 Training typed 存储、导出或权限。CSV 的 revision/digest 确认、draft mutation、publication 仍由入口适配器负责。

## 3. 已合并功能来源与测试索引

### 高级 Form：C03–C07

[PR279：Professional Form V2](https://github.com/caohuibj/eduK12-new-version/pull/279)，合并 `2c3b9ed518a7652108b19b2ffbace2308678ca56`。

`server-version/backend/src/__tests__/survey/` 下：

- `research-form-v2.contract.test.ts`：150 题/3 页、DATE/TIME/RANK/SLIDER/CONSTANT_SUM/MATRIX_MULTI、other、互斥、typed JSON 导出。
- `research-form-runtime.contract.test.ts`：480 row keys、体积预算、隐藏/未填/拒答区分、额外字段拒绝。
- `research-form-export-privacy.contract.test.ts`：自由文本默认排除，包括 OTHER_TEXT。
- 前端 `server-version/frontend/src/survey/{ProfessionalFormAnswer,FormChoiceExtras,SurveyFormPagination}.test.tsx` 与 `form-core-compatibility.test.ts` 可作消费者回归蓝本。

边界：Survey V2 的条件与拒答协议不能直接替代 Training V3；新必答拒答策略、稳定键重映射、typed FINAL、报告/CSV/ZIP/SAV 需要新入口的真实证据。

### Scale：C08–C09

[PR282：timed Scale](https://github.com/caohuibj/eduK12-new-version/pull/282)，合并 `96aad102e591eef4b59c3cc51db7d4c6f23cfc6b`；后续 [PR283](https://github.com/caohuibj/eduK12-new-version/pull/283)，主干合并短 SHA `62b9b2a6`。

- `server-version/backend/src/modules/survey/builder.import.ts`：单共享 responseSet 导入限制及 digest；`builder.service.ts`：revision/CAS/审计。
- `server-version/backend/src/__tests__/survey/research-wave-final.postgres.integration.test.ts`：真实 PG timed FINAL、timed checkpoint CAS、FINAL purge/replay、Raw Long/Wide/export ticket、历史 NOT_COLLECTED 等案例。
- `server-version/frontend/src/survey/SurveyTimedScale.test.tsx`、`survey-scale-timing.test.ts`。
- 继续复用 `server-version/backend/src/modules/scale/scale-scoring.ts`；权限参考 `server-version/backend/src/__tests__/scale/{pr3-authorization-binding,pr4-governance-review}.test.ts`。

边界：Survey 新 Scale 的 ONE_BY_ONE 默认协议不能当作 Training 默认关闭的可选采集。Training 课程来源、独立 timing capability、summary 与 raw 分权、队列/产物/下载复核仍要接通；不得改旧 responseTimeMs 或标准量表。

### Cognitive、SJT、概率分卷：C10–C15

[PR309：Survey design and exact-candidate qualification](https://github.com/caohuibj/eduK12-new-version/pull/309)，合并 `0c41f07cb8c6104ad7c88448d948682baf24cf37`。其历史包括 `b8431edae969da8505b7c3e4940a0cdb5845677b`（native SJT/cognitive extension）、`77b56f52`（weighted variants）、`834a85c2`（来源与导出修正）。

- `server-version/backend/src/__tests__/survey/research-cognitive.postgres.integration.test.ts`：并发 FINAL、epoch/restart、父子绑定、current consent、HARD_STOP、撤销竞争。
- 同目录 `research-sjt-v2.contract.test.ts`：AUTHOR_KEY_SUM、EXPERT_KEY、SUM/MEAN、缺失/拒答、16000-cell 上限；`research-sjt-multiselect.contract.test.ts`：受控组合与伪造拒绝。
- 同目录 `research-variants.postgres.integration.test.ts`：并发首次访问只分配一次，跨 arm 认知 start/read/restart/interrupt 拒绝。
- 原 SJT 内核：`server-version/backend/src/modules/situational/authoring/{service,template,workbook}.ts`、`situation-scoring.ts`。
- 原 SJT 编制测试：`server-version/backend/src/__tests__/situational/sjt-authoring.test.ts`、`sjt-authoring.postgres.integration.test.ts`。

边界：不重建第二套评分/报告 worker。Survey session/attempt 授权不能冒充 Training 精确 release/hash/course/purpose/expiry；独立人工 golden、历史撤销恢复、图片发布锁、分发/改编许可仍需新证据。私有分卷不能通过普通 pooled 分析路径绕过。

### Analysis、Flow、checkpoint：C16–C23

[PR280：Flow 与 Research Operations](https://github.com/caohuibj/eduK12-new-version/pull/280)，合并 `935a6d5cd7d0acfe1b4b84b5c247cf6d3da6586c`；[PR281：checkpoint 与 export paging](https://github.com/caohuibj/eduK12-new-version/pull/281)，合并 `f9ad58a5d4e9164966acf2256c71bbb50d10492e`。

- `server-version/backend/src/__tests__/survey/research-flow.contract.test.ts`、`research-flow.postgres.integration.test.ts`：typed AST、SCREEN_OUT、私有 group、一次分配、T2 KEEP_LINKED。
- 同目录 `research-operations.postgres.integration.test.ts`：原子 quota、CAS、伪造凭据、终态 purge、withdraw 不回收历史 quota。
- 公共分析测试：`server-version/backend/src/__tests__/assessment-relational/{analysis,analysis-repository.persistence,result-authority,runtime-consent}.test.ts`。
- `server-version/backend/src/modules/survey/checkpoint.service.ts` 静态确认：过期删除整行并返回 revision 0，再建 version 1。因此其 100 次上限不能直接满足新 Training 的跨过期累计身份/次数与 tombstone 合同。

边界：冻结课程来源与成员身份、10/20/50 查询成本、匿名研究退出不自动删除教育记录、任务 SATISFIED 与提交终态、全出口反馈 embargo、round/restart quota 绑定必须逐条新验收。Survey 较宽条件运算符不应照搬。

## 4. 26 单元映射：材料能支持什么

本表是复用导航，**不是验收状态表**；正式状态以对应单元的新证据为准。

| 单元 | 可用材料 | 不能由旧材料证明的部分 |
| --- | --- | --- |
| C01 | 本索引、固定 main、GitHub 阴性结果 | 丢失 commit/tree 已恢复 |
| C02 | Training HTTPS wrapper、survey-candidate 合成 fixture/隔离方式 | 当前候选 PG/Redis/dist/角色全链已运行 |
| C03 | PR310 公共 schema/runtime 与47-case oracle | Training typed FINAL 事实链 |
| C04 | PR279 基础高级类型与控件测试 | 当前 Training 真实编制到导出 |
| C05 | PR279 结构化类型/分页/typed JSON 测试 | 新适配器结构无损 |
| C06 | 公共 visibility/refusal/other/exclusive | 新 V3 连续段、稳定键、必答拒答策略 |
| C07 | Survey typed export/privacy 测试 | Training 报告/CSV/ZIP/SAV 同源 |
| C08 | Survey import、CAS/digest/audit | Training 共享选项导入与许可 |
| C09 | PR282 timed FINAL/恢复/导出测试 | 默认关闭、独立 timing capability、下载复核 |
| C10 | Survey cognitive 生命周期测试与公共 scorer | Training 总 flag 的全部新准入出口 |
| C11 | SJT authoring/runtime/scoring | Training 课程完整分发链 |
| C12 | SJT V2/多选/评分合同 | Training 新协议、人工独立 golden |
| C13 | 原 SJT 编制/准入/快照测试 | 精确课程用途许可、图片锁与改编权限 |
| C14 | Survey 一次 weighted assignment PG 测试 | Training attempt 上下文与恢复 |
| C15 | 私卷跨 arm 拒绝、variant analytics | 稳定键、异步 SJT 授权、任务级分析 |
| C16 | assessment-relational 公共分析测试 | 冻结课程归属、重复 attempt、10/20/50 成本 |
| C17 | Survey quality/export 指纹与分页 | Training 成员/质量/授权版本下载复核 |
| C18 | Survey consent/withdraw 生命周期 | 教育记录保留与研究退出语义 |
| C19 | Flow AST/SCREEN_OUT/trace | Training END、SATISFIED、材料不泄露 |
| C20 | Flow quota/KEEP_LINKED PG 测试 | 匿名 restart 主体键与凭据轮换 |
| C21 | PR309 group-ip policy/freeze/lifecycle | Training round/list/reveal/复制真实绑定 |
| C22 | Survey 受控 feedback 源码参考 | Training 报告/缓存/下载/导出全出口 embargo |
| C23 | Survey CAS/64KB/TTL/cleanup、认知 retention | 累计100、过期保身份、默认关闭、tombstone |
| C24 | PR310 Training UI/控件回归 | 当前普通 UI 可访问性；不得影响认知刺激 |
| C25 | 冻结 test selection、真实 candidate browser | 当前组合完整回归及固定提交审查 |
| C26 | OFFLINE SCAFFOLD 保护条件、已有测试思路 | 真实四工具性能测量及任何新性能结论 |

## 5. 已验证的官方运行与 artifact 元数据

以下仅核验官方 run/step 状态和 artifact 元数据，未下载或解包。因此 artifact 存在不等于其中每个测试已核读，也不等于当前重建通过。expiry 为 API 返回的 UTC 时间；后续可能过期或被删除。

| 来源 | 精确 head / 官方运行 | 核验结果与可读材料 |
| --- | --- | --- |
| PR279 | `67fc68d490d58e5b7489839c166a3289f9601f32`；[CI 38146978943](https://github.com/caohuibj/eduK12-new-version/actions/runs/38146978943) | run success；backend-vitest-report artifact `11705133509`，172328 bytes，未过期，expires `2027-01-09T14:23:28Z` |
| PR280 | `ebaf10e57f50fe4b876a3a7b262cb49a214e7b9b`；[CI 38184094817](https://github.com/caohuibj/eduK12-new-version/actions/runs/38184094817) | run success；backend-vitest-report `11719281427`，173749 bytes，未过期，expires `2027-01-09T23:23:23Z` |
| PR282 | `0c685fe360f9580af32ce17cbee1b265de09f494`；[CI 38194309821](https://github.com/caohuibj/eduK12-new-version/actions/runs/38194309821) | run success；backend-vitest-report `11722664143`，173557 bytes，未过期，expires `2027-01-10T02:03:41Z` |
| PR309 | `8b2eef40bfbee870c58677d7af39299de15242d0`；[CI 39031714833](https://github.com/caohuibj/eduK12-new-version/actions/runs/39031714833) | run success；job `117393440981` 的 `real three-role Chromium and Survey retention smoke` step success。report artifact `12100324436`，3888890 bytes，未过期，expires `2026-10-20T12:18:53Z`。另有759575461-byte镜像包，未下载 |
| PR310 | `36416a4dfb328f40a64d42849d39ffcb6ac10427`；[CI 39078706946](https://github.com/caohuibj/eduK12-new-version/actions/runs/39078706946) | browser/race/Chromium/Firefox/WebKit admission jobs 与 merge gate success；有复用结果，不能称最终 run 全部新执行 |

PR310 尚未过期的 artifact：frontend `12118695205`（1910 bytes，expires `2026-10-20T23:22:02Z`）；race `12118410465`（2879 bytes，`23:22:25Z`）；interaction-chromium `12117977700`（1881 bytes，`23:22:24Z`）；interaction-firefox `12117903425`（1873 bytes，`23:22:22Z`）；browser `12117743873`（1074335 bytes，`23:23:00Z`）；interaction-webkit `12117733846`（1870 bytes，`23:22:25Z`）。该段未重复日期的时间均为 2026-10-20 UTC。

精确证据绑定资料：

- `.github/scripts/survey-candidate-tests.json`：backend/frontend 的固定选择，并区分 missingOriginalRunner、changedInputs、retainedReviewEvidence。
- `.github/scripts/shared-assessment-foundation-bindings.json`：productSource、component tree 与文件 before/after blob。
- `.github/scripts/reviewed-candidate-source.json` 及对应 admission 工具：用于核查实际同输入资格，不能无条件扩展到新重建差异。

## 6. 浏览器脚本选择与最终复用原则

- 已保存的 `server-version/e2e/training-optional-https.py`、`training-optional-form-browser.cjs` 与 `.github/workflows/ci-browser.yml` 临时 CA/回环 wrapper 可复用安全隔离方式。
- 更新的 `server-version/e2e/survey-candidate-browser.cjs` 要求可信临时 CA、全回环解析、真实 built frontend/backend；明确不覆盖完整编辑器、linked-wave/branch variants、物理计时与生产 TLS。
- 旧 `server-version/e2e/survey-real-browser-journey.cjs` 含 `ignoreHTTPSErrors:true`，**不能直接作为当前可信 HTTPS 验收脚本**。只参考业务步骤；证书验证必须采用当前受支持方式。
- 源码存在、PR 已合并、旧 run success、旧 artifact 存在是不同层次的证据。新源码/环境/配置/协议/权限/fixture 任一改变，须按实际影响重新证明，不能继承旧通过标签。
- 不把 Survey 的项目/wave/attempt 模型替换 Training 长期课程、作业、打卡、匿名、多波次关系；不改历史定义、hash、FINAL 或分数。新策略默认关闭，未支持组合明确拒绝。
