# 认知测验 GitHub 来源选择评审

本轮建议先围绕 **7个可持续挖掘的任务主库** 建立来源体系，再用 **4个专题来源** 补足学习记忆、努力决策、强化学习和元认知，另将 **jsPsych作为技术底座**。选择依据是可查的任务实现、协议/计分透明度、文献关系与适合提取的内容，不是只挑移植最快的代码。

三路共审查 **34个独立GitHub仓库**：任务与完整电池13、框架与技术参考8、论文复现与方法参考9、暂不直接采用4。同生态仓保留独立证据，但不能称34个独立工具、成熟测验或已入库任务。统一取用优先级为 **A12 / B18 / C4**；其中A包含7个主库、4个专题和1个技术底座，不是12个完整电池。

**结论是选源，不是入库或上线。** A不代表效度、常模、临床适用性、全部授权或可直接上线。GPL、NC、SA是独立复用约束，不降低方法本身的科学质量。没有合适源码，仍可依据可靠原始文献独立实现；不能把无法复制代码说成不能做该范式。

审查快照日期为 **2026-10-25 UTC**；目录20261026为交付批次标签。各仓均固定完整SHA与提交日期。未安装、运行第三方程序、验证其CI或实测浏览器时序；文档不附整份上游代码、素材、参与者数据或连接凭据。

## 七个可反复挖掘的主库

### 1 TestMyBrain 浏览器电池

**[manybrainsproject/TestMyBrainCodeRepo](https://github.com/manybrainsproject/TestMyBrainCodeRepo)**。16个任务目录和配套说明覆盖注意、记忆、控制、决策与社会认知。优先建立Flanker、MRMET、情绪识别的逐任务协议和数据字典；明确的trial字段、RT/正确率/QC定义比直接复制界面分数更有价值。 [固定证据](https://github.com/manybrainsproject/TestMyBrainCodeRepo/blob/ec09ea0d35779bb39997131313dfd1380ee34922/TMB_Tests/TMB_FlankerAttention/src/Flanker_Main.v1.Nov24.html)

采用边界：代码LGPLv3，刺激默认CC BY-SA 4.0并有各任务例外。仅部分任务经细审；Flanker条件median RT含非超时错误试次，不能默认为correct-only；0–100展示分不是常模百分位。

### 2 PEBL 大型范式与论文库

**[stmueller/pebl](https://github.com/stmueller/pebl)**。大量真实任务及任务级论文/变式说明适合持续挖掘。已细审Flanker与Corsi，能够追溯条件、跨度停止规则、论文来源和相对原文的改动；建议先形成独立protocol卡，再决定依法复用或文献自研。 [固定证据](https://github.com/stmueller/pebl/blob/eb22a0725d765a0597a4905920ad3c603b1c9ae8/battery/corsi/corsi.pbl)

采用边界：不是React现成组件，DSL到TS代价高。GPLv2核心、单任务历史声明与音频条款须分开；Flanker默认汇总包含错误/超时，Corsi参数schema/停止边界有静态疑点。它们限制默认实现直接采用，不抹掉主库价值。

### 3 MultiTaskBattery 多域任务与数据契约

**[DiedrichsenLab/MultiTaskBattery](https://github.com/DiedrichsenLab/MultiTaskBattery)**。程序化任务、trial/run TSV、通用响应/汇总与烟雾测试设计结构清楚。优先NBack、DemandGrid的生成规则和数据契约，再沿目录查其他适用范式，而不是搬整个PsychoPy/fMRI栈。 [固定证据](https://github.com/DiedrichsenLab/MultiTaskBattery/blob/d6f49f568872157c1180bf6b22dc5ba255771d79/MultiTaskBattery/task_blocks.py#L148-L188)

采用边界：24条注册项含rest、运动和被动观看，不能称24项有效认知测验。只细审选中路径；MIT代码不覆盖所有外部刺激，TTL/硬件时钟与seed机制需重新适配。

### 4 Minno 隐性测量任务库

**[baranan/minno-tasks](https://github.com/baranan/minno-tasks)**。IAT、BIAT、AMP、GNAT等具体extension可按同一领域反复挖掘。优先IAT可配置block结构、D变式scorer、DValid与无效结果规则，先审纯计分与protocol，再考虑运行时。 [固定证据](https://github.com/baranan/minno-tasks/blob/f8ceef0b9ec5fcad878e14de2f9720baa8caeef4/IAT/iat11.js)

采用边界：Apache-2.0不自动覆盖人脸/IAPS等素材。需冻结D变式，区分反馈和排除阈值，锁住依赖、seed和自有出口；不得据此对个体贴心理标签。

### 5 Experiment Factory 真实任务合集

**[expfactory/expfactory-experiments](https://github.com/expfactory/expfactory-experiments)**。大型旧版任务合集保留实际脚本、config、Cognitive Atlas与论文线索，适合逐任务提取条件表、原始数据字段、计分和参考。与独立Stop-Signal/two-stage仓按同一lineage管理。 [固定证据](https://github.com/expfactory/expfactory-experiments/blob/49b8123f18b26d94dfc010bb8a6ec7458b265e2e/flanker/config.json)

采用边界：旧jsPsych、poldrack插件和共享utils增加工程成本；不宜整库搬用。根MIT不自动解决外部素材，合集数量不能替代单任务审查。

### 6 NivLab 学习与决策方法库

**[nivlab/jspsych-demos](https://github.com/nivlab/jspsych-demos)**。bandit、Horizon、Pavlovian Go/No-Go、reversal、two-step等为学习/决策扩充提供丰富参数与文献入口。可取free/forced choice、reward queues及研究改进思路，逐项建立协议。 [固定证据](https://github.com/nivlab/jspsych-demos/blob/a819c4cae29e629508847a0abe5cd1e5e36baa42/README.md)

采用边界：顶层20个task README含consent、audio-test等，不能当20项成熟认知测验。部分需要使用者提供trial list，现有导出/seed待补。CC BY-NC-SA 4.0约束代码与素材的复用、改编和分发，不是科学质量扣分。

### 7 Flowers 注意与动态视觉电池

**[flowersteam/cognitive-testbattery](https://github.com/flowersteam/cognitive-testbattery)**。七项真实任务与Adolphe等2022论文相对应，覆盖MOT、enumeration、Go/No-Go、load-induced blindness、switching、WM和memorability。适合提取动态视觉、跨日研究设计与可解释参数。 [固定证据](https://github.com/flowersteam/cognitive-testbattery/blob/58ba32fa8b582bedac65ef1c037c9974303dbf5c/js/app_gonogo/parametermanager.js)

采用边界：已审Go/No-Go的p5按键循环可能覆盖首响应、跨trial携带长按，是未运行的静态风险；不照搬runtime。MIT不覆盖FIGRIM图库和未核权字体；论文benchmark不等于中文常模。

## 四个专题来源

主库负责持续覆盖，以下专题来源提供更集中的设计与计分契约，不与完整battery混计。

- **连续再认 — [nwrim/continuous_recognition_task_jsPsych](https://github.com/nwrim/continuous_recognition_task_jsPsych)**：取重复间隔生成/校验、HR/FAR/CRR与ISI按键归属规则。代码MIT；示例OMI脸图是CC BY-NC-SA 4.0。需换获权素材、补seed和持久化，并核零vigilance等边界；默认排除阈值不是普适准则。 [固定证据](https://github.com/nwrim/continuous_recognition_task_jsPsych/blob/b4ad68e5376ee7256763abb622cf06470514edf5/jspsych-continuous-recognition-task.js#L1-L80)
- **努力选择与奖赏 — [lnccbrown/task-effort](https://github.com/lnccbrown/task-effort)**：取React任务状态、offer配置、按键去长按与比例奖赏。固定版本高努力50/100/200按压、25秒比例奖赏，与CNTRACS概览参数不同；不是普通BART。隔离Electron/机构后端，另补seed、首按计时和评分测试。 [固定证据](https://github.com/lnccbrown/task-effort/blob/8102308fc2a7c0e8ec15dae5d44bd5ca49c181ba/src/trials/pressBalloon.js#L147-L228)
- **两阶段强化学习 — [expfactory-experiments/two-stage-decision](https://github.com/expfactory-experiments/two-stage-decision)**：取70/30状态转移、奖励概率随机游走、linked trial_num和FB_probs。2秒选择版不能混同Hartley的3秒发展研究版；reward count不是model-based指标，离线拟合另审。与Experiment Factory主库同lineage，不额外宣称新增battery。 [固定证据](https://github.com/expfactory-experiments/two-stage-decision/blob/19f1ff59c61157f8b8b5f3706689ea344baf0603/experiment.js)
- **元认知与信心 — [embodied-computation-group/dg-metacognition](https://github.com/embodied-computation-group/dg-metacognition)**：取语义trivia的2AFC→信心流程、choice/confidence双RT与2-down1-up。只细审GDP/热量共用路径，不称全电池已审；图像、seed和HMeta-d分析另核。平均信心不是元认知能力，更新历史GDP题材也会改变任务。 [固定证据](https://github.com/embodied-computation-group/dg-metacognition/blob/0c38aba4eb720a143d126b7c7d4c313a900bc536/tasks/metacognition_battery/trivia_task/taskcode/runtask/runTrial.m#L1-L164)

## 技术底座与相关生态

**[jsPsych](https://github.com/jspsych/jsPsych)**优先作为TS输入/RT、随机化、timeline生命周期和数据结构参考，不作为已验证电池。setSeed仍须主动保存seed与生成顺序，并处理全局Math.random影响。React生命周期、失焦invalid和持久化不是框架名称自带的保证。[固定证据](https://github.com/jspsych/jsPsych/blob/5887b4a50f71fe4b93254754956ea488b0a0c16e/packages/jspsych/src/modules/randomization.ts)

- jsPsych核心、timelines和contrib分别是框架、模板与插件；不当三个完整电池。
- PsychoPy/PsychoJS、OpenSesame/OSWeb、Expyriment/stash是框架/运行时/示例分工，不混计独立测验。
- Experiment Factory旧合集与两个独立任务代表共享lineage；同范式不重复宣称新增覆盖。
- CNTRACS仓四个本仓任务，effort只是链接独立仓；气球努力只在task-effort计一次实现。

## 完整简明矩阵

每行是一仓，不是一项已入库任务。`统/原`为统一取用优先级/原lane评级；F为框架lane、T为研究任务库lane、B为浏览器lane。完整观察、原评级理由、审查范围和证据见[sources.json](sources.json)，同口径扁平表见[sources.csv](sources.csv)。

### 任务与完整电池

| 仓库 | 统/原 | 实际任务或组件 | 固定快照与UTC日期 | 代码许可摘要 | 建议用途与边界 |
|---|---|---|---|---|---|
| [baranan/minno-tasks](https://github.com/baranan/minno-tasks) | A/BA | IAT、BIAT、AMP等 | [`f8ceef0b9e`](https://github.com/baranan/minno-tasks/commit/f8ceef0b9ec5fcad878e14de2f9720baa8caeef4)<br>2026-05-10 | Apache-2.0；素材另核 | 主库；D变式scorer/无效规则 |
| [DiedrichsenLab/MultiTaskBattery](https://github.com/DiedrichsenLab/MultiTaskBattery) | A/TA | NBack、DemandGrid等 | [`d6f49f5688`](https://github.com/DiedrichsenLab/MultiTaskBattery/commit/d6f49f568872157c1180bf6b22dc5ba255771d79)<br>2026-10-25 | MIT；刺激另核 | 主库；24条含rest/运动 |
| [expfactory/expfactory-experiments](https://github.com/expfactory/expfactory-experiments) | A/FB | Flanker、Go/No-Go等 | [`49b8123f18`](https://github.com/expfactory/expfactory-experiments/commit/49b8123f18b26d94dfc010bb8a6ec7458b265e2e)<br>2023-06-16 | MIT | 主库；逐任务取配置/字段 |
| [flowersteam/cognitive-testbattery](https://github.com/flowersteam/cognitive-testbattery) | A/BB | MOT、Go/No-Go等七项 | [`58ba32fa8b`](https://github.com/flowersteam/cognitive-testbattery/commit/58ba32fa8b582bedac65ef1c037c9974303dbf5c)<br>2024-05-06 | MIT；FIGRIM/字体另核 | 主库；研究设计与动态视觉 |
| [manybrainsproject/TestMyBrainCodeRepo](https://github.com/manybrainsproject/TestMyBrainCodeRepo) | A/BA | Flanker、MRMET等16目录 | [`ec09ea0d35`](https://github.com/manybrainsproject/TestMyBrainCodeRepo/commit/ec09ea0d35779bb39997131313dfd1380ee34922)<br>2026-05-22 | LGPLv3；刺激默认BY-SA | 主库；0–100不是百分位 |
| [stmueller/pebl](https://github.com/stmueller/pebl) | A/FB | Flanker、Corsi等 | [`eb22a0725d`](https://github.com/stmueller/pebl/commit/eb22a0725d765a0597a4905920ad3c603b1c9ae8)<br>2026-05-02 | GPLv2；任务/音频另核 | 主库；默认计分逐项核对 |
| [expfactory-experiments/two-stage-decision](https://github.com/expfactory-experiments/two-stage-decision) | A/BA | 两阶段决策 | [`19f1ff59c6`](https://github.com/expfactory-experiments/two-stage-decision/commit/19f1ff59c61157f8b8b5f3706689ea344baf0603)<br>2021-11-10 | MIT；图像另核 | 专题；转移/奖励轨迹 |
| [lnccbrown/task-effort](https://github.com/lnccbrown/task-effort) | A/TA | 气球努力/奖励 | [`8102308fc2`](https://github.com/lnccbrown/task-effort/commit/8102308fc2a7c0e8ec15dae5d44bd5ca49c181ba)<br>2022-10-20 | MIT | 专题；状态/比例奖赏，非BART |
| [nwrim/continuous_recognition_task_jsPsych](https://github.com/nwrim/continuous_recognition_task_jsPsych) | A/TA | 连续再认 | [`b4ad68e537`](https://github.com/nwrim/continuous_recognition_task_jsPsych/commit/b4ad68e5376ee7256763abb622cf06470514edf5)<br>2025-05-22 | 代码MIT；OMI NC-SA | 专题；序列和HR/FAR/CRR |
| [expyriment/expyriment-stash](https://github.com/expyriment/expyriment-stash) | B/FB | Simon、整卡口头Stroop | [`6340973695`](https://github.com/expyriment/expyriment-stash/commit/6340973695539704526bd2ed2aad18a9481bff48)<br>2026-01-29 | GPL-3.0 | 同名任务形态不能混同 |
| [jspsych/jspsych-timelines](https://github.com/jspsych/jspsych-timelines) | B/FA | Go/No-Go、Stroop、Flanker | [`8c93b6a465`](https://github.com/jspsych/jspsych-timelines/commit/8c93b6a465083a40b66a0c32cba902a65edda01c)<br>2026-07-04 | MIT | 配套模板；部分协议/计分待补 |
| [laureate-institute-for-brain-research/StimTool3](https://github.com/laureate-institute-for-brain-research/StimTool3) | B/TB | Horizon、规划等 | [`bc26881f66`](https://github.com/laureate-institute-for-brain-research/StimTool3/commit/bc26881f66f8798cf019c2c703fd1338b2ac8209)<br>2026-09-17 | GPL-3.0 | schedule/事件/奖励，剥离硬件 |
| [NCMlab/CognitiveTasks](https://github.com/NCMlab/CognitiveTasks) | B/TB | WCST、记忆/执行 | [`80efeaeee9`](https://github.com/NCMlab/CognitiveTasks/commit/80efeaeee934bb7b999134e3715d8b7f84c70532)<br>2022-08-01 | MIT；部分题材缺失 | 规则参考，非标准临床WCST |

### 框架与技术参考

| 仓库 | 统/原 | 实际任务或组件 | 固定快照与UTC日期 | 代码许可摘要 | 建议用途与边界 |
|---|---|---|---|---|---|
| [jspsych/jsPsych](https://github.com/jspsych/jsPsych) | A/FA | 输入/seed；Flanker教学 | [`5887b4a50f`](https://github.com/jspsych/jsPsych/commit/5887b4a50f71fe4b93254754956ea488b0a0c16e)<br>2026-10-10 | MIT | 技术底座，不是效度认证 |
| [expyriment/expyriment](https://github.com/expyriment/expyriment) | B/FB | 原生框架；例子另仓 | [`aceda89c61`](https://github.com/expyriment/expyriment/commit/aceda89c611e84136b069981ef642cf84cb25b52)<br>2026-08-18 | GPL-3.0 | 时钟/设计技术参考 |
| [FelixHenninger/lab.js](https://github.com/FelixHenninger/lab.js) | B/FB | Stroop模板 | [`b8206ad7e5`](https://github.com/FelixHenninger/lab.js/commit/b8206ad7e558476a7222adc91c0bc184329832d9)<br>2025-10-30 | core Apache；Builder AGPL | 分清core/Builder/任务/素材 |
| [jspsych/jspsych-contrib](https://github.com/jspsych/jspsych-contrib) | B/FB | Corsi、spatial n-back | [`f5f3d155e6`](https://github.com/jspsych/jspsych-contrib/commit/f5f3d155e628417b1e9874dd94e990943432bca6)<br>2026-09-16 | 逐包；所审MIT | 审具体plugin，不当完整span协议 |
| [open-cogsci/OpenSesame](https://github.com/open-cogsci/OpenSesame) | B/FB | SST、attentional blink | [`5b2479d556`](https://github.com/open-cogsci/OpenSesame/commit/5b2479d556996a5b628e9526eba4a922196a1d84)<br>2026-10-08 | GPL-3.0 | 有论文和变式说明；取协议 |
| [open-cogsci/osweb](https://github.com/open-cogsci/osweb) | B/FB | Posner；浏览器runtime | [`928e1a29cd`](https://github.com/open-cogsci/osweb/commit/928e1a29cdcea6ff549522c83c1f327f59ec5ded)<br>2025-10-05 | GPL-3.0 | 不整包迁入React |
| [psychopy/psychojs](https://github.com/psychopy/psychojs) | B/FB | 浏览器运行时 | [`075160256e`](https://github.com/psychopy/psychojs/commit/075160256e8ffcdcc7d2f350e96cfbffbdf4f358)<br>2025-10-24 | MIT | 技术参考，本仓不是任务库 |
| [psychopy/psychopy](https://github.com/psychopy/psychopy) | B/FB | Builder Stroop | [`444dc5c490`](https://github.com/psychopy/psychopy/commit/444dc5c4902589f68bd8106cef804d53784f5bec)<br>2026-10-22 | GPL-3.0及例外 | 协议/技术参考，不直接转React |

### 论文复现与方法参考

| 仓库 | 统/原 | 实际任务或组件 | 固定快照与UTC日期 | 代码许可摘要 | 建议用途与边界 |
|---|---|---|---|---|---|
| [nivlab/jspsych-demos](https://github.com/nivlab/jspsych-demos) | A/BB | bandit、Horizon、PGNG等 | [`a819c4cae2`](https://github.com/nivlab/jspsych-demos/commit/a819c4cae29e629508847a0abe5cd1e5e36baa42)<br>2026-07-17 | CC BY-NC-SA 4.0 | 主库；部分需自备trial表 |
| [embodied-computation-group/dg-metacognition](https://github.com/embodied-computation-group/dg-metacognition) | A/TA | 2AFC＋信心 | [`0c38aba4eb`](https://github.com/embodied-computation-group/dg-metacognition/commit/0c38aba4eb720a143d126b7c7d4c313a900bc536)<br>2024-06-28 | MIT；图像另核 | 专题；阶梯/信心/元认知区分 |
| [ContextLab/brainfit-task](https://github.com/ContextLab/brainfit-task) | B/BB | 自然情境/联结/空间记忆 | [`be0a1707c7`](https://github.com/ContextLab/brainfit-task/commit/be0a1707c7c178efc037c90254f709f5a4450bcb)<br>2021-10-22 | 自写代码未确认许可 | 取参数，不搬原账号依赖 |
| [expfactory-experiments/stop-signal](https://github.com/expfactory-experiments/stop-signal) | B/BB | Stop-Signal | [`04796ee87b`](https://github.com/expfactory-experiments/stop-signal/commit/04796ee87b083d7a0bd5f8a9ee722ea4d60d5c8e)<br>2021-11-10 | MIT | SSD/事件；未见SSRT估计器 |
| [hartleylabnyu/online_two_step_replication](https://github.com/hartleylabnyu/online_two_step_replication) | B/BB | two-step、MaRs-IB | [`f0a561ef15`](https://github.com/hartleylabnyu/online_two_step_replication/commit/f0a561ef15b7b55e1956669cc507a03226e1d269)<br>2021-02-25 | 自写代码未确认许可 | 发展研究3秒版，不混2秒版 |
| [lucklab/CNTRACS_tasks_public](https://github.com/lucklab/CNTRACS_tasks_public) | B/TB | 精度WM、RL-WM等 | [`e641a9e0df`](https://github.com/lucklab/CNTRACS_tasks_public/commit/e641a9e0dfdc50d15a227833fc89bd80f3edf95a)<br>2023-05-22 | GPL-3.0 | 方法/参数模型；seed/保存待核 |
| [mahiluthra/working_memory_tests](https://github.com/mahiluthra/working_memory_tests) | B/BB | digit/operation/symmetry span | [`c4700e7765`](https://github.com/mahiluthra/working_memory_tests/commit/c4700e7765833364d2c913667b99063afbaa2437)<br>2022-11-24 | 自写代码未确认许可 | 四维WM参考；计分/保存待补 |
| [Tuuleh/masters-battery](https://github.com/Tuuleh/masters-battery) | B/BB | 旋转、span、TOL、Flanker | [`ff0e485774`](https://github.com/Tuuleh/masters-battery/commit/ff0e485774e8681fb76f38bf784a3bee78951a09)<br>2015-01-08 | README局部复用声明 | 历史方法；换游戏美术/旧栈 |
| [vrtliceralde/squared_jspsych](https://github.com/vrtliceralde/squared_jspsych) | B/TB | 三种Squared任务 | [`945ad7309c`](https://github.com/vrtliceralde/squared_jspsych/commit/945ad7309c2e4d47953f18f62a206968870be27a)<br>2023-09-04 | CC BY-NC-SA 4.0 | 优质注意控制计分；许可另列 |

### 暂不直接采用

| 仓库 | 统/原 | 实际任务或组件 | 固定快照与UTC日期 | 代码许可摘要 | 建议用途与边界 |
|---|---|---|---|---|---|
| [argira2030/stroop-attention](https://github.com/argira2030/stroop-attention) | C/BC | Stroop及其他HTML | [`e16b4abf0d`](https://github.com/argira2030/stroop-attention/commit/e16b4abf0d61dc5cb9ab23f56147e3b3f220bedb)<br>2026-04-24 | MIT | 默认外发与local-only冲突 |
| [benkyli/Emotional-Stroop-Experiment](https://github.com/benkyli/Emotional-Stroop-Experiment) | C/FC | 情绪/标准Stroop | [`2dd5fff7c4`](https://github.com/benkyli/Emotional-Stroop-Experiment/commit/2dd5fff7c4fe23e970c2d80dba7f37c743e835f0)<br>2025-03-20 | 未确认明确许可 | 第三方PsyToolkit，非官方 |
| [NYUCCL/psiTurk](https://github.com/NYUCCL/psiTurk) | C/FC | 9-trial Stroop | [`af007240c6`](https://github.com/NYUCCL/psiTurk/commit/af007240c6f4ee682e63dce0f40ca272913e2a18)<br>2022-10-31 | MIT | 保留索引；不选本例作成品 |
| [rakesh-sengupta/DyscalcBattery](https://github.com/rakesh-sengupta/DyscalcBattery) | C/BC | 数比较、数量感等 | [`a8f14f9a54`](https://github.com/rakesh-sengupta/DyscalcBattery/commit/a8f14f9a5423883409b8bf5306f62964776e6280)<br>2026-05-15 | MIT | 有文献线索；评分/恢复缺口 |

## 如何理解统一分级

- **A**是特定用途下优先细审来源，分主库、专题、技术底座；不授予原代码直接采用资格。
- **B**有明确补充价值，先选具体变式或缩小范围；不是科学质量差。例如CNTRACS适合精度模型/RL-WM，Squared适合注意控制替代计分，Hartley适合发展研究参数，BrainFit适合自然情境记忆。
- **C**是当前目标下暂不采用成品/源码，不阻断可靠文献支持的独立自研。

原lane均保留。PEBL、Experiment Factory合集、NivLab和Flower由原B协调为统一A，原因是“可反复挖掘的主库/方法价值”应与“原runtime直接复用成熟度”分开；其工程风险没有删除。jspsych-timelines由原A列统一B，是作为已优先jsPsych底座的配套模板，且arrow-flanker尚有协议/计分缺口，不重复扩大主库数量。没有字母平均或伪造精确分数。

## 许可和证据边界

**代码与素材分开。** TestMyBrain的LGPLv3代码与默认BY-SA刺激、lab.js的Apache core与AGPL Builder、contrib的逐包许可、PEBL的核心/任务/音频，以及continuous-recognition的MIT代码与OMI NC-SA图像均分别记录。Niv/Squared不能因vendor jsPsych是MIT而将整仓变成MIT。许可未知不等于允许复制；替换素材也可能改变难度，仍需核对协议。

**缺陷按证据强度说。** Flower首响应/长按、CNTRACS `Session`、NCM `self.sin.flip()`及部分PEBL边界是静态疑点，未运行复现。Argira已有默认main作答调用外部insert的静态路径；只说明特定依赖/流程条件下会尝试外发，不宣称上传成功。Dyscalc的官方预印本线索存在，C来自当前代码树与评分/保存承诺缺口，不是否认文献或范式。

**没找到不是不存在。** “未见CI”“未核seed”“未找到独立素材许可”仅限本次文件树/所列源码的观察；抽查任务的结论不外推整个库。软件引用、方法论文、具体实现效度和中文人群常模是不同证据层。

## 进一步采用前的限定工作

1. 先选单个变式，写协议卡：构念/原文、刺激、练习、条件比例、截止/停止、计分与RT排除。
2. 分别决定代码复用或文献独立实现；逐项核对代码、图像、字体、音频、词表、翻译授权。
3. 固定SHA、配置、seed/完整trial manifest、raw字段和评分版本；奖励数、平均信心、教学分数不能冒充目标构念指标。
4. 只有获准恢复研发后，才做golden data及正确/错误/遗漏/长按/退出/失焦/保存失败/时序检查；本轮没有执行这些工作。

下一轮可补查[ResearchKit](https://github.com/ResearchKit/ResearchKit)与[ResearchStack](https://github.com/ResearchStack/ResearchStack)的移动端任务/框架适用性。两仓**未纳入本轮固定快照审查、34仓或A类数量**，不据此承诺移动端适配。

## 项目基线与本轮边界

- 基线main ff8471为24项真实任务；fake仅源码计数，不计真实任务。
- 旧Notion18个候选页与34个来源repo、已入库任务是不同口径。
- 内容分支尚无本轮源码提交；visualsearch为未提交本地草稿，不计入本轮入库。此前后端12/前端22的局部检查不是本source review的新执行结果；全无效FINAL仍有400缺口，保持DRAFT及recommended=false。 recommended=false只是推荐标志，不是授权锁；该草稿仍暂停接入。
- Survey适配由PR356负责。本轮只选源，不恢复编码、不承诺部署或CI通过。

## 文件

- [sources.json](sources.json)：完整结构化评审、固定SHA/日期、证据、原lane评级与协调理由。
- [sources.csv](sources.csv)：同一34仓的筛选/比较用扁平表。
- [review-method.md](review-method.md)：方法、实查深度、许可与一致性核验。
