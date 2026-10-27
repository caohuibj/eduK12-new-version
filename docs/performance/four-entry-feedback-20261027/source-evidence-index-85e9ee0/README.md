# 源登记 / marker 历史证据索引（85e9ee0）

审阅目标固定为集成 `85e9ee0c66ada6a2b0550b9e11f3e31b96ab62ce`，tree
`a2ba0fb7bd278165a4adbd44013f2a72f526285f`。本索引从 source 分支
`b045751a29c080e6e52f67252fed7c875f007f7c` 开始，**只读业务源码、Git 对象和原证据**，
没有运行新应用、测试、PG、类型检查、安装或 CI，也没有改业务。
它是提供 root 独立审阅的资料，不授正式资格、不自动豁免或要求重跑旧套件。

## 首要复用缺口：b045 四个 PG 不能整体外推到 root96

root96 指提交 `96fb8f71bdc2028cf7e94b59f858db2080376f16`，不是96个新PG。
从 b045 到85，生产者服务仅新增已知错误类 import 并收窄/导出
`pickerSourceUnavailable`，其余 service 逻辑及本线模块、测试、config/schema/lock
均保持。root 保存了1项新合同（exit0），没有重跑本线四个PG。

但原四个 PG 中第2项“marks an invalid persisted source definition unavailable…”
**不能直接复用为85上的通过**：

1. 本 case 制造 formLabel 与 formDefinition.prompt 不符。
2. `assessment-runtime/typed-form.ts:17/:32` 实际抛出
   `InstrumentFinalSubmitError('FORM_ANSWER_INVALID', ..., 400)`。
3. `services/instrumentFinalSubmit.ts:23` 中该类直接 extends Error，不继承
   CompositeServiceError、ContentReleaseError 或教育管理/来源错误。
4. root96 新白名单不包含它。service 列表 catch 的
   `if(!pickerSourceUnavailable(error)) throw error` 会继续抛出，原“列表返回不可用”
   语义已不成立。root 的那一项新合同只使用 CompositeServiceError，未覆盖实际类。

这是**静态路径发现**，不是85上的新PG失败结果。本线程未修复、未运行验证。
需要 root 决定最小过滤修正及相应定向证据；不应把原四项整体写成当前通过。
其余3项的实际路径为有效授权发现/显式null缺权、prepare/register拒绝和原proof恢复，
不依赖这个错误类型转换；它们是按该边界供 root 审阅的条件复用候选。
未知HTTP-shaped/SQL错误与NOWAIT争用继续传播的 root 合同也保持原独立身份。

## 原执行与逐 case 记录

`invocations.json` 保留28次原测试调用的**380条 assertion 记录，含重复**：每条有
原 fullName、原 passed/failed/skipped、原报告 SHA、错误栈（JSON报告）或原日志行。
没有把失败轮中的局部通过变成整轮通过，没有把过滤/未声明变成通过。
`pg-case-history.md` 给出普通18、marker5、policy4与licenses4的矩阵：
P=原通过、F=原失败、S=原跳过/筛选、∅=该轮尚未声明该case。

以下命令均是**原命令核心**，不是本次运行建议。原 shell wrapper 的所有字节、
部分早期 `-t` 正则及参数顺序没有留存；不能从case集合倒造“原命令”。
完整已知核心、是否留存filter和退出来源在 invocations.json。JSON reporter 的
原 `/tmp/...json` 输出地址由对应原 log 保留。

| 原组 | 原命令核心 / cwd | 原结果 |
|---|---|---|
| 普通生产者 PG r1–r11 | backend `vitest run src/__tests__/education-tools/assessment-resource.publication.postgres.integration.test.ts`；r3以后原 `-t` 精确字符串缺失，原选择逐case保留 | r1 exit1 0P/12F；r2 exit1 1P/11F；r3 exit0 11P/1S；r4 exit1 2P/2F/11S；r5 exit1 1P/1F/13S；r6 exit0 1P/14S；r7 exit1 4P/2F/11S；r8 exit0 2P/15S；r9 exit0 1P/16S；r10/11各exit0 1P/17S |
| 原合同/reader | backend `vitest run src/__tests__/education-tools/assessment-resource.contract.test.ts src/__tests__/education-tools/assessment-resource.repository.test.ts` | 17P exit0，mock合同 |
| 原 typed Form | backend `vitest run src/__tests__/composite/typed-form-facts.test.ts` | 25P exit0，单元 |
| 原授权管理UI | frontend `vitest run src/admin/AdminContentPermissions.test.tsx` | 45P exit0，mock UI，非浏览器/PG |
| marker WIP r1 / verbose r2 | backend `vitest run src/__tests__/education-tools/assessment-resource.marker.postgres.integration.test.ts` | 均exit1，schema.extend循环加载，0断言；WIP不当成功 |
| private marker r3 | 同文件 `--reporter=verbose` | 1P exit0 |
| standard r1/r2 | backend `vitest run src/__tests__/education-tools/assessment-resource.standard-marker.postgres.integration.test.ts --reporter=verbose` | r1 exit1：系统管理员不能替代入口分配；修正夹具后r2 1P exit0 |
| marker增量 | backend 两个marker文件 `--reporter=verbose -t 'checks exact original\|refuses to prepare'` | 2P/2S exit0；原filter中 `\|` 是此表的转义，实际正则为普通 `|` |
| Teacher标准P/R | backend standard-marker文件 `--reporter=verbose -t 'selects exact approved PLATFORM'` | 1P/2S exit0 |
| 共享Training合同 | backend `vitest run src/__tests__/measurement-content/training-content-binding.test.ts src/__tests__/measurement-content/training-standard-source.test.ts src/__tests__/measurement-content/training-standard-combination-boundary.test.ts --reporter=verbose` | exit1，95P/1F；旧mock禁止root新增PLATFORM身份读取 |
| 上述单项修正 | backend boundary文件 `--reporter=verbose -t 'PLATFORM report pointer'` | 1P/6S exit0；不重标原命令96项全绿 |
| feedback登记增量 | backend `vitest run src/__tests__/education-tools/assessment-resource.feedback-policy.test.ts src/__tests__/education-tools/assessment-resource.feedback-policy.postgres.integration.test.ts --reporter=verbose` | exit0，2schema单元＋2真实PG；旧hash PG显式指定原synthetic resource ID |
| exact licenses | backend `vitest run src/__tests__/education-tools/assessment-resource.license-selection.postgres.integration.test.ts --reporter=verbose` | r1 exit1 3F（Form夹具不一致）；r2在repo根误用相对bin，exit127未启动；r3 exit0 4P，保留前述root96边界 |
| root96 picker合同 | root已有 `vitest run src/__tests__/education-tools/assessment-resource.picker-error.test.ts` | 1P exit0，root执行，非本线新增PG |

非case检查也逐次列入JSON：旧backend types r1 exit2、r2–r7 exit0；旧frontend
`tsc --noEmit -p tsconfig.app.json` r1 exit2、r2/3 exit0；原五个变化前端文件
eslint exit0（原完整literal argv未保留）；原 `prisma migrate deploy` exit0，240项迁移。
marker types WIP r1/r3是原进程恢复后的exit0，r2 exit2；marker r4仅空log没有退出凭据，
标UNKNOWN；r5/6/7有exit0原件。feedback types r1 exit2、收窄只读P/R helper类型后r2 exit0。
licenses types r1/r2/r3各有exit0原件。

**backend tsconfig 排除 src/__tests__**：这些types不是test/fixture类型证明。
licenses-types-r3当时仅因测试断言排序重跑，但该文件被排除，未构成新的production
类型输入；这是本线历史冗余执行，原记录保留，不能计为新增覆盖或成为以后重跑理由。
本次未以空log推断UNKNOWN结果为成功。

## 报告 SHA 与原件

所有28份报告（含root原件）的存储/解压后SHA-256都在 invocations.json，原件不改。
以下是收尾判断常用的**解压后/原始文本** SHA；`.gz`容器哈希另列，不混用：

| 报告 | SHA-256 |
|---|---|
| source-pg-r11 JSON（仅报告case增量） | `208b94a1a3e69706f932b28f9b8d5fa01c19ccee55220f2a4a6d15d3a088c05c` |
| private marker r3 log | `5e7230739b5ff881a7100d1fec673047be7b31c9bf587ec8cf6c1fe74bef81ab` |
| standard marker r2 log | `bb0f9f5bdecbedd5079b2e74f34ac97739d2736a056a4f78a7c9b83d6a6052c5` |
| marker增量 log | `a083ab38b71fa861ae9a379aacd3ff7e1116b4380e97cb9b39019751261c804c` |
| Teacher标准P/R log | `c0f8edb0c5160bed778752851ee3fbf1ce3f26adeac0c29489fc033f48ea7c7d` |
| feedback-policy-r1 log | `980f8c40b887f09b7c7f6f87ddbacf1c4c4835a36022c3f29bf68d0d12a429f5` |
| licenses-r3 log | `7df91d88a3fbf27f564e4aa17abc39ba512d8206bfb362226f15091f47537e51` |
| root96 picker JSON | `844ea7a1e954a849cb3db333ea03700a75cfe38b117730110f6b594966cf9980` |

原件目录分别是 source-publication-evidence、marker-wip-rescue、
marker-validation-evidence、source-feedback-policy-evidence、source-license-selection-evidence；
root picker来自85树的 license-integration-evidence。原输入快照、失败和exit文件原样保留。

## 源码 / config / schema / lock / 依赖闭包

四个收尾checkpoint：8fcfad（普通生产者）、9ce3f44（marker）、41caf96（feedback）、
b045751（licenses）。`recorded-input-comparison.json` 对照原manifest记录的源码SHA、
checkpoint Git blob及85实际blob：所有已记录collection hashes均与各自checkpoint一致。
这些是**收尾collection快照**，没有被追溯改写成每次较早调用的同步快照。

`static-input-closures.json.gz` 从不可变Git对象**现在回算**静态保守范围：
import/reexport/literal动态import/require、含type import，附完整边、blob、SHA、模式；
显式纳入config与全部迁移。每组约1232–1255文件，当前多seed并集1281；旧→85变更：
普通组22文件、marker4、feedback1、licenses1、root96组0。不存在未解析的relative/alias
literal import，但 computed文件读取/loader/环境变量不是运行trace，明确标记待审。
“新可达”列表采用当前全部seed并集，是审阅superset，不能称旧调用真的执行了所有这些文件。

四checkpoint→85的 backend/frontend package.json、package-lock、tsconfig、vitest config、
frontend setup、backend schema和migration tree逐字节相同。**配置相同不等于代码等价**：

- 普通组后续引入原issuer NOWAIT、共享教育C/P/R、marker、必需feedbackPolicy、licenses
  DTO。原字面register请求缺新字段，不能当当前请求重放；旧18只按核心不变量和已补增量
  供独立审阅，不宣称85上18项通过。
- marker组变化为两份测试增显式IMMEDIATE、origin optional反馈字段、service后续producer/
  picker更新；核心marker/source→runtime identity及standard/private消费者保持。原literal
  新登记输入与当今新请求有别，反馈4项单独提供UTC/幂等/历史缺字段证据。
- feedback组到85只有service新增licenses投影/发现与错误过滤；反馈字段写入、parse和原hash
  路径保留。licenses到85只有上文root96过滤差异，不能跳过无效Form那项的失配。
- 原frontend45项是管理员授权界面；其组件仍同blob，但新真实登记面板/客户端已有后续变化，
  由管理工种/root自己的证据负责，不能借45个mock声称新面板浏览器通过。

原cloud执行环境记录为 Node24.21.0、PG16.15、loopback
`eduk12_pr363_publication_test`，不是root Node24.22.1/PG17；不可跨机重标环境。
显式 opt-in DB变量＋NODE_ENV=test；backend vitest设置 COGNITIVE_TEST_FIXTURES_ENABLED=true。
secret值不入索引。旧PG保留实际服务/SQL/HTTP断言，但没有每次完整DB镜像/环境变量清单。

`installed-dependencies-observed-now.json.gz` **只读当前残留安装元数据**：backend445、
frontend395个package记录，package.json实际版本均与各自当前lock匹配；包含各package
metadata hash、integrity、当前hidden lock及Prisma生成物hash。当前版本示例：
Vitest4.1.11；backend TypeScript5.9.3 / Zod4.6.7 / Prisma与client5.22.0 /
Express4.22.1；frontend TypeScript5.6.3 / React18.3.1 / jsdom25.0.1。
原reporter也记录Vitest4.1.11，但**旧时没有完整node_modules字节清单**；如今matching lock、
旧mtime或现存package metadata都不能补成历史实际依赖闭包证明。没有执行npm/node包或安装。

## 真正剩余项（不扩大本任务）

1. root96遗漏实际 InstrumentFinalSubmitError 的过滤边界；原无效Form PG不可直接复用。
2. **5 marker PG不是受试 Scale FINAL**：它们验证生产生命周期、START candidate、
   collection准入/撤权、HISTORY和P/R身份。未执行真实被试Scale作答/耐久FINAL/幂等恢复/
   outbox报告闭环；runtime线程正补。不能拿“source含Scale”或candidate attemptId代替。
3. 原普通producer、private/standard、反馈、licenses证据不能代替四入口浏览器/MFA/受众
   报告披露闭环；原UI mock亦同。root已有其他线程结果需各自独立登记。
4. 历史部分literal argv、每轮source tree、实际运行模块trace、完整dependency字节和PG
   快照没有留存。已明示缺失；不补造、不靠全套复跑抹去失败，是否有限接纳由root决定。
5. 没有本索引产生的新应用/PG/CI结果，没有正式资格、合并或部署。
