# 认知内容扩容：现有格式核对与管理员建议清单

日期：2026-10-27（Asia/Tokyo）。这是原认知内容分支的交付说明，不是新系统方案、发布门禁或激活指令。管理员决定采纳哪些建议、何时合并及启用。问题及时反馈，不把研究未知或改进建议自动升级为阻塞。

## 范围与精确基线

- 用户最新三点：本轮为认知内容扩容并存入 PR；按现有系统格式分析内容，不改本地/云端运行系统；改进建议列清单，最终由管理员决定，不新增工作流或无关验证。
- 远端 main：`04a8d994207d7b831b874d4be4f5c31640466458`。PR356 已合并，合入时 head `3d433a58e313007bfb1e108e800b9da708589f9b`、merge `83955b898b84722a6518a908d6d1038e44e08a7d`；PR358 merge `6bb3a4d008a30b125e9b1ffa705a07548bbad72b`；随后 PR359 已合并。
- 原认知远端 head `9dbbfd36a177a1da96a02ab482427147411e7a90`，tree `948187681bbde7392b9e56c2aa12567d67cb0450`。不能继续按 a704d1b5 或 cb0181a0 描述当前代码。
- 本轮仅把已合并 main 对齐到原分支：merge `0342d1bf4c94876c9edd80e2b709ef8ef185d172`，tree `65b9f1de49ae53c0ad91e865fbd94b46ea42f157`，双亲为上述认知 head 与 main。预演与实际 tree 一致；双方改动文件 884/11，交集为0。
- 上述 merge 的远端 ref/tree/双亲已读回一致，全事件 Actions 数0。交接四个精确小步 f1b95aa2、5c13eb26、43a85a23、a704d1b5 的 Actions 数也重新读取为0。这不保证未来没有 CI。
- 当前 PR 会保留原分支历史及既有内容适配代码，不从旧分支整体搬共享 core。相对 main 的884个既有路径含大量研究文档/截图及此前必要接入代码；不能把整份历史 diff 称为本轮纯文档修改。本轮对齐后只增加本目录交接文档和已有检查原件。
- 当前 diff 没有 Prisma schema/迁移、package/lock 或 workflow 变化（main 对齐引入的 PR358/359 文件已属于 main，不是本 PR 新增改动）。认知 seed 的源码在历史内容 diff 中，但本轮没有对运行系统执行 seed/publish。

## 环境与停止记录

实际 Debian 13.6；初始 cwd `/workspace`，仓库 `/workspace/eduK12-new-version`；可调度5逻辑CPU，cgroup `400000 100000`（4核配额），内存 `17179869184`（16GiB）。代码读取、既有依赖和本轮已完成检查都在云端，无 Mac 文件/终端/浏览器依赖。默认 Node24.19低于仓库要求，改用官方 Node24.21.0，官方 SHA256 已核；未重装依赖。

主工作树及已有另一个 worktree 均实读干净。另一 worktree 是旧 `feat/cognitive-review-fixes-local@979fee01a76e44d66fe8fd8c30ed97aacc349e37`，未动它，未发现旧开发/浏览器/测试进程。

用户澄清前曾准备合成联调：启动两个本轮自有 loopback/限额容器，将字节相同现有 schema 放进全新隔离测试库。没有生产访问或仓库 schema 变更。澄清后两容器已移除，两份未提交 fixture 修改已恢复到 HEAD；未实施 patch 只保留在云端 `/tmp/cognitive-takeover-20261027/unapplied-fixture-proposal.patch`，不进入 PR。新浏览器旅程没有启动。停止记录不改写成浏览器 PASS 或系统部署。

Notion 主交接页已读至第27节，第9节三个批准图的原生图片引用存在；仓库的交接原件、PNG及历史报告截图可读。保留第20节未实施旧方案与其后替代关系。

## 内容与现有系统格式的对应

现有输入是 `TaskDefinition<TConfig,TTrial>`，包含精确 testType/engine/scorer、configSchema/trialSchema、protocol、scorer、finalSubmission、profiles、metrics、quality、references、report。不是把任意 JSON 或 jsPsych 整包放入系统。真实数据库配置行使用 `CognitiveTestConfig` 的 testType/configVersion/name/config/status/engineVersion/scoringVersion；唯一键为 testType+configVersion。

发布及分配由现有配置生命周期、账号权限与管理员操作决定。TaskDefinition.publication 是兼容说明，不是第二套发布权威。现有 native 定义已要求恰好 research/experience，无需 standard 别名或假0–100总分。冻结参数、报告及原始记录继续用现有字段与快照，不另加三组数据库版本字段。

| 内容 | 当前真实版本与配置 | 已有格式/接入 | 当前交付边界 |
| --- | --- | --- | --- |
| 点数判断 | engine0.2.0 / scorer0.2.0 / config0.3.0；report0.2.0 / presentation0.1.0；opaque protocol仍为 enumeration/0.1.0/0.1.0 | 原生定义、完整 recipe、DRAFT seed、双profile、精确 authenticated 路径、native runner、归档合同和冻结报告呈现均在分支 | 是可审查候选；没有运行系统导入/发布或完整产品验收。旧 engine0.1/scorer0.2/config0.2 原样读取 |
| MOT | 沿用现有原生候选及独立 report bundle | 已有 DRAFT seed、native host/归档与报告兼容适配；历史旅程各有自己的源码身份 | 不用旧旅程补签后续宿主/report修复；未正式启用 |
| ANT/PANT | engine1.0.0 / scorer1.1.0 / config1.0.0；288/48正式＋24练习 | native definition、schema/scorer、候选组件、双profile均存在；不是仍被 standard 限制 | 没有ANT配置seed、native-runners条目、专属归档；AntTask仍使用自己的宿主端口合同 |
| 连续再认 | engine0.1.0 / scorer0.2.0 / config0.2.0；report0.2.0；260/100呈现 | 已有受限 native scorer、双profile与候选组件；不接受客户端 ResearchReview | 正式素材未清权、无产品native宿主/seed/归档；保留 pending，不用合成图片冒充正式内容 |

点数冻结 recipe 仍为白点/中灰、5°方底圆域、0.5°圆点、原创48×48 mask、名义50ms、3练习、research100/experience25、1–15整数滑杆＋确认。本轮未改刺激、布局、关键时序、输入或计分，不另开测验。

## 管理员建议清单（信息与选择，不新增门禁）

### L1 连续再认：profile patch 会覆盖已授权素材绑定

源码：`content-candidates/continuous-recognition/package.ts:40–44` 两个 profile 的 configPatch 都包含 `assetManifestBinding:{status:'pending',manifestHash:null,evidenceRef:null}`。现有 `profile-freeze.ts:143` 用 `{...baseConfig,...profile.configPatch}` 合并。因此即使未来基础配置带真实 authorized/hash/evidenceRef，分配冻结仍被写回 pending；native scorer 又据此设置 assetAuthorizationMissing。

最小建议：内容包的 profile patch 只覆盖真正随 profile 改变的参数，资产绑定从实际基础配置冻结；默认未授权状态放基础配置。管理员可决定何时修该内容字段。本轮只报告静态可确认的数据流，不创建假授权、不新增权限或schema，也没有运行假素材完整旅程。

### L2 ANT：把现有候选合同适配到已有 native host

源码：`frontend/.../tasks/ant/AntTask.tsx` 需要 claimAttemptExposure/persistLocalDraft/onTaskComplete；`native-runners.tsx` 当前只有 MOT/点数。`prisma/seeds/native-cognitive.ts` 也只有 MOT/点数；`raw-archive.service.ts` 只处理二者。

最小建议：后续内容接入沿现有真实session/epoch/config身份、durable draft、轻量Envelope、一次FINAL和现有私有资产设施适配。先列字段映射，不再另造保存平台；不暗加standard或假分数。需要共享系统改动的部分单列给管理员选择，本轮不实施。当前输入适配不能宣称与文献键盘版等效。

### L3 标签：研究 metadata 尚未成为后台检索字段

源码：三个新任务的 metadata.ts 保留18维稳定key；`catalog.service.ts:5` 的响应没有这些标签，`cognitive.schema.ts:32` 创建分配是strict且不收tags/classification，`CognitiveTestConfig` 无tags；虽 `CognitiveAssignment.tags` 已存在，也不能据此称18维已持久化/过滤/搜索。MOT catalog.ts明确 persisted=false/globalSearchConnected=false。

最小建议：本批继续交付稳定key、中文/英文名称、多场景、年龄/难度未核及证据边界；管理员如要后台消费，再选择现有标签消费者的映射方式。不为本轮加schema、新分类平台或工作流。

### L4 内容内状态说明有历史滞后

例如点数 `metadata.ts` 的 rollout仍全false，package.ts还写未seed/未接宿主，而实际代码已有对应候选接入。ANT部分注释仍说standard需处理，但当前native规则已允许双profile。连续再认旧 native-adapter README 写scorer/config0.1.0和每次ResearchReview，实际当前为0.2.0及描述性规则。

最小建议：后续为当前快照追加状态说明并保留旧执行事实；不要直接把 seeded=true 写成某台运行系统已入库，也不让静态metadata承担发布权威。本说明已按当前消费者列清差异，无需为文字滞后改系统。

### L5 点数报告与验证边界

F1四个指标解释与F2数组详细层的修订已在5891b3af/c7def945提交；freezeNativeAssignmentProfile将presentation随assignment冻结，v2/report.ts仅让显式metricFormats选择加入，其他任务数组沿用旧行为。当前首屏仍是通用描述模板，不能称个性化报告已完成。

最小建议：管理员按产品优先级决定何时补页面查看/research100/英文入口等内容确认。它们在此列为未验证项，不自动加入CI或阻塞内容PR；不因缺真机、常模或物理曝光证明关闭已获准的正常描述反馈。现有三态质量、真实缺答和权限规则不改。

## 本轮已完成检查与原件

以下发生于用户进一步收窄范围之前，是云端开发记录，不是正式发布资格，不要求CI或服务器复跑：

- 当前 `native-port.test.tsx` 9/9，0失败、0过滤：`native-port-cloud-original.json`。仅补上一轮NOTRUN的该文件，没有重跑MOT/scorer/时序研究。
- 实际 `tsconfig.app.json` 的7入口/189源码闭包零诊断：`frontend-types-cloud-original.json`。不是全App类型检查、完整构建或完整产品旅程。执行器及32个关键输入的blob/SHA见 `source-audit.json`；未声称完整node_modules逐字节绑定。
- 旧 evidence.json 的23个目标摘要重新算：22一致，native-port.ts因b4ad8b3f已记录修订不同。报告文案及格式也在旧清单外新增，故旧浏览器图仍只代表原执行输入。
- 当前main对齐、历史四个提交的远端/Actions读取仅为事实核对；没有触发workflow、改变门禁或合并/部署。

本轮NOTRUN：新浏览器、research100、完整App/CSRF、外部COS、物理手机/平板/Safari、英文产品入口、四入口一致性、后台标签检索、正式CI。历史25次旅程为云端模拟触控/软件时钟/COS替身，不能冒称物理呈现或外部COS。

本轮只需检查新增文档/原件的路径、JSON可读性、源码摘要与实际差异；预算约5分钟。不会为交接文档恢复暂停的全量验证。PR创建后另按实际URL和head回读，最终决定权仍归管理员。
