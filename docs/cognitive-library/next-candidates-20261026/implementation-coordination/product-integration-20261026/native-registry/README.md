# 四项认知候选：最小backend native registry接线

本小步只接入真实原生定义、精确tuple resolver、双profile结构门禁及直接受影响的registry审计。根dot明确授权后实施，主线负责独立提交/回退；本agent不commit/push，不改PR356分支、CI、merge、DB或部署。

## 实际上游核对与实施范围

2026-10-26通过GitHub连接器fresh读取PR356：HEAD `58c43e22c2fa6f120320594e17a940dd2a24ae7a`，base/main `ff8471e529e7b3c56e1e20f17d1e2581040fc896`，Open/Draft、未合并。三个本次共同文件在main、该PR HEAD和本地修改前Git blob均精确相同：

| 文件 | Git blob SHA |
|---|---|
| `v2/registry.ts` | `f0fc61c176aeb3e3d19d962075a09a8ebd0b13cf` |
| `v2/publication-gate.ts` | `e831b529411f6ffad2df12a38fcdfff4205e358e` |
| `v2/audit.ts` | `f20dbe0d7c432f9226b88f709c03a7451c6ae42d` |

原件见`remote-baseline.json`与三个baseline文本。此核验只说明这三个直接文件没有PR356新差异需要移植，不声称整个PR356路径与本分支等价，也未从移动分支名假定上游未变。开始时本分支HEAD为`eb5d90274c2f4301c1be93b107eb8c7bb10360ee`，已有主线/其他内容owner的未提交改动；本小步不覆盖这些改动。

最小计划：native resolver/gate → 错版本、误造standard或调用legacy.score可能造成错误计分/准入 → 新单文件原生合同；混合list直接影响audit/旧inventory → 只续三项旧库存合同 → 云端Node24.21.0、单worker；类型仅四个改动backend入口闭包；复用已有候选scorer/报告/前端原件，不跑完整旧算术、浏览器、CI。实际单次单元执行约1–2秒，类型约3.26秒。

## 已实现

- `content-candidates/native-registry/definitions.ts`是显式四项清单，直接引用内容包的**同一个权威TaskDefinition对象**，没有构造RegistryEntry或legacy适配器：

| testType | engineVersion | scoringVersion | profile |
|---|---|---|---|
| mot | 1.1.1 | 1.1.0 | research / experience |
| enumeration | 0.1.0 | 0.2.0 | research / experience |
| continuous-recognition | 0.1.0 | 0.2.0 | research / experience |
| ant | 1.0.0 | 1.1.0 | research / experience |

- 原公开API `getCognitiveV2TaskDefinition(testType,engineVersion,scoringVersion)`先找精确原生tuple，随后保留原legacy精确版本适配；不存在latest或跨版本回退。`listCognitiveV2TaskDefinitions()`精确合并原legacy库存与显式native库存，避免重复同tuple。未更改legacy registry/catalog。
- publication gate仅对这四个已知精确tuple要求**恰好research和experience**；缺一拒绝，添加standard别名亦拒绝。其他旧任务/未知定义仍保留原standard规则及所有schema/metric/quality/report/reference检查。通用结构验证通过不等于被registry注册。
- audit保留legacy原referenceEligibleMetricKeys严格校验；native必须是显式清单中的同一权威对象，clone/伪造同tuple不算真实backing。严格核legacy＋native完整coverage、重复、缺失及冲突，不用数量>=或放松未知tuple取巧。
- 原生authoritative scorer无需legacy.score，不存在假0–100总分。正常ANT实测通过生产resolver→authoritative scorer→native报告，保留真实正确率、signed差值和分母。空native记录正常返回invalid状态原件，不假报有效或保存成功。

本小步不改变四个候选协议、素材、重复次数、计分或报告算术。recognition既有声明的可见度合同错误由主线owner单独修复：hitRate原为user却又列headline；现在设headline并从userMetrics去重，FAR/CRR仍user。真实修前阻碍和package SHA在`recognition-preexisting-readiness.json`；本agent未改候选源，也没有弱化共享visibility门禁。

## 必要的直接消费者适配与检查

`v2/audit.ts`原先硬要求每个TaskDefinition都有RegistryEntry且两者数量相等，新native list会直接令审计失败，因此经主线确认纳入最小范围。旧`v2-registry.test.ts`前三项改为严格合并inventory/FINAL合同/兼容状态断言，未放宽精确coverage。该测试从v2/index barrel导入曾间接加载未生成的Prisma客户端；已只把测试import改为同一个真实v2函数的直接源模块，不mock，不改production barrel，不generate/install数据库依赖。

`mot-native-content.test.ts`仅首case标题、原过时standard拒绝期望改为原生双profile通过/恰好两版；其后原envelope/forged-clock及其他算术/seed断言未改，未整跑该suite。新四项gate合同已覆盖更新的准入断言。

原始结果按调用身份保留：

- `native-contract.json`：首轮16项，15 PASS、1 FAIL。失败是新legacy测试给reaction传empty却错误期望成功；原reaction严格要求5条，产品适配未错。
- `native-legacy-compat.json`：只续上述1项，PASS，保留其原空输入拒绝并证明legacy.score确实被调用一次。首轮15成功项不重跑。
- `legacy-inventory-consumers.json`：setup失败，**0 case执行**，缺`.prisma/client/default`，不是业务断言失败。原件保留。
- `legacy-inventory-consumers-continued.json`：改为直接真实模块import后，仅旧前三项3 PASS、其余5未选，不声称旧suite完整通过。
- `types.json`：按真实backend tsconfig，只对registry/publication-gate/audit/native definitions四入口及真实依赖做类型闭包，退出0、输入前后hash稳定；包含recognition修后package，不再另跑其旧types。

合格证据为**新合同16个不同case（15＋定向1）＋必要旧消费者3项**，不是一次完整无过滤命令，也不是将前后所有执行次数相加。没有执行旧候选完整算术、前端/浏览器、DB启动或CI。开发自查不冒充独立审计。

## 这一步还不能称为入库或发布

registry中的DRAFT/compatibility publication状态不决定产品可用性；真实`CognitiveTestConfig.status`、能力开关、权限、内容release及保存链路仍是既有平台真值。这里只使精确native定义可解析、通过真实双profile合同与严格审计。

| 真实消费者 | 目前路径/阻碍 | 负责人/最小修复条件 |
|---|---|---|
| `release.service.ts` / `release-batch.ts` | readiness已调用v2 resolver，但publish后续measurement release仍依赖旧RegistryEntry | 平台/主线：沿既有授权和事务把原生测量来源绑定接通；resolver PASS不代替发布 |
| `assignment.service.ts` | requireReadyV2之后仍legacy get检查schema/profile并冻结 | 平台：native schema/profile/report冻结分支；不造RegistryEntry.score |
| `session.service.ts:240` | 启动无条件requireCognitiveRegistryEntry | 平台：以真实native定义解析配置/预算/冻结身份，保留现有课程/成员/时间/lease权限 |
| `public.service.ts` / `trial.service.ts` | 仍legacy require | 平台：原生启动/试次schema和权限接线，不绕过幂等/归属 |
| `catalog.service.ts` / `library/catalog.ts` | legacy list/get及generated catalog双向完整性 | 平台/内容目录：原生DTO与目录真值、真实标签消费者，不能只把resolver列表当后台已入库 |
| `profile-freeze.ts` / `assignment-measurement-release.ts:33` | 依RegistryEntry profile/report/来源契约 | 平台：真实research/experience固定组合与report/reference/source快照，不回填standard |
| `completion.service.ts`及旧报告路径 | v2分支可解析定义，但某些completion/回退仍legacy require及score:number | 平台：按真实dataContract和scoreEncrypted:null分支完成消费者，不填假分 |
| API/DB/COS/整卷ACK | 本项没有执行或接通 | 平台：既有真实持久化/归档/报告冻结/导出合同，保存失败可靠重试 |

另见同目录`frontend-consumers.md`（另一位agent只读梳理）：前端registry、CognitiveTaskProps/候选ports、teacher强置standard、readiness白名单及Survey固定入口也未由本后端小步接通。

## 独立提交与回退边界

`owned-source.diff`只包含本小步3个v2文件、新native definitions、新合同测试、旧inventory测试及MOT首case门禁hunk，不包含主线既有候选源改动。MOT测试在开始前已有主线未提交的版本/fixture修订，patch用只还原本次门禁hunk的基线，避免把它们混入或反向撤掉。对应before/after文件hash在`evidence.json`。

应在四个内容包存在的本认知分支上独立提交，本agent不提交。未写DB、未发布或部署时，可反向应用该owned diff或回退其独立提交；这只撤回native resolver/gate/audit接线，保留其他owner候选内容与原件。真实上线后的历史施测兼容不在本未发布小步中作出承诺。
